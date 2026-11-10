// HTTP smoke test of the link-key access matrix against a running server (dev or production preview).
// Needs the server's LOCAL Supabase in .env (SUPABASE_URL on 127.0.0.1/localhost, like the server): it creates its own
// two restaurants with one event each straight in the database (multi-tenant-events: nothing in the app creates events
// yet), runs every section on event A and proves at the end that A's links never reach event B. Staff accounts of its
// own (e-mails tagged with the run, so a throttle of an earlier run never applies) check login, sessions, the panel
// guard, the platform panel (which adds restaurants of the run) and the admin's logged support access to them. Other
// events and accounts in the database are never touched, so it runs again and again on the same database.
// Zero dependencies on purpose. Usage: BASE_URL=http://localhost:4321 npm run smoke

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import { performance } from "node:perf_hooks";
import { TextDecoder, TextEncoder } from "node:util";
import {
  addMembership,
  createEvent,
  createRestaurant,
  ensureStaffAccount,
  issueStaffLink,
  listEvents,
  listRestaurants,
  PlatformError,
  readDbEnv,
  readEventKeys,
  removeMembership,
} from "./lib/platform.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const NO_ACCESS_TEXT = "Ta strona jest dostępna tylko przez link od organizatora.";
const RUN_TAG = randomBytes(4).toString("hex");
const EVENT_NAME = `Kolacja smoke A ${RUN_TAG}`;
const OTHER_EVENT_NAME = `Kolacja smoke B ${RUN_TAG}`;
const KEY = "[A-Za-z0-9_-]{24}";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
  if (!ok) failed++;
}

// `json` sends a JSON body; `rawBody` sends the string as is (with a JSON content type); `form` sends the fields
// form-encoded (like an HTML form); `cookie` is the Cookie header; `noOrigin` leaves the Origin header out;
// `extraHeaders` are added.
async function request(
  path,
  { method = "GET", json, rawBody, form, cookie, noOrigin = false, extraHeaders = {} } = {},
) {
  const headers = { ...(noOrigin ? {} : { Origin: BASE_URL }), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders };
  let body;
  if (json !== undefined || rawBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = rawBody ?? JSON.stringify(json);
  } else if (form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  const response = await fetch(BASE_URL + path, { method, redirect: "manual", headers, body });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON (pages)
  }
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    referrerPolicy: response.headers.get("referrer-policy") ?? "",
    setCookie: response.headers.get("set-cookie") ?? "",
    frameOptions: response.headers.get("x-frame-options") ?? "",
    retryAfter: response.headers.get("retry-after") ?? "",
    body: text,
    data,
  };
}

// Raw bytes in and out (plan image upload and download).
async function requestBytes(path, { method = "GET", body, contentType, cookie } = {}) {
  const headers = { Origin: BASE_URL, ...(cookie ? { Cookie: cookie } : {}) };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const response = await fetch(BASE_URL + path, { method, redirect: "manual", headers, body });
  const bytes = new Uint8Array(await response.arrayBuffer());
  let data = null;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // not JSON (images)
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    nosniff: response.headers.get("x-content-type-options") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    bytes,
    data,
  };
}

function sameBytes(a, b) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function finish() {
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll smoke checks passed");
  process.exit(failed ? 1 : 0);
}

// 1. The home page creates nothing: it only says access is by link (no form, no event data).
const home = await request("/");
check("home renders", home.status === 200, String(home.status));
check(
  "home says access is by link only and offers no event creation",
  home.body.includes("Dostęp tylko przez link od organizatora") &&
    !home.body.includes("Utwórz wydarzenie") &&
    !home.body.includes("/api/event"),
);

// 2. The old one-time creation endpoint is gone.
const oldCreate = await request("/api/event", { method: "POST" });
check("the old event creation endpoint is gone", oldCreate.status === 404, String(oldCreate.status));

// 3. Two restaurants with one event each, created in the LOCAL database (refused anywhere else). Every section below
// runs on A; section 23d checks B, section 25 gives both restaurants staff accounts.
let platformEnv;
let restaurantA;
let restaurantB;
let eventA;
let eventB;
try {
  platformEnv = readDbEnv({ requireLocal: true });
  restaurantA = await createRestaurant(platformEnv, `Restauracja smoke A ${RUN_TAG}`);
  restaurantB = await createRestaurant(platformEnv, `Restauracja smoke B ${RUN_TAG}`);
  eventA = await createEvent(platformEnv, restaurantA.id, EVENT_NAME, { allModules: true });
  eventB = await createEvent(platformEnv, restaurantB.id, OTHER_EVENT_NAME, { allModules: true });
} catch (error) {
  check(
    "smoke events are created in the local database",
    false,
    error instanceof PlatformError ? error.message : String(error),
  );
  finish();
}
console.log(`      database ${platformEnv.host}: events ${String(eventA.id)} (A) and ${String(eventB.id)} (B)`);

// An „ops” owner of A with a panel session (client-restaurant-split): since S-14 the full reset, the AI costs and the
// tablet link rotation live in the panel, so sections 20–24 use it there. Its membership is removed before section 25,
// which builds the team of A from scratch (and sections 26/28 count it).
const opsPanel = `/api/panel/events/${String(eventA.id)}`;
let opsCookie = "";
let opsAccount;
try {
  opsAccount = await ensureStaffAccount(platformEnv, {
    email: `ops-${RUN_TAG}@smoke.stolik`,
    displayName: "Smoke ops",
  });
  await addMembership(platformEnv, restaurantA.id, opsAccount.id, "owner");
  const opsInvite = await issueStaffLink(platformEnv, opsAccount.id, "invite", BASE_URL);
  const opsRedeemed = await request("/api/auth/password-link", {
    method: "POST",
    form: { token: opsInvite.token, password: "smoke-ops-haslo-1", repeat: "smoke-ops-haslo-1" },
  });
  const opsToken = /(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/.exec(opsRedeemed.setCookie)?.[1];
  opsCookie = opsToken ? `kp-session=${opsToken}` : "";
} catch (error) {
  check("the ops owner of A is created", false, error instanceof PlatformError ? error.message : String(error));
}
check("the ops owner of A has a panel session", opsCookie !== "");
const asOps = (options = {}) => ({ ...options, cookie: opsCookie });
const organizerKey = eventA.organizerKey;
const tvKey = eventA.tvKey;
check(
  "the two smoke events have their own keys",
  new Set([
    eventA.organizerKey,
    eventA.tvKey,
    eventA.restaurantKey,
    eventB.organizerKey,
    eventB.tvKey,
    eventB.restaurantKey,
  ]).size === 6 && [organizerKey, tvKey].every((key) => new RegExp(`^${KEY}$`).test(key)),
);

// 4. A gets the starter question base, like `npm run event:create` gives it.
const starterLoad = await request(`/api/o/${organizerKey}/questions/starter`, { method: "POST" });
check(
  "event A gets the starter question base",
  starterLoad.status === 200 && starterLoad.data?.added === 90 && starterLoad.data.starterMissing === 0,
  `${starterLoad.status} ${String(starterLoad.data?.added)}`,
);

// 5. Organizer view opens with private headers and shows the TV link.
const organizer = await request(`/o/${organizerKey}`);
check("organizer view renders", organizer.status === 200, String(organizer.status));
check("organizer view is not cacheable", organizer.cacheControl.includes("no-store"), organizer.cacheControl);
check("organizer view sends no referrer", organizer.referrerPolicy === "no-referrer", organizer.referrerPolicy);
check(
  "organizer view shows its event and the TV link",
  organizer.body.includes(EVENT_NAME) && organizer.body.includes(`/tv/${tvKey}`),
);

// 6. TV view opens and never contains the organizer key.
const tv = await request(`/tv/${tvKey}`);
check("TV view renders", tv.status === 200, String(tv.status));
check("TV view does not contain the organizer key", !tv.body.includes(organizerKey));

// 7. Every page without a valid key of the right role gets the same 404 no-access page with no data.
const unknownKey = randomBytes(18).toString("base64url");
const deniedPages = [
  "/o/garbage",
  `/o/${unknownKey}`,
  `/o/${tvKey}`,
  "/tv/garbage",
  `/tv/${unknownKey}`,
  `/tv/${organizerKey}`,
  `/g/${organizerKey}`,
  `/g/${tvKey}`,
  "/dashboard",
  "/auth/signin",
  "/nie-ma-takiej-strony",
];
const deniedBodies = new Set();
for (const path of deniedPages) {
  const res = await request(path);
  const leaks = [organizerKey, tvKey, EVENT_NAME].filter((secret) => res.body.includes(secret));
  check(
    `no access: ${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body.includes(NO_ACCESS_TEXT) && leaks.length === 0,
    `${res.status}${leaks.length ? ` leaks ${leaks.length} value(s)` : ""}`,
  );
  if (path.startsWith("/o/") || path.startsWith("/tv/") || path.startsWith("/g/")) {
    check(`no access is not cacheable: ${path.split("/")[1]}`, res.cacheControl.includes("no-store"), res.cacheControl);
    deniedBodies.add(res.body);
  }
}
check(
  "denials for malformed, unknown and cross-role keys are identical",
  deniedBodies.size === 1,
  `${deniedBodies.size} variant(s)`,
);

// 8. API routes under a key prefix deny with JSON 404.
for (const path of [`/api/o/${tvKey}/x`, "/api/tv/garbage", `/api/g/${organizerKey}`]) {
  const res = await request(path);
  check(
    `API no access: ${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" }),
    `${res.status} ${res.body}`,
  );
}

// 9. Organizer guest API (S-01): guests, groups and absences; every mutation answers with the whole list.
const api = `/api/o/${organizerKey}`;
const GUEST_NAMES = ["Ania Smoke", "Kuba Smoke", "Ola Smoke"];
const errorOf = (res) => res.data?.error ?? res.body;
const guestNamed = (res, name) => res.data?.guests?.find((guest) => guest.displayName === name);

const emptyList = await request(`${api}/guests`);
check(
  "guest list starts empty",
  emptyList.status === 200 && emptyList.body === JSON.stringify({ guests: [], groups: [] }),
  `${emptyList.status} ${emptyList.body}`,
);
check("guest API is not cacheable", emptyList.cacheControl.includes("no-store"), emptyList.cacheControl);

const pasted = await request(`${api}/guests`, {
  method: "POST",
  json: { text: `${GUEST_NAMES[0]}\n- ${GUEST_NAMES[1]}\n\n${GUEST_NAMES[2]}` },
});
check(
  "pasting 3 lines adds 3 guests",
  pasted.status === 201 && pasted.data?.added === 3 && pasted.data?.guests?.length === 3,
  `${pasted.status} ${pasted.body}`,
);
const [ania, kuba, ola] = GUEST_NAMES.map((name) => guestNamed(pasted, name));
if (!ania || !kuba || !ola) {
  check("pasted guests are listed by name", false, pasted.body);
  finish();
}

const pastedAgain = await request(`${api}/guests`, { method: "POST", json: { text: GUEST_NAMES.join("\n") } });
check(
  "pasting existing names is refused as a whole",
  pastedAgain.status === 409 && errorOf(pastedAgain).includes("Już są na liście"),
  `${pastedAgain.status} ${errorOf(pastedAgain)}`,
);
const blank = await request(`${api}/guests`, { method: "POST", json: { text: " \n\t" } });
check(
  "blank paste is refused",
  blank.status === 400 && errorOf(blank) === "Wpisz co najmniej jedno imię.",
  `${blank.status} ${errorOf(blank)}`,
);
const tooLong = await request(`${api}/guests`, { method: "POST", json: { text: `Ewa Smoke\n${"x".repeat(41)}` } });
check(
  "too-long line is reported and nothing is added",
  tooLong.status === 400 && tooLong.data?.problems?.length === 1 && tooLong.data.problems[0].startsWith("Linia 2:"),
  `${tooLong.status} ${tooLong.body}`,
);
const badJson = await request(`${api}/guests`, { method: "POST", rawBody: "{" });
check(
  "malformed JSON is refused",
  badJson.status === 400 && errorOf(badJson) === "Nieprawidłowe dane.",
  `${badJson.status} ${badJson.body}`,
);

const pair = await request(`${api}/groups`, { method: "POST", json: { guestIds: [ania.id, kuba.id] } });
check(
  "a pair is created",
  pair.status === 201 && pair.data?.groups?.length === 1 && guestNamed(pair, GUEST_NAMES[0])?.groupId !== null,
  `${pair.status} ${pair.body}`,
);
const single = await request(`${api}/groups`, { method: "POST", json: { guestIds: [ola.id] } });
check(
  "a one-person group is refused",
  single.status === 400 && errorOf(single) === "Grupa musi mieć od 2 do 5 osób.",
  `${single.status} ${errorOf(single)}`,
);
const regroup = await request(`${api}/groups`, { method: "POST", json: { guestIds: [kuba.id, ola.id] } });
check("a grouped guest cannot join another group", regroup.status === 409, `${regroup.status} ${errorOf(regroup)}`);

const absent = await request(`${api}/guests/${ola.id}`, { method: "PATCH", json: { isAbsent: true } });
check(
  "a guest is marked absent",
  absent.status === 200 && guestNamed(absent, GUEST_NAMES[2])?.isAbsent === true,
  `${absent.status} ${absent.body}`,
);
const renameTaken = await request(`${api}/guests/${ola.id}`, { method: "PATCH", json: { displayName: "ANIA smoke" } });
check(
  "renaming to a taken name is refused",
  renameTaken.status === 409,
  `${renameTaken.status} ${errorOf(renameTaken)}`,
);
const setGroup = await request(`${api}/guests/${ola.id}`, {
  method: "PATCH",
  json: { groupId: pair.data?.groups?.[0]?.id },
});
check("group membership cannot be patched", setGroup.status === 400, `${setGroup.status} ${errorOf(setGroup)}`);
const unknownGuest = await request(`${api}/guests/999999999`, { method: "PATCH", json: { isAbsent: true } });
check(
  "unknown guest is not found",
  unknownGuest.status === 404 && errorOf(unknownGuest) === "Nie znaleziono gościa.",
  `${unknownGuest.status} ${errorOf(unknownGuest)}`,
);

const removed = await request(`${api}/guests/${kuba.id}`, { method: "DELETE" });
check(
  "deleting a pair member dissolves the pair",
  removed.status === 200 &&
    removed.data?.guests?.length === 2 &&
    removed.data?.groups?.length === 0 &&
    guestNamed(removed, GUEST_NAMES[0])?.groupId === null,
  `${removed.status} ${removed.body}`,
);
const pair2 = await request(`${api}/groups`, { method: "POST", json: { guestIds: [ania.id, ola.id] } });
const pair2Id = pair2.data?.groups?.[0]?.id;
const dissolved = await request(`${api}/groups/${pair2Id}`, { method: "DELETE" });
check(
  "a group is dissolved",
  pair2.status === 201 && dissolved.status === 200 && dissolved.data?.groups?.length === 0,
  `${pair2.status} ${dissolved.status} ${dissolved.body}`,
);
const dissolvedAgain = await request(`${api}/groups/${pair2Id}`, { method: "DELETE" });
check(
  "dissolving a missing group is not found",
  dissolvedAgain.status === 404 && errorOf(dissolvedAgain) === "Nie znaleziono grupy.",
  `${dissolvedAgain.status} ${errorOf(dissolvedAgain)}`,
);

// The TV key opens none of it, and the TV view shows no guest data in S-01.
const tvApi = `/api/o/${tvKey}`;
for (const [method, path, json] of [
  ["GET", `${tvApi}/guests`],
  ["POST", `${tvApi}/guests`, { text: "Intruz" }],
  ["PATCH", `${tvApi}/guests/${ania.id}`, { isAbsent: true }],
  ["DELETE", `${tvApi}/guests/${ania.id}`],
  ["POST", `${tvApi}/groups`, { guestIds: [ania.id, ola.id] }],
]) {
  const res = await request(path, { method, json });
  check(
    `guest API with the TV key: ${method} ${path.replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" }),
    `${res.status} ${res.body}`,
  );
}
const tvAfter = await request(`/tv/${tvKey}`);
check(
  "TV view shows no guest names",
  tvAfter.status === 200 && GUEST_NAMES.every((name) => !tvAfter.body.includes(name)),
  String(tvAfter.status),
);
const listAfter = await request(`${api}/guests`);
check(
  "TV-key requests changed nothing",
  listAfter.data?.guests?.length === 2 &&
    listAfter.data.guests.every((guest) => guest.displayName !== "Intruz") &&
    guestNamed(listAfter, GUEST_NAMES[0])?.isAbsent === false &&
    listAfter.data.groups.length === 0,
  listAfter.body,
);

// 10. Guest page (S-01): organizer only, rendered with the current list; the shell links to it with counts.
const guestPage = await request(`/o/${organizerKey}/goscie`);
check(
  "guest page renders the list",
  guestPage.status === 200 &&
    guestPage.body.includes("Goście i grupy") &&
    guestPage.body.includes(GUEST_NAMES[0]) &&
    guestPage.body.includes(GUEST_NAMES[2]),
  String(guestPage.status),
);
check("guest page is not cacheable", guestPage.cacheControl.includes("no-store"), guestPage.cacheControl);
const tvGuestPage = await request(`/o/${tvKey}/goscie`);
check(
  "guest page with the TV key: no access, no guest data",
  tvGuestPage.status === 404 &&
    tvGuestPage.body.includes(NO_ACCESS_TEXT) &&
    GUEST_NAMES.every((name) => !tvGuestPage.body.includes(name)),
  String(tvGuestPage.status),
);
const shell = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the guest page with counts",
  shell.status === 200 && shell.body.includes(`/o/${organizerKey}/goscie`) && shell.body.includes("2 gości"),
  String(shell.status),
);

// 11. Venue API (S-02): plan image, rooms and tables; every mutation answers with the whole venue.
const TINY_PNG = new Uint8Array(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
);
const MAX_PLAN_BYTES = 4 * 1024 * 1024;
const ROOM_NAME = "Sala Główna Smoke";
const TABLE_NAME = "Okno Smoke";
const tableNamed = (res, name) => res.data?.tables?.find((table) => table.name === name);
const roomNamed = (res, name) => res.data?.rooms?.find((room) => room.name === name);

const emptyVenue = await request(`${api}/venue`);
check(
  "venue starts empty",
  emptyVenue.status === 200 &&
    emptyVenue.body === JSON.stringify({ plan: null, rooms: [], tables: [], chairPitch: 0.035 }),
  `${emptyVenue.status} ${emptyVenue.body}`,
);
check("venue API is not cacheable", emptyVenue.cacheControl.includes("no-store"), emptyVenue.cacheControl);
for (const path of [`${api}/plan/image`, `/api/tv/${tvKey}/plan/image`]) {
  const missing = await request(path);
  check(
    `no plan image yet: ${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    missing.status === 404 && errorOf(missing) === "Nie wgrano jeszcze planu.",
    `${missing.status} ${missing.body}`,
  );
}

const uploaded = await requestBytes(`${api}/plan`, { method: "PUT", body: TINY_PNG, contentType: "image/png" });
check(
  "a PNG plan is uploaded",
  uploaded.status === 200 &&
    uploaded.data?.plan?.mimeType === "image/png" &&
    uploaded.data.plan.byteSize === TINY_PNG.length &&
    Number.isInteger(uploaded.data.plan.version),
  `${uploaded.status} ${JSON.stringify(uploaded.data)}`,
);
for (const [who, path] of [
  ["organizer", `${api}/plan/image?v=1`],
  ["TV", `/api/tv/${tvKey}/plan/image`],
]) {
  const image = await requestBytes(path);
  check(
    `${who} gets the same plan image bytes`,
    image.status === 200 &&
      image.contentType === "image/png" &&
      image.nosniff === "nosniff" &&
      image.cacheControl.includes("no-store") &&
      sameBytes(image.bytes, TINY_PNG),
    `${image.status} ${image.contentType} ${image.bytes.length} B`,
  );
}
const html = await requestBytes(`${api}/plan`, {
  method: "PUT",
  body: new TextEncoder().encode("<!doctype html><script>alert(1)</script>"),
  contentType: "image/png",
});
check(
  "HTML sent as image/png is refused",
  html.status === 415 && html.data?.error === "Wgraj obraz PNG, JPEG albo WebP.",
  `${html.status} ${JSON.stringify(html.data)}`,
);
const oversized = new Uint8Array(MAX_PLAN_BYTES + 1);
oversized.set(TINY_PNG.subarray(0, 8));
const tooLarge = await requestBytes(`${api}/plan`, { method: "PUT", body: oversized, contentType: "image/png" });
check(
  "a plan over 4 MB is refused",
  tooLarge.status === 413 && tooLarge.data?.error === "Plik jest za duży — najwyżej 4 MB.",
  `${tooLarge.status} ${JSON.stringify(tooLarge.data)}`,
);
const emptyUpload = await requestBytes(`${api}/plan`, {
  method: "PUT",
  body: new Uint8Array(),
  contentType: "image/png",
});
check(
  "an empty upload is refused",
  emptyUpload.status === 400,
  `${emptyUpload.status} ${JSON.stringify(emptyUpload.data)}`,
);

const hall = await request(`${api}/rooms`, { method: "POST", json: { name: "Sala Smoke" } });
check(
  "a room is added",
  hall.status === 201 && hall.data?.rooms?.length === 1 && hall.data.plan?.mimeType === "image/png",
  `${hall.status} ${hall.body}`,
);
const hallId = roomNamed(hall, "Sala Smoke")?.id;
const hallAgain = await request(`${api}/rooms`, { method: "POST", json: { name: "SALA  smoke" } });
check(
  "a duplicate room name is refused",
  hallAgain.status === 409 && errorOf(hallAgain) === "Sala o tej nazwie już jest.",
  `${hallAgain.status} ${errorOf(hallAgain)}`,
);
const renamedHall = await request(`${api}/rooms/${hallId}`, { method: "PATCH", json: { name: ROOM_NAME } });
check("a room is renamed", renamedHall.status === 200 && Boolean(roomNamed(renamedHall, ROOM_NAME)), renamedHall.body);
const garden = await request(`${api}/rooms`, { method: "POST", json: { name: "Ogród Smoke" } });
const gardenId = roomNamed(garden, "Ogród Smoke")?.id;

const okno = await request(`${api}/tables`, {
  method: "POST",
  json: { roomId: hallId, name: TABLE_NAME, seatCount: 8, shape: "round", x: 0.25, y: 0.4 },
});
check(
  "a table is added with its pin",
  okno.status === 201 &&
    tableNamed(okno, TABLE_NAME)?.x === 0.25 &&
    tableNamed(okno, TABLE_NAME)?.y === 0.4 &&
    tableNamed(okno, TABLE_NAME)?.roomId === hallId,
  `${okno.status} ${okno.body}`,
);
const oknoId = tableNamed(okno, TABLE_NAME)?.id;
const oknoTwice = await request(`${api}/tables`, {
  method: "POST",
  json: { roomId: gardenId, name: "okno smoke", seatCount: 4, shape: "round", x: 0.5, y: 0.5 },
});
check(
  "a duplicate table name in another room is refused",
  oknoTwice.status === 409 && errorOf(oknoTwice) === "Stolik o tej nazwie już jest.",
  `${oknoTwice.status} ${errorOf(oknoTwice)}`,
);
const tooManySeats = await request(`${api}/tables`, {
  method: "POST",
  json: { roomId: gardenId, name: "Taras Smoke", seatCount: 31, shape: "round", x: 0.5, y: 0.5 },
});
check(
  "31 seats are refused (scale-150: 2 to 30)",
  tooManySeats.status === 400 && errorOf(tooManySeats) === "Stolik ma od 2 do 30 miejsc.",
  `${tooManySeats.status} ${errorOf(tooManySeats)}`,
);
const offPlan = await request(`${api}/tables`, {
  method: "POST",
  json: { roomId: gardenId, name: "Taras Smoke", seatCount: 4, shape: "round", x: 1.5, y: 0.5 },
});
check("a pin outside the plan is refused", offPlan.status === 400, `${offPlan.status} ${errorOf(offPlan)}`);
const reshaped = await request(`${api}/tables/${oknoId}`, {
  method: "PATCH",
  json: { seatCount: 6, shape: "rectangular" },
});
check(
  "a table is edited",
  reshaped.status === 200 &&
    tableNamed(reshaped, TABLE_NAME)?.seatCount === 6 &&
    tableNamed(reshaped, TABLE_NAME)?.shape === "rectangular",
  `${reshaped.status} ${reshaped.body}`,
);
const unknownTable = await request(`${api}/tables/999999999`, { method: "PATCH", json: { seatCount: 4 } });
check(
  "unknown table is not found",
  unknownTable.status === 404 && errorOf(unknownTable) === "Nie znaleziono stolika.",
  `${unknownTable.status} ${errorOf(unknownTable)}`,
);
const taras = await request(`${api}/tables`, {
  method: "POST",
  json: { roomId: gardenId, name: "Taras Smoke", seatCount: 4, shape: "round", x: 0.7, y: 0.2 },
});
const kominek = await request(`${api}/tables`, {
  method: "POST",
  // Sent like the editor's form: with the rotation (venue-drawing), normalized to 0..359.
  json: { roomId: gardenId, name: "Kominek Smoke", seatCount: 10, shape: "rectangular", x: 0.8, y: 0.8, rotation: 375 },
});
check(
  "a table is added with its rotation, as the editor's form sends it",
  kominek.status === 201 && tableNamed(kominek, "Kominek Smoke")?.rotation === 15,
  `${kominek.status} ${kominek.body}`,
);
const tarasId = tableNamed(taras, "Taras Smoke")?.id;
const tarasDeleted = await request(`${api}/tables/${tarasId}`, { method: "DELETE" });
check(
  "a table is deleted",
  kominek.status === 201 && tarasDeleted.status === 200 && !tableNamed(tarasDeleted, "Taras Smoke"),
  `${tarasDeleted.status} ${tarasDeleted.body}`,
);
const gardenDeleted = await request(`${api}/rooms/${gardenId}`, { method: "DELETE" });
check(
  "deleting a room deletes its tables",
  gardenDeleted.status === 200 &&
    gardenDeleted.data?.rooms?.length === 1 &&
    gardenDeleted.data.tables.length === 1 &&
    Boolean(tableNamed(gardenDeleted, TABLE_NAME)),
  `${gardenDeleted.status} ${gardenDeleted.body}`,
);

// The TV key opens only the plan image, never the organizer venue API; the organizer key is not a TV key.
const tvVenueApi = `/api/o/${tvKey}`;
for (const [method, path, json] of [
  ["GET", `${tvVenueApi}/venue`],
  ["GET", `${tvVenueApi}/plan/image`],
  ["POST", `${tvVenueApi}/rooms`, { name: "Intruz" }],
  ["PATCH", `${tvVenueApi}/rooms/${hallId}`, { name: "Intruz" }],
  ["PATCH", `${tvVenueApi}/venue`, { chairPitch: 0.05 }],
  ["POST", `${tvVenueApi}/tables`, { roomId: hallId, name: "Intruz", seatCount: 4, shape: "round", x: 0.5, y: 0.5 }],
  ["DELETE", `${tvVenueApi}/tables/${oknoId}`],
  ["DELETE", `${tvVenueApi}/rooms/${hallId}`],
  ["GET", `/api/tv/${organizerKey}/plan/image`],
]) {
  const res = await request(path, { method, json });
  check(
    `venue API with the wrong key: ${method} ${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" }),
    `${res.status} ${res.body}`,
  );
}
const tvUpload = await requestBytes(`${tvVenueApi}/plan`, { method: "PUT", body: TINY_PNG, contentType: "image/png" });
check("the TV key cannot upload a plan", tvUpload.status === 404, String(tvUpload.status));
const venueAfter = await request(`${api}/venue`);
check(
  "wrong-key venue requests changed nothing",
  venueAfter.data?.rooms?.length === 1 &&
    venueAfter.data.rooms[0].name === ROOM_NAME &&
    venueAfter.data.tables.length === 1 &&
    venueAfter.data.tables[0].name === TABLE_NAME &&
    venueAfter.data.plan?.byteSize === TINY_PNG.length,
  venueAfter.body,
);

// 12. Rooms-and-tables page (S-02): organizer only, rendered with the venue; the shell links to it with a summary.
const venuePage = await request(`/o/${organizerKey}/sale`);
check(
  "rooms-and-tables page renders the venue",
  venuePage.status === 200 &&
    venuePage.body.includes("Sale i stoliki") &&
    venuePage.body.includes(ROOM_NAME) &&
    venuePage.body.includes(TABLE_NAME) &&
    venuePage.body.includes(`/api/o/${organizerKey}/plan/image?v=${venueAfter.data?.plan?.version}`),
  String(venuePage.status),
);
check("rooms-and-tables page is not cacheable", venuePage.cacheControl.includes("no-store"), venuePage.cacheControl);
const tvVenuePage = await request(`/o/${tvKey}/sale`);
check(
  "rooms-and-tables page with the TV key: no access, no venue data",
  tvVenuePage.status === 404 &&
    tvVenuePage.body.includes(NO_ACCESS_TEXT) &&
    !tvVenuePage.body.includes(ROOM_NAME) &&
    !tvVenuePage.body.includes(TABLE_NAME),
  String(tvVenuePage.status),
);
const shellAfterVenue = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the rooms-and-tables page with a summary",
  shellAfterVenue.status === 200 &&
    shellAfterVenue.body.includes(`/o/${organizerKey}/sale`) &&
    shellAfterVenue.body.includes("Plan wgrany · 1 sala · 1 stolik · 6 miejsc"),
  String(shellAfterVenue.status),
);

// 13. Seating (S-03): the working arrangement with pins and publishing; the TV sees only what was published.
// Leftovers used here: guests Ania Smoke (present) and Ola Smoke (absent), table "Okno Smoke" (rectangular, 6 seats).
const seatingApi = `${api}/seating`;
const tvSeatingApi = `/api/tv/${tvKey}/seating`;
const seatOf = (res, guestId) => res.data?.assignments?.find((assignment) => assignment.guestId === guestId);
const tvSince = (version) => request(`${tvSeatingApi}?since=${encodeURIComponent(version ?? "")}`);
const tvNames = (res) =>
  (res.data?.tables ?? []).flatMap((table) => table.seats.map((seat) => `${table.name}#${seat.seat}=${seat.name}`));
const leaksFromTv = (body) =>
  [organizerKey, '"guestId"', '"id"', '"pinned"', '"isAbsent"', '"tableId"'].filter((secret) => body.includes(secret));

const tvEmpty = await request(tvSeatingApi);
check(
  "TV seating before any publish has nothing",
  tvEmpty.status === 200 &&
    tvEmpty.data?.publishedAt === null &&
    tvEmpty.data.tables.length === 0 &&
    typeof tvEmpty.data.version === "string" &&
    tvEmpty.cacheControl.includes("no-store"),
  `${tvEmpty.status} ${tvEmpty.body}`,
);
const tvEmptySame = await tvSince(tvEmpty.data?.version);
check(
  "TV seating since the current version is 204",
  tvEmptySame.status === 204 && tvEmptySame.body === "",
  String(tvEmptySame.status),
);

// The organizer's published seating for the offline readout (S-09) is empty before the first publish.
const publishedSeatingEmpty = await request(`${seatingApi}/published`);
check(
  "published seating for the offline readout is null before any publish",
  publishedSeatingEmpty.status === 200 &&
    publishedSeatingEmpty.body === JSON.stringify({ published: null }) &&
    publishedSeatingEmpty.cacheControl.includes("no-store"),
  `${publishedSeatingEmpty.status} ${publishedSeatingEmpty.body}`,
);

const board = await request(seatingApi);
check(
  "seating board starts empty and unpublished",
  board.status === 200 &&
    board.data?.assignments?.length === 0 &&
    board.data.published === null &&
    board.data.upToDate === false &&
    board.data.guestList?.guests?.length === 2 &&
    board.data.venue?.tables?.length === 1,
  `${board.status} ${board.body}`,
);

const seatAnia = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 1 },
});
check(
  "a guest is seated",
  seatAnia.status === 200 && seatOf(seatAnia, ania.id)?.seat === 1,
  `${seatAnia.status} ${seatAnia.body}`,
);
const seatOla = await request(`${seatingApi}/guests/${ola.id}`, { method: "PUT", json: { tableId: oknoId, seat: 4 } });
check(
  "an absent guest can be seated",
  seatOla.status === 200 && seatOf(seatOla, ola.id)?.seat === 4,
  `${seatOla.status}`,
);
const swapped = await request(`${seatingApi}/guests/${ania.id}`, { method: "PUT", json: { tableId: oknoId, seat: 4 } });
check(
  "two guests swap seats",
  swapped.status === 200 && seatOf(swapped, ania.id)?.seat === 4 && seatOf(swapped, ola.id)?.seat === 1,
  `${swapped.status} ${swapped.body}`,
);
const noSuchSeat = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 7 },
});
check(
  "a seat the table does not have is refused",
  noSuchSeat.status === 400 && errorOf(noSuchSeat) === "Ten stolik nie ma miejsca nr 7.",
  `${noSuchSeat.status} ${errorOf(noSuchSeat)}`,
);
const extraKey = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 2, pinned: true },
});
check("unknown body keys are refused", extraKey.status === 400, `${extraKey.status} ${errorOf(extraKey)}`);
const unknownSeatGuest = await request(`${seatingApi}/guests/999999999`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 2 },
});
check(
  "seating an unknown guest is not found",
  unknownSeatGuest.status === 404 && errorOf(unknownSeatGuest) === "Nie znaleziono gościa.",
  `${unknownSeatGuest.status} ${errorOf(unknownSeatGuest)}`,
);
const unknownSeatTable = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: 999999999, seat: 2 },
});
check(
  "seating at an unknown table is not found",
  unknownSeatTable.status === 404 && errorOf(unknownSeatTable) === "Nie znaleziono stolika.",
  `${unknownSeatTable.status} ${errorOf(unknownSeatTable)}`,
);

const pinOla = await request(`${seatingApi}/guests/${ola.id}`, { method: "PATCH", json: { pinned: true } });
check(
  "a guest is pinned",
  pinOla.status === 200 && seatOf(pinOla, ola.id)?.pinned === true,
  `${pinOla.status} ${pinOla.body}`,
);
const movePinned = await request(`${seatingApi}/guests/${ola.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 2 },
});
check(
  "a pinned guest cannot be moved",
  movePinned.status === 409 && errorOf(movePinned).includes("Ola Smoke"),
  `${movePinned.status} ${errorOf(movePinned)}`,
);
const displacePinned = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 1 },
});
check(
  "a pinned guest cannot be displaced",
  displacePinned.status === 409 && errorOf(displacePinned).includes("Ola Smoke"),
  `${displacePinned.status} ${errorOf(displacePinned)}`,
);
const unseatPinned = await request(`${seatingApi}/guests/${ola.id}`, { method: "DELETE" });
check(
  "a pinned guest cannot be unseated",
  unseatPinned.status === 409,
  `${unseatPinned.status} ${errorOf(unseatPinned)}`,
);

// venue-drawing: a table's rotation, a room outline and the venue's chair pitch are saved at once, reach the TV only
// with the next publish, and bad values are refused.
const OUTLINE = { x: 0.05, y: 0.1, width: 0.6, height: 0.5 };
const turned = await request(`${api}/tables/${oknoId}`, { method: "PATCH", json: { rotation: -90 } });
check(
  "a table turns (degrees normalized to 0..359)",
  turned.status === 200 && tableNamed(turned, TABLE_NAME)?.rotation === 270,
  `${turned.status} ${turned.body}`,
);
const outlined = await request(`${api}/rooms/${hallId}`, { method: "PATCH", json: { outline: OUTLINE } });
check(
  "a room gets an outline",
  outlined.status === 200 &&
    JSON.stringify(outlined.data?.rooms?.find((room) => room.id === hallId)?.outline) === JSON.stringify(OUTLINE),
  `${outlined.status} ${outlined.body}`,
);
const badOutline = await request(`${api}/rooms/${hallId}`, {
  method: "PATCH",
  json: { outline: { ...OUTLINE, width: 0 } },
});
check("an empty outline is refused", badOutline.status === 400, `${badOutline.status} ${badOutline.body}`);
const pitched = await request(`${api}/venue`, { method: "PATCH", json: { chairPitch: 0.04 } });
const badPitch = await request(`${api}/venue`, { method: "PATCH", json: { chairPitch: 1 } });
check(
  "the chair pitch is saved for the whole venue and checked",
  pitched.status === 200 && pitched.data?.chairPitch === 0.04 && badPitch.status === 400,
  `${pitched.status} ${badPitch.status} ${badPitch.body}`,
);
const tvBeforeDrawingPublish = await tvSince(tvEmpty.data?.version);
check(
  "drawing edits do not reach the TV before a publish",
  tvBeforeDrawingPublish.status === 204,
  String(tvBeforeDrawingPublish.status),
);

const published = await request(`${seatingApi}/publish`, { method: "POST" });
check(
  "publishing creates a snapshot and the board is up to date",
  published.status === 201 &&
    published.data?.upToDate === true &&
    Number.isInteger(published.data?.published?.snapshotId),
  `${published.status} ${published.body}`,
);
const publishedAgain = await request(`${seatingApi}/publish`, { method: "POST" });
check(
  "publishing again without changes creates nothing",
  publishedAgain.status === 200 && publishedAgain.data?.published?.snapshotId === published.data?.published?.snapshotId,
  `${publishedAgain.status}`,
);

const tvFirst = await request(tvSeatingApi);
check(
  "TV shows the published names (absent guests left out)",
  tvFirst.status === 200 &&
    tvFirst.data?.version !== tvEmpty.data?.version &&
    typeof tvFirst.data?.publishedAt === "string" &&
    JSON.stringify(tvNames(tvFirst)) === JSON.stringify([`${TABLE_NAME}#4=${GUEST_NAMES[0]}`]),
  `${tvFirst.status} ${tvFirst.body}`,
);
check(
  "TV seating leaks no ids, pins, absences or keys",
  leaksFromTv(tvFirst.body).length === 0,
  leaksFromTv(tvFirst.body).join(" "),
);
check(
  "TV draws the published venue: rotations, outlined rooms and the chair pitch, nothing else",
  JSON.stringify(Object.keys(tvFirst.data ?? {}).sort()) ===
    JSON.stringify(["chairPitch", "planVersion", "publishedAt", "rooms", "spotlight", "tables", "version"]) &&
    tvFirst.data.chairPitch === 0.04 &&
    tvFirst.data.rooms.some((room) => room.width === OUTLINE.width && room.height === OUTLINE.height) &&
    tvFirst.data.rooms.every((room) => Object.keys(room).sort().join(",") === "height,name,width,x,y") &&
    tableNamed(tvFirst, TABLE_NAME)?.rotation === 270 &&
    tvFirst.data.tables.every(
      (table) => Object.keys(table).sort().join(",") === "name,rotation,seatCount,seats,shape,x,y",
    ),
  tvFirst.body,
);
const tvFirstSame = await tvSince(tvFirst.data?.version);
check("TV seating is 204 until the next publish", tvFirstSame.status === 204, String(tvFirstSame.status));

// The organizer's published seating (S-09): the snapshot as names on seats with the room, no ids.
const publishedSeating = await request(`${seatingApi}/published`);
const publishedOkno = publishedSeating.data?.published?.tables?.find((table) => table.name === TABLE_NAME);
check(
  "published seating for the offline readout shows the snapshot with rooms",
  publishedSeating.status === 200 &&
    publishedSeating.cacheControl.includes("no-store") &&
    publishedSeating.data?.published?.snapshotId === published.data?.published?.snapshotId &&
    publishedSeating.data.published.publishedAt === tvFirst.data?.publishedAt &&
    publishedOkno?.room === ROOM_NAME &&
    publishedOkno.shape === "rectangular" &&
    publishedOkno.seatCount === 6 &&
    JSON.stringify(publishedOkno.seats) === JSON.stringify([{ seat: 4, name: GUEST_NAMES[0] }]),
  `${publishedSeating.status} ${publishedSeating.body}`,
);
check(
  "published seating leaks no ids, pins or absences",
  leaksFromTv(publishedSeating.body).length === 0,
  leaksFromTv(publishedSeating.body).join(" "),
);

const olaBack = await request(`${api}/guests/${ola.id}`, { method: "PATCH", json: { isAbsent: false } });
const boardAfterAbsence = await request(seatingApi);
const tvAfterAbsence = await tvSince(tvFirst.data?.version);
check(
  "marking a seated guest present is an unpublished change the TV does not see",
  olaBack.status === 200 && boardAfterAbsence.data?.upToDate === false && tvAfterAbsence.status === 204,
  `${olaBack.status} ${boardAfterAbsence.data?.upToDate} ${tvAfterAbsence.status}`,
);
const publishedSecond = await request(`${seatingApi}/publish`, { method: "POST" });
const tvSecond = await tvSince(tvFirst.data?.version);
check(
  "after the next publish the TV shows both guests",
  publishedSecond.status === 201 &&
    tvSecond.status === 200 &&
    JSON.stringify(tvNames(tvSecond)) ===
      JSON.stringify([`${TABLE_NAME}#1=${GUEST_NAMES[2]}`, `${TABLE_NAME}#4=${GUEST_NAMES[0]}`]),
  `${publishedSecond.status} ${tvSecond.status} ${tvSecond.body}`,
);

await request(`${seatingApi}/guests/${ola.id}`, { method: "PATCH", json: { pinned: false } });
const unseatOla = await request(`${seatingApi}/guests/${ola.id}`, { method: "DELETE" });
const tvAfterDraft = await tvSince(tvSecond.data?.version);
check(
  "an unpublished change never reaches the TV",
  unseatOla.status === 200 &&
    !seatOf(unseatOla, ola.id) &&
    unseatOla.data?.upToDate === false &&
    tvAfterDraft.status === 204,
  `${unseatOla.status} ${tvAfterDraft.status}`,
);

for (const [method, path, json] of [
  ["GET", `/api/o/${tvKey}/seating`],
  ["PUT", `/api/o/${tvKey}/seating/guests/${ania.id}`, { tableId: oknoId, seat: 2 }],
  ["PATCH", `/api/o/${tvKey}/seating/guests/${ania.id}`, { pinned: true }],
  ["DELETE", `/api/o/${tvKey}/seating/guests/${ania.id}`],
  ["POST", `/api/o/${tvKey}/seating/publish`],
  ["GET", `/api/o/${tvKey}/seating/published`],
  ["GET", `/api/tv/${organizerKey}/seating`],
]) {
  const res = await request(path, { method, json });
  check(
    `seating API with the wrong key: ${method} ${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" }),
    `${res.status} ${res.body}`,
  );
}
const boardAfterWrongKeys = await request(seatingApi);
check(
  "wrong-key seating requests changed nothing",
  seatOf(boardAfterWrongKeys, ania.id)?.seat === 4 &&
    seatOf(boardAfterWrongKeys, ania.id)?.pinned === false &&
    !seatOf(boardAfterWrongKeys, ola.id) &&
    boardAfterWrongKeys.data?.published?.snapshotId === publishedSecond.data?.published?.snapshotId,
  boardAfterWrongKeys.body,
);

// 14. Seating page (S-03): organizer only, rendered with the board; the shell links to it with a summary; the venue
// page gets who sits where (for its seat-loss confirmations).
const seatingPage = await request(`/o/${organizerKey}/rozsadzenie`);
check(
  "seating page renders the board",
  seatingPage.status === 200 &&
    seatingPage.body.includes("Rozsadzenie") &&
    seatingPage.body.includes("Opublikuj na TV") &&
    seatingPage.body.includes(GUEST_NAMES[0]) &&
    seatingPage.body.includes(TABLE_NAME),
  String(seatingPage.status),
);
check("seating page is not cacheable", seatingPage.cacheControl.includes("no-store"), seatingPage.cacheControl);
const tvSeatingPage = await request(`/o/${tvKey}/rozsadzenie`);
check(
  "seating page with the TV key: no access, no seating data",
  tvSeatingPage.status === 404 &&
    tvSeatingPage.body.includes(NO_ACCESS_TEXT) &&
    GUEST_NAMES.every((name) => !tvSeatingPage.body.includes(name)) &&
    !tvSeatingPage.body.includes(TABLE_NAME),
  String(tvSeatingPage.status),
);
const shellAfterSeating = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the seating page with a summary",
  shellAfterSeating.status === 200 &&
    shellAfterSeating.body.includes(`/o/${organizerKey}/rozsadzenie`) &&
    shellAfterSeating.body.includes("1 z 2 obecnych ma miejsce · nieopublikowane zmiany"),
  String(shellAfterSeating.status),
);
const venuePageAfterSeating = await request(`/o/${organizerKey}/sale`);
check(
  "rooms-and-tables page still renders, with the seat occupancy",
  venuePageAfterSeating.status === 200 &&
    venuePageAfterSeating.body.includes(TABLE_NAME) &&
    venuePageAfterSeating.body.includes(GUEST_NAMES[0]),
  String(venuePageAfterSeating.status),
);

// 15. TV page (S-03): the latest PUBLISHED arrangement on the plan (Ola Smoke lost her seat after the last publish,
// so seeing her proves the TV ignores working changes); nothing private in the HTML.
const tvPage = await request(`/tv/${tvKey}`);
check(
  "TV page shows the published names on the plan",
  tvPage.status === 200 &&
    tvPage.body.includes(GUEST_NAMES[0]) &&
    tvPage.body.includes(GUEST_NAMES[2]) &&
    tvPage.body.includes(TABLE_NAME) &&
    tvPage.body.includes(`/api/tv/${tvKey}`),
  String(tvPage.status),
);
check("TV page is not cacheable", tvPage.cacheControl.includes("no-store"), tvPage.cacheControl);
const tvPageLeaks = [organizerKey, "guestId", "pinned", "isAbsent", "tableId", "assignments"].filter((secret) =>
  tvPage.body.includes(secret),
);
check("TV page leaks no organizer key, ids, pins or absences", tvPageLeaks.length === 0, tvPageLeaks.join(" "));

// 16. Draw, draft and restore (S-04). The draw itself runs in the browser; the server gives it the neighbour history,
// re-checks the drawn draft and restores published arrangements. State here: Ania Smoke at seat 4 of "Okno Smoke"
// (unpinned), Ola Smoke present and without a seat; the latest snapshot has Ola at seat 1 opposite Ania (neighbours).
const isPair = (pair, a, b) => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a);
const history = await request(`${seatingApi}/history`);
check(
  "neighbour history counts the snapshots and has the published neighbours",
  history.status === 200 &&
    history.data?.snapshotCount === 2 &&
    history.data.pairs.some((pair) => isPair(pair, ania.id, ola.id)) &&
    history.cacheControl.includes("no-store"),
  `${history.status} ${history.body}`,
);
const boardBeforeDraft = await request(seatingApi);
check(
  "the board names the previous snapshot",
  boardBeforeDraft.data?.previous?.snapshotId === published.data?.published?.snapshotId &&
    boardBeforeDraft.data?.published?.snapshotId === publishedSecond.data?.published?.snapshotId,
  boardBeforeDraft.body,
);

const draftMissing = await request(`${seatingApi}/draft`, {
  method: "POST",
  json: { seats: [{ guestId: ania.id, tableId: oknoId, seat: 1 }] },
});
const boardAfterBadDraft = await request(seatingApi);
check(
  "a draft without a present guest is refused with the reason and changes nothing",
  draftMissing.status === 409 &&
    errorOf(draftMissing) === "Rozsadzenie zmieniło się w międzyczasie — wylosuj jeszcze raz." &&
    draftMissing.data?.problems?.includes(`Bez miejsca w projekcie: ${GUEST_NAMES[2]}.`) &&
    seatOf(boardAfterBadDraft, ania.id)?.seat === 4 &&
    !seatOf(boardAfterBadDraft, ola.id),
  `${draftMissing.status} ${draftMissing.body}`,
);
const draftExtraKey = await request(`${seatingApi}/draft`, {
  method: "POST",
  json: { seats: [{ guestId: ania.id, tableId: oknoId, seat: 1, pinned: true }] },
});
check("draft with unknown keys is refused", draftExtraKey.status === 400, `${draftExtraKey.status}`);

const draftSaved = await request(`${seatingApi}/draft`, {
  method: "POST",
  json: {
    seats: [
      { guestId: ania.id, tableId: oknoId, seat: 3 },
      { guestId: ola.id, tableId: oknoId, seat: 1 },
    ],
  },
});
const tvAfterDrawDraft = await tvSince(tvSecond.data?.version);
check(
  "a valid draft becomes the working arrangement and the TV does not see it",
  draftSaved.status === 200 &&
    seatOf(draftSaved, ania.id)?.seat === 3 &&
    seatOf(draftSaved, ola.id)?.seat === 1 &&
    draftSaved.data?.upToDate === false &&
    tvAfterDrawDraft.status === 204,
  `${draftSaved.status} ${tvAfterDrawDraft.status} ${draftSaved.body}`,
);

const restoreUnknown = await request(`${seatingApi}/restore`, { method: "POST", json: { snapshotId: 999999999 } });
check(
  "restoring an unknown snapshot is not found",
  restoreUnknown.status === 404 && errorOf(restoreUnknown) === "Nie znaleziono opublikowanego rozkładu.",
  `${restoreUnknown.status} ${errorOf(restoreUnknown)}`,
);
const restoreBadBody = await request(`${seatingApi}/restore`, { method: "POST", json: { snapshotId: "1" } });
check("restore with a bad body is refused", restoreBadBody.status === 400, `${restoreBadBody.status}`);
const restored = await request(`${seatingApi}/restore`, {
  method: "POST",
  json: { snapshotId: publishedSecond.data?.published?.snapshotId },
});
const tvAfterRestore = await tvSince(tvSecond.data?.version);
check(
  "discarding the draft restores what the TV shows",
  restored.status === 200 &&
    restored.data?.notice?.startsWith("Przywrócono rozkład z ") &&
    restored.data?.upToDate === true &&
    seatOf(restored, ania.id)?.seat === 4 &&
    seatOf(restored, ola.id)?.seat === 1 &&
    tvAfterRestore.status === 204,
  `${restored.status} ${restored.body}`,
);

const seatingPageWithDraw = await request(`/o/${organizerKey}/rozsadzenie`);
check(
  "seating page offers the draw",
  seatingPageWithDraw.status === 200 &&
    seatingPageWithDraw.body.includes("Losowanie") &&
    seatingPageWithDraw.body.includes("Wylosuj projekt") &&
    seatingPageWithDraw.body.includes("Historia: 2 opublikowane rozkłady"),
  String(seatingPageWithDraw.status),
);
const shellWithDraw = await request(`/o/${organizerKey}`);
check(
  "organizer shell no longer lists the draw as coming soon",
  shellWithDraw.status === 200 &&
    !shellWithDraw.body.includes("Losowanie i cofnięcie") &&
    shellWithDraw.body.includes("Losowanie bez powtórek sąsiadów"),
  String(shellWithDraw.status),
);

for (const [method, path, json] of [
  ["GET", `/api/o/${tvKey}/seating/history`],
  ["POST", `/api/o/${tvKey}/seating/draft`, { seats: [] }],
  ["POST", `/api/o/${tvKey}/seating/restore`, { snapshotId: published.data?.published?.snapshotId }],
]) {
  const res = await request(path, { method, json });
  check(
    `draw API with the TV key: ${method} ${path.replace(tvKey, "<tv>")}`,
    res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" }),
    `${res.status} ${res.body}`,
  );
}

// 17. Guest links and the guest's own seat (S-05). State here: Ania Smoke at seat 4 and Ola Smoke at seat 1 of
// "Okno Smoke" in the latest snapshot (working arrangement = published); a plan image exists. Guest access starts OFF.
const linksApi = `${api}/guest-links`;
const linkOf = (res, guestId) => res.data?.guests?.find((guest) => guest.id === guestId);
const isKey = (value) => typeof value === "string" && new RegExp(`^${KEY}$`).test(value);
const noAccessJson = (res) => res.status === 404 && res.body === JSON.stringify({ error: "Brak dostępu" });
const [deniedBody] = deniedBodies;

const links = await request(linksApi);
const aniaKey = linkOf(links, ania.id)?.key;
const olaKey = linkOf(links, ola.id)?.key;
check(
  "guest links: access is off by default and every guest has a personal key",
  links.status === 200 &&
    links.data?.enabled === false &&
    links.data.guests.length === 2 &&
    isKey(aniaKey) &&
    isKey(olaKey) &&
    aniaKey !== olaKey &&
    ![organizerKey, tvKey].includes(aniaKey) &&
    links.cacheControl.includes("no-store"),
  `${links.status} ${links.body}`,
);
if (!isKey(aniaKey) || !isKey(olaKey)) finish();

for (const [method, path, json] of [
  ["GET", `/api/o/${tvKey}/guest-links`],
  ["PATCH", `/api/o/${tvKey}/guest-links`, { enabled: true }],
  ["POST", `/api/o/${tvKey}/guest-links/${ania.id}/revoke`],
  ["GET", `/api/o/${aniaKey}/guest-links`],
  ["PATCH", `/api/o/${aniaKey}/guest-links`, { enabled: true }],
]) {
  const res = await request(path, { method, json });
  check(
    `guest links API with a wrong key: ${method} ${path.replace(tvKey, "<tv>").replace(aniaKey, "<guest>")}`,
    noAccessJson(res),
    `${res.status} ${res.body}`,
  );
}

const guestOffPage = await request(`/g/${aniaKey}`);
check(
  "guest link with access off: the same no-access page, no data",
  guestOffPage.status === 404 &&
    guestOffPage.body === deniedBody &&
    guestOffPage.cacheControl.includes("no-store") &&
    !guestOffPage.body.includes(GUEST_NAMES[0]),
  String(guestOffPage.status),
);
const guestOffApi = await request(`/api/g/${aniaKey}/state`);
check("guest state with access off: JSON 404", noAccessJson(guestOffApi), `${guestOffApi.status} ${guestOffApi.body}`);

for (const json of [{ enabled: "yes" }, { enabled: true, extra: 1 }, {}]) {
  const res = await request(linksApi, { method: "PATCH", json });
  check(
    `guest access switch refuses ${JSON.stringify(json)}`,
    res.status === 400 && errorOf(res) === "Nieprawidłowe dane.",
    `${res.status} ${res.body}`,
  );
}
const accessOn = await request(linksApi, { method: "PATCH", json: { enabled: true } });
check(
  "guest access is turned on",
  accessOn.status === 200 && accessOn.data?.enabled === true && linkOf(accessOn, ania.id)?.key === aniaKey,
  `${accessOn.status} ${accessOn.body}`,
);

const guestStateApi = (key) => `/api/g/${key}/state`;
const guestSince = (key, version) => request(`${guestStateApi(key)}?since=${encodeURIComponent(version ?? "")}`);
const leaksFromGuest = (body, ownKey) =>
  [organizerKey, tvKey, ownKey === aniaKey ? olaKey : aniaKey, '"id"', '"guestId"', '"tableId"', '"key"'].filter(
    (secret) => body.includes(secret),
  );

const aniaState = await request(guestStateApi(aniaKey));
check(
  "guest state shows her own published seat",
  aniaState.status === 200 &&
    aniaState.data?.name === GUEST_NAMES[0] &&
    aniaState.data.status === "seated" &&
    aniaState.data.seat?.table === TABLE_NAME &&
    aniaState.data.seat.room === ROOM_NAME &&
    aniaState.data.seat.seat === 4 &&
    typeof aniaState.data.version === "string" &&
    aniaState.cacheControl.includes("no-store"),
  `${aniaState.status} ${aniaState.body}`,
);
// Other guests reach a phone only as the published seating the TV shows: the tablemates at the guest's OWN table and
// (guest-venue-names) the names at every chair of the drawing. "Okno Smoke" is rectangular with 6 seats, so seat 1
// (Ola) is opposite seat 4 (Ania).
const stripTablemates = (data) => ({
  ...data,
  seat: data?.seat ? { ...data.seat, tablemates: [] } : data?.seat,
  drawing: data?.drawing
    ? { ...data.drawing, tables: data.drawing.tables.map((table) => ({ ...table, seats: [] })) }
    : data?.drawing,
});
check(
  "guest state leaks no keys or ids, and other guests only as the published seating",
  leaksFromGuest(aniaState.body, aniaKey).length === 0 &&
    !JSON.stringify(stripTablemates(aniaState.data)).includes(GUEST_NAMES[2]),
  leaksFromGuest(aniaState.body, aniaKey).join(" "),
);
check(
  "guest state lists the tablemates with the neighbour relation",
  JSON.stringify(aniaState.data?.seat?.tablemates) ===
    JSON.stringify([{ seat: 1, name: GUEST_NAMES[2], relation: "opposite" }]),
  JSON.stringify(aniaState.data?.seat?.tablemates),
);
// The guest's drawing (venue-drawing): every table's geometry and name, outlined rooms and the pitch, and
// (guest-venue-names) the published names at every table — exactly the TV's seats, no ids or keys.
const drawingOf = (data) => data?.drawing ?? null;
const tvForPhone = await request(tvSeatingApi);
const seatsByTable = (tables) => JSON.stringify((tables ?? []).map((table) => [table.name, table.seats]));
check(
  "guest state carries the published drawing with the TV's names at every table",
  JSON.stringify(Object.keys(drawingOf(aniaState.data) ?? {}).sort()) ===
    JSON.stringify(["chairPitch", "rooms", "tables"]) &&
    aniaState.data.drawing.chairPitch === 0.04 &&
    aniaState.data.drawing.tables.some((table) => table.name === TABLE_NAME && table.rotation === 270) &&
    aniaState.data.drawing.tables.every(
      (table) => Object.keys(table).sort().join(",") === "name,rotation,seatCount,seats,shape,x,y",
    ) &&
    aniaState.data.drawing.tables.every((table) =>
      table.seats.every((seat) => Object.keys(seat).sort().join(",") === "name,seat"),
    ) &&
    tvForPhone.status === 200 &&
    seatsByTable(aniaState.data.drawing.tables) === seatsByTable(tvForPhone.data?.tables) &&
    aniaState.data.drawing.tables.some((table) => table.seats.some((seat) => seat.name === GUEST_NAMES[2])),
  `${JSON.stringify(aniaState.data?.drawing)} vs ${tvForPhone.body}`,
);
const olaState = await request(guestStateApi(olaKey));
check(
  "another guest sees her own seat and her tablemate",
  olaState.status === 200 &&
    olaState.data?.name === GUEST_NAMES[2] &&
    olaState.data.seat?.seat === 1 &&
    JSON.stringify(olaState.data.seat.tablemates) ===
      JSON.stringify([{ seat: 4, name: GUEST_NAMES[0], relation: "opposite" }]) &&
    !JSON.stringify(stripTablemates(olaState.data)).includes(GUEST_NAMES[0]),
  `${olaState.status} ${olaState.body}`,
);
const aniaSame = await guestSince(aniaKey, aniaState.data?.version);
check(
  "guest state since the current version is 204",
  aniaSame.status === 204 && aniaSame.body === "",
  String(aniaSame.status),
);

const aniaMoved = await request(`${seatingApi}/guests/${ania.id}`, {
  method: "PUT",
  json: { tableId: oknoId, seat: 2 },
});
const aniaAfterDraft = await guestSince(aniaKey, aniaState.data?.version);
check(
  "an unpublished move does not reach the guest's phone",
  aniaMoved.status === 200 && aniaAfterDraft.status === 204,
  `${aniaMoved.status} ${aniaAfterDraft.status}`,
);
const publishedForGuest = await request(`${seatingApi}/publish`, { method: "POST" });
const aniaAfterPublish = await guestSince(aniaKey, aniaState.data?.version);
check(
  "after a publish the guest's phone gets the new seat",
  publishedForGuest.status === 201 &&
    aniaAfterPublish.status === 200 &&
    aniaAfterPublish.data?.seat?.seat === 2 &&
    aniaAfterPublish.data.version !== aniaState.data?.version,
  `${publishedForGuest.status} ${aniaAfterPublish.status} ${aniaAfterPublish.body}`,
);
check(
  "after the move her tablemate sits right next to her",
  JSON.stringify(aniaAfterPublish.data?.seat?.tablemates) ===
    JSON.stringify([{ seat: 1, name: GUEST_NAMES[2], relation: "side" }]),
  JSON.stringify(aniaAfterPublish.data?.seat?.tablemates),
);

// A guest left out of the published arrangement (absent) is nobody's tablemate; then back to both seated.
const olaAway = await request(`${api}/guests/${ola.id}`, { method: "PATCH", json: { isAbsent: true } });
const publishedWithoutOla = await request(`${seatingApi}/publish`, { method: "POST" });
const aniaAlone = await request(guestStateApi(aniaKey));
check(
  "a guest who is not in the published arrangement never reaches another phone",
  olaAway.status === 200 &&
    publishedWithoutOla.status === 201 &&
    aniaAlone.status === 200 &&
    aniaAlone.data?.seat?.seat === 2 &&
    aniaAlone.data.seat.tablemates.length === 0 &&
    !aniaAlone.body.includes(GUEST_NAMES[2]),
  `${olaAway.status} ${publishedWithoutOla.status} ${aniaAlone.body}`,
);
const olaHere = await request(`${api}/guests/${ola.id}`, { method: "PATCH", json: { isAbsent: false } });
const publishedWithOla = await request(`${seatingApi}/publish`, { method: "POST" });
check(
  "the guest is back in the published arrangement",
  olaHere.status === 200 && publishedWithOla.status === 201,
  `${olaHere.status} ${publishedWithOla.status}`,
);

const planForGuest = await requestBytes(`/api/g/${aniaKey}/plan/image`);
check(
  "guest gets the plan image for the table highlight",
  planForGuest.status === 200 &&
    planForGuest.contentType === "image/png" &&
    planForGuest.nosniff === "nosniff" &&
    sameBytes(planForGuest.bytes, TINY_PNG),
  `${planForGuest.status} ${planForGuest.contentType}`,
);

for (const path of [`/o/${aniaKey}`, `/o/${aniaKey}/linki`, `/tv/${aniaKey}`]) {
  const res = await request(path);
  check(
    `guest key opens no other role's page: ${path.replace(aniaKey, "<guest>")}`,
    res.status === 404 && res.body === deniedBody,
    String(res.status),
  );
}
for (const path of [
  `/api/o/${aniaKey}/guests`,
  `/api/o/${aniaKey}/seating`,
  `/api/o/${aniaKey}/seating/published`,
  `/api/tv/${aniaKey}/seating`,
  `/api/tv/${aniaKey}/plan/image`,
  `/api/g/${organizerKey}/state`,
  `/api/g/${tvKey}/state`,
  `/api/g/${organizerKey}/plan/image`,
]) {
  const res = await request(path);
  check(
    `wrong role on API: ${path.replace(aniaKey, "<guest>").replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")}`,
    noAccessJson(res),
    `${res.status} ${res.body}`,
  );
}

const revokeUnknown = await request(`${linksApi}/999999999/revoke`, { method: "POST" });
const revokeMalformed = await request(`${linksApi}/abc/revoke`, { method: "POST" });
check(
  "revoking an unknown guest's link is not found",
  revokeUnknown.status === 404 && errorOf(revokeUnknown) === "Nie znaleziono gościa." && revokeMalformed.status === 404,
  `${revokeUnknown.status} ${revokeMalformed.status}`,
);
const revoked = await request(`${linksApi}/${ania.id}/revoke`, { method: "POST" });
const aniaNewKey = linkOf(revoked, ania.id)?.key;
check(
  "revoking a link issues a new key and keeps the others",
  revoked.status === 200 && isKey(aniaNewKey) && aniaNewKey !== aniaKey && linkOf(revoked, ola.id)?.key === olaKey,
  `${revoked.status} ${revoked.body}`,
);
const oldKeyPage = await request(`/g/${aniaKey}`);
const oldKeyState = await request(guestStateApi(aniaKey));
const newKeyState = await request(guestStateApi(aniaNewKey));
check(
  "the revoked link is dead at once, the new one works",
  oldKeyPage.status === 404 &&
    oldKeyPage.body === deniedBody &&
    noAccessJson(oldKeyState) &&
    newKeyState.status === 200 &&
    newKeyState.data?.seat?.seat === 2,
  `${oldKeyPage.status} ${oldKeyState.status} ${newKeyState.status}`,
);

// S-05 page checks (links page, card sheet, guest page) go here, while guest access is on.
// Links page and card sheet (S-05): organizer only; links and QR placeholders carry the CURRENT keys, built from the
// request origin; the server never draws the QR codes itself.
const localBase = ["localhost", "127.0.0.1"].includes(new URL(BASE_URL).hostname);
const aniaUrl = `${BASE_URL}/g/${aniaNewKey}`;
const olaUrl = `${BASE_URL}/g/${olaKey}`;
const countOf = (body, needle) => body.split(needle).length - 1;

const linksPage = await request(`/o/${organizerKey}/linki`);
check(
  "links page lists every guest with the current personal link",
  linksPage.status === 200 &&
    linksPage.body.includes("Linki gości i karteczki") &&
    linksPage.body.includes(GUEST_NAMES[0]) &&
    linksPage.body.includes(GUEST_NAMES[2]) &&
    linksPage.body.includes(aniaUrl) &&
    linksPage.body.includes(olaUrl) &&
    !linksPage.body.includes(aniaKey) &&
    linksPage.body.includes("Wyłącz dostęp gości") &&
    linksPage.cacheControl.includes("no-store"),
  String(linksPage.status),
);
check(
  "links page warns when its address only works on this computer",
  linksPage.body.includes("Ten adres działa tylko na tym komputerze") === localBase,
  `local ${localBase}`,
);
const cardsPage = await request(`/o/${organizerKey}/karteczki`);
check(
  "card sheet has a card per guest with the QR placeholder of the current link",
  cardsPage.status === 200 &&
    countOf(cardsPage.body, "data-guest-card") === 2 &&
    cardsPage.body.includes(`data-qr="${aniaUrl}"`) &&
    cardsPage.body.includes(`data-qr="${olaUrl}"`) &&
    cardsPage.body.includes(GUEST_NAMES[0]) &&
    cardsPage.body.includes(GUEST_NAMES[2]) &&
    cardsPage.body.includes("Zeskanuj kod aparatem telefonu") &&
    !cardsPage.body.includes(aniaKey) &&
    !cardsPage.body.includes("data-qr-ready") &&
    cardsPage.cacheControl.includes("no-store"),
  String(cardsPage.status),
);
const oneCard = await request(`/o/${organizerKey}/karteczki?guest=${ola.id}`);
check(
  "card sheet prints one guest's card on request",
  oneCard.status === 200 &&
    countOf(oneCard.body, "data-guest-card") === 1 &&
    oneCard.body.includes(`data-qr="${olaUrl}"`) &&
    !oneCard.body.includes(GUEST_NAMES[0]),
  String(oneCard.status),
);
const noCard = await request(`/o/${organizerKey}/karteczki?guest=999999999`);
check(
  "card sheet for an unknown guest shows no card",
  noCard.status === 200 &&
    countOf(noCard.body, "data-guest-card") === 0 &&
    noCard.body.includes("Nie znaleziono tego gościa."),
  String(noCard.status),
);
// Behind a TLS proxy (AWS Lambda: Function URL → Lambda Web Adapter → this server over plain http) the request
// carries X-Forwarded-Proto: https; Astro trusts it (security.allowedDomains), so printed links and QR codes are https
// and Astro's origin check compares the browser's https Origin with an https URL. Against a local http server the
// proxy is simulated with headers; against a deployment (https BASE_URL) the real proxy is in front, the checks above
// already saw https links, and only the origin check is repeated.
const behindTls = new URL(BASE_URL).protocol === "https:";
const PROXY_HOST = "kolacja.example";
const PROXY_ORIGIN = `https://${PROXY_HOST}`;
const viaProxy = behindTls
  ? {}
  : { "X-Forwarded-Proto": "https", "X-Forwarded-Host": PROXY_HOST, Origin: PROXY_ORIGIN };
if (!behindTls) {
  const proxiedLinks = await request(`/o/${organizerKey}/linki`, { extraHeaders: viaProxy });
  const proxiedCards = await request(`/o/${organizerKey}/karteczki`, { extraHeaders: viaProxy });
  check(
    "behind a TLS proxy the links page and the cards carry https links of the public host",
    proxiedLinks.status === 200 &&
      proxiedLinks.body.includes(`${PROXY_ORIGIN}/g/${aniaNewKey}`) &&
      !proxiedLinks.body.includes(aniaUrl) &&
      !proxiedLinks.body.includes("Ten adres działa tylko na tym komputerze") &&
      proxiedCards.status === 200 &&
      proxiedCards.body.includes(`data-qr="${PROXY_ORIGIN}/g/${aniaNewKey}"`),
    `${proxiedLinks.status} ${proxiedCards.status}`,
  );
}
// A body-less POST (like „Opublikuj”) from the (proxied) https page passes the origin check (404 = the key guard
// answered), while a foreign Origin is still refused (403). The garbage key changes nothing.
const proxiedPost = await request("/api/o/garbage/seating/publish", { method: "POST", extraHeaders: viaProxy });
const foreignPost = await request("/api/o/garbage/seating/publish", {
  method: "POST",
  extraHeaders: { ...viaProxy, Origin: "https://evil.example" },
});
check(
  "behind a TLS proxy a same-origin POST passes the origin check and a foreign one is refused",
  noAccessJson(proxiedPost) && foreignPost.status === 403,
  `${proxiedPost.status} ${foreignPost.status}`,
);
for (const path of [`/o/${tvKey}/linki`, `/o/${tvKey}/karteczki`, `/o/${aniaNewKey}/karteczki`]) {
  const res = await request(path);
  check(
    `organizer link pages with a wrong key: ${path.replace(tvKey, "<tv>").replace(aniaNewKey, "<guest>")}`,
    res.status === 404 && res.body === deniedBody && GUEST_NAMES.every((name) => !res.body.includes(name)),
    String(res.status),
  );
}
const shellWithLinks = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the links page with the access summary",
  shellWithLinks.status === 200 &&
    shellWithLinks.body.includes(`/o/${organizerKey}/linki`) &&
    shellWithLinks.body.includes("Dostęp gości: włączony · 2 linki") &&
    countOf(shellWithLinks.body, "Wkrótce") === 0,
  String(shellWithLinks.status),
);

// Guest page (S-05): the guest's own seat on the phone, nothing else; the island polls /api/g/<key>.
const phonePage = await request(`/g/${aniaNewKey}`);
check(
  "guest page shows her name, table, room and the live-refresh endpoint",
  phonePage.status === 200 &&
    phonePage.body.includes(GUEST_NAMES[0]) &&
    phonePage.body.includes(TABLE_NAME) &&
    phonePage.body.includes(ROOM_NAME) &&
    phonePage.body.includes("Twój stolik") &&
    phonePage.body.includes(`/api/g/${aniaNewKey}`) &&
    phonePage.cacheControl.includes("no-store") &&
    phonePage.referrerPolicy === "no-referrer",
  String(phonePage.status),
);
const phonePageLeaks = [
  organizerKey,
  tvKey,
  olaKey,
  aniaKey,
  "guestId",
  "tableId",
  "snapshotId",
  "access_key",
  "isAbsent",
  "&quot;id&quot;",
  '"id"',
].filter((secret) => phonePage.body.includes(secret));
check("guest page leaks no keys or ids", phonePageLeaks.length === 0, phonePageLeaks.join(" "));
check(
  "guest page shows who sits at her table, the neighbour marked",
  phonePage.body.includes("Przy Twoim stoliku") &&
    phonePage.body.includes(GUEST_NAMES[2]) &&
    phonePage.body.includes("obok Ciebie"),
  String(phonePage.status),
);
const olaPage = await request(`/g/${olaKey}`);
check(
  "another guest's page shows her own name and her tablemate",
  olaPage.status === 200 &&
    olaPage.body.includes(GUEST_NAMES[2]) &&
    olaPage.body.includes("Przy Twoim stoliku") &&
    olaPage.body.includes(GUEST_NAMES[0]),
  String(olaPage.status),
);

// 18. Guesses and the ranking (S-06): a guest saves and changes only their OWN guess while intake is open; the
// organizer enters guesses for anyone (also after closing), closes and reopens intake, sets the correct amount and
// gets the ranking. Guesses of others, the correct amount and the ranking never reach a guest or the TV.
const guessesApi = `${api}/guesses`;
const guessApi = (key) => `/api/g/${key}/guess`;
const NBSP = "\u00a0";
const boardGuest = (res, id) => res.data?.guests?.find((guest) => guest.id === id);
const isMissingGuess = (res, id) => Boolean(res.data?.missing?.some((guest) => guest.id === id));
const rankOf = (res, id) => res.data?.ranking?.entries?.find((entry) => entry.guestId === id);
// Every way an amount could show up in a body: raw grosze, "7 777,77" (NBSP or space) and "7777,77".
const amountForms = (grosze) => {
  const whole = String(Math.floor(grosze / 100));
  const fraction = String(grosze % 100).padStart(2, "0");
  const grouped = (separator) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return [String(grosze), `${grouped(NBSP)},${fraction}`, `${grouped(" ")},${fraction}`, `${whole},${fraction}`];
};
// JSON without the opaque tokens and epoch-ms versions (digits there could look like an amount).
const withoutVersions = (data) => JSON.stringify({ ...data, version: null, planVersion: null, publishedAt: null });
const leaksIn = (body, amounts, words = []) =>
  [...amounts.flatMap(amountForms), ...words].filter((needle) => body.includes(needle));
// Ania 1 234,56 zł → later 2 222,23 zł; Ola 7 777,77 zł; the correct amount 5 000,00 zł.
const ANIA_GUESS = 123456;
const ANIA_TIE = 222223;
const OLA_GUESS = 777777;
const CORRECT = 500000;
const SECRET_WORDS = ["ranking", "correctAmount", '"place"', "distance", "missing", "placeHit"];

const board0 = await request(guessesApi);
check(
  "guesses board starts open, without a correct amount or ranking, everybody missing",
  board0.status === 200 &&
    board0.data?.intakeOpen === true &&
    board0.data.correctAmountGrosze === null &&
    board0.data.ranking === null &&
    isMissingGuess(board0, ania.id) &&
    isMissingGuess(board0, ola.id) &&
    boardGuest(board0, ola.id)?.isAbsent === false &&
    board0.cacheControl.includes("no-store"),
  `${board0.status} ${board0.body}`,
);

const aniaGuess0 = await request(guestStateApi(aniaNewKey));
check(
  "guest state carries the intake flag and no guess yet",
  aniaGuess0.status === 200 &&
    aniaGuess0.data?.guess?.intakeOpen === true &&
    aniaGuess0.data.guess.amountGrosze === null &&
    aniaGuess0.data.guess.predictedPlace === null &&
    aniaGuess0.data.guess.maxPlace === board0.data?.guests?.length &&
    Object.keys(aniaGuess0.data.guess).length === 4,
  aniaGuess0.body,
);
// guess-place: the optional prediction of the own final place, 1 … number of guests, saved with the amount.
const guestCount = board0.data?.guests?.length ?? 0;
const aniaPlaced = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1 234,56 zł", place: "2." } });
check(
  "guest saves her guess with a place prediction",
  aniaPlaced.status === 200 &&
    aniaPlaced.data?.guess?.amountGrosze === ANIA_GUESS &&
    aniaPlaced.data.guess.predictedPlace === 2,
  `${aniaPlaced.status} ${aniaPlaced.body}`,
);
for (const place of ["0", "abc", "1,5", String(guestCount + 1)]) {
  const res = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1", place } });
  check(
    `guest place ${JSON.stringify(place)} is refused with the range 1 … number of guests`,
    res.status === 400 && errorOf(res) === `Wpisz miejsce od 1 do ${guestCount}.` && res.data?.field === "place",
    `${res.status} ${res.body}`,
  );
}
const placeAsNumber = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1", place: 2 } });
check(
  "guest place must be sent as typed text",
  placeAsNumber.status === 400 && errorOf(placeAsNumber) === "Nieprawidłowe dane.",
  `${placeAsNumber.status} ${placeAsNumber.body}`,
);
const aniaSaved = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1 234,56 zł" } });
check(
  "guest saves her own guess in a Polish format and gets her new state (an amount alone keeps her place)",
  aniaSaved.status === 200 &&
    aniaSaved.data?.guess?.amountGrosze === ANIA_GUESS &&
    aniaSaved.data.guess.predictedPlace === 2 &&
    aniaSaved.data.guess.intakeOpen === true &&
    aniaSaved.data.name === GUEST_NAMES[0] &&
    aniaSaved.data.version !== aniaGuess0.data?.version &&
    aniaSaved.cacheControl.includes("no-store"),
  `${aniaSaved.status} ${aniaSaved.body}`,
);
const aniaSinceOld = await guestSince(aniaNewKey, aniaGuess0.data?.version);
const aniaSinceSaved = await guestSince(aniaNewKey, aniaSaved.data?.version);
check(
  "the saved guess changes the guest's polling version",
  aniaSinceOld.status === 200 && aniaSinceOld.data?.guess?.amountGrosze === ANIA_GUESS && aniaSinceSaved.status === 204,
  `${aniaSinceOld.status} ${aniaSinceSaved.status}`,
);

for (const [amount, message] of [
  ["-5", "Kwota nie może być ujemna."],
  ["abc", "Wpisz kwotę w złotych, np. 1500 albo 1499,99."],
  ["1.500", "Wpisz kwotę w złotych, np. 1500 albo 1499,99."],
  ["10000000,01", "Kwota może wynieść najwyżej 10 000 000 zł."],
  ["", "Wpisz kwotę."],
]) {
  const res = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount } });
  check(`guest guess ${JSON.stringify(amount)} is refused`, res.status === 400 && errorOf(res) === message, res.body);
}
for (const json of [{ amount: "1", guestId: ola.id }, { amount: 100 }, {}]) {
  const res = await request(guessApi(aniaNewKey), { method: "PUT", json });
  check(
    `guest guess body ${JSON.stringify(json)} is refused (no way to name another guest)`,
    res.status === 400 && errorOf(res) === "Nieprawidłowe dane.",
    `${res.status} ${res.body}`,
  );
}
const boardAfterGuest = await request(guessesApi);
check(
  "organizer sees the guest's guess; nobody else got one",
  boardGuest(boardAfterGuest, ania.id)?.amountGrosze === ANIA_GUESS &&
    boardGuest(boardAfterGuest, ania.id)?.enteredBy === "guest" &&
    !isMissingGuess(boardAfterGuest, ania.id) &&
    isMissingGuess(boardAfterGuest, ola.id),
  boardAfterGuest.body,
);

const olaProxy = await request(`${guessesApi}/${ola.id}`, {
  method: "PUT",
  json: { amount: "7777,77", place: "1" },
});
check(
  "organizer enters a guess with a place prediction for another guest",
  olaProxy.status === 200 &&
    boardGuest(olaProxy, ola.id)?.amountGrosze === OLA_GUESS &&
    boardGuest(olaProxy, ola.id)?.predictedPlace === 1 &&
    boardGuest(olaProxy, ania.id)?.predictedPlace === 2 &&
    boardGuest(olaProxy, ola.id)?.enteredBy === "organizer" &&
    !isMissingGuess(olaProxy, ola.id),
  `${olaProxy.status} ${olaProxy.body}`,
);
const olaGuessState = await request(guestStateApi(olaKey));
const aniaAfterOla = await guestSince(aniaNewKey, aniaSaved.data?.version);
check(
  "the proxy guess reaches only that guest's phone",
  olaGuessState.data?.guess?.amountGrosze === OLA_GUESS &&
    olaGuessState.data.guess.predictedPlace === 1 &&
    aniaAfterOla.status === 204,
  `${olaGuessState.body} ${aniaAfterOla.status}`,
);
const aniaStateNow = await request(guestStateApi(aniaNewKey));
const aniaLeaks = leaksIn(
  withoutVersions(stripTablemates(aniaStateNow.data)),
  [OLA_GUESS, CORRECT],
  [...SECRET_WORDS, GUEST_NAMES[2]],
);
const olaLeaks = leaksIn(
  withoutVersions(stripTablemates(olaGuessState.data)),
  [ANIA_GUESS],
  [...SECRET_WORDS, GUEST_NAMES[0]],
);
check(
  "a guest's state shows nobody else's guess",
  aniaStateNow.data?.guess?.amountGrosze === ANIA_GUESS && aniaLeaks.length === 0 && olaLeaks.length === 0,
  [...aniaLeaks, ...olaLeaks].join(" | "),
);

const closed = await request(guessesApi, { method: "PATCH", json: { intakeOpen: false } });
const aniaSeesClosed = await guestSince(aniaNewKey, aniaSaved.data?.version);
check(
  "closing intake reaches the guest's phone through the same poll",
  closed.status === 200 &&
    closed.data?.intakeOpen === false &&
    aniaSeesClosed.status === 200 &&
    aniaSeesClosed.data?.guess?.intakeOpen === false &&
    aniaSeesClosed.data.guess.amountGrosze === ANIA_GUESS,
  `${closed.status} ${aniaSeesClosed.status} ${aniaSeesClosed.body}`,
);
const lateGuess = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "9999" } });
const afterLate = await request(guestStateApi(aniaNewKey));
check(
  "after closing, the guest cannot change her guess",
  lateGuess.status === 409 &&
    errorOf(lateGuess) === "Przyjmowanie strzałów jest zamknięte." &&
    afterLate.data?.guess?.amountGrosze === ANIA_GUESS,
  `${lateGuess.status} ${lateGuess.body}`,
);

const correctSet = await request(guessesApi, { method: "PATCH", json: { correctAmount: "5 000,00 zł" } });
check(
  "the correct amount gives the ranking by distance",
  correctSet.status === 200 &&
    correctSet.data?.correctAmountGrosze === CORRECT &&
    correctSet.data.ranking?.correctAmountGrosze === CORRECT &&
    rankOf(correctSet, ola.id)?.place === 1 &&
    rankOf(correctSet, ola.id)?.distanceGrosze === OLA_GUESS - CORRECT &&
    rankOf(correctSet, ania.id)?.place === 2 &&
    rankOf(correctSet, ania.id)?.differenceGrosze === ANIA_GUESS - CORRECT &&
    rankOf(correctSet, ania.id)?.tied === false &&
    rankOf(correctSet, ola.id)?.predictedPlace === 1 &&
    rankOf(correctSet, ola.id)?.placeHit === true &&
    rankOf(correctSet, ania.id)?.predictedPlace === 2 &&
    rankOf(correctSet, ania.id)?.placeHit === true,
  `${correctSet.status} ${correctSet.body}`,
);
const aniaTie = await request(`${guessesApi}/${ania.id}`, { method: "PUT", json: { amount: "2222,23" } });
check(
  "organizer corrects a guess after closing; equal distances share a place marked as a tie",
  aniaTie.status === 200 &&
    boardGuest(aniaTie, ania.id)?.amountGrosze === ANIA_TIE &&
    boardGuest(aniaTie, ania.id)?.enteredBy === "organizer" &&
    rankOf(aniaTie, ania.id)?.place === 1 &&
    rankOf(aniaTie, ola.id)?.place === 1 &&
    rankOf(aniaTie, ania.id)?.tied === true &&
    rankOf(aniaTie, ola.id)?.tied === true &&
    // The tie at 1 spans places 1–2: both predictions (2 and 1) still hit; the amount-only save kept the place.
    rankOf(aniaTie, ania.id)?.predictedPlace === 2 &&
    rankOf(aniaTie, ania.id)?.placeHit === true &&
    rankOf(aniaTie, ola.id)?.placeHit === true,
  `${aniaTie.status} ${aniaTie.body}`,
);

const aniaWithRanking = await request(guestStateApi(aniaNewKey));
const olaWithRanking = await request(guestStateApi(olaKey));
const rankingLeaks = [
  ...leaksIn(withoutVersions(aniaWithRanking.data), [OLA_GUESS, CORRECT], SECRET_WORDS),
  ...leaksIn(withoutVersions(olaWithRanking.data), [ANIA_TIE, CORRECT], SECRET_WORDS),
];
check(
  "with a ranking in place, guests still see only their own guess",
  aniaWithRanking.data?.guess?.amountGrosze === ANIA_TIE &&
    olaWithRanking.data?.guess?.amountGrosze === OLA_GUESS &&
    rankingLeaks.length === 0,
  rankingLeaks.join(" | "),
);
const tvWithGuesses = await request(tvSeatingApi);
const tvPageWithGuesses = await request(`/tv/${tvKey}`);
const tvLeaks = [
  ...leaksIn(
    withoutVersions(tvWithGuesses.data),
    [ANIA_TIE, OLA_GUESS, CORRECT, ANIA_GUESS],
    [...SECRET_WORDS, "guess", "amount", "predictedPlace"],
  ),
  ...leaksIn(
    tvPageWithGuesses.body,
    [],
    ["7 777,77", "7777,77", "5 000,00", "2 222,23", "amountGrosze", "guess", "predictedPlace"],
  ),
];
check(
  "the TV shows no guesses, correct amount or ranking",
  tvWithGuesses.status === 200 && tvPageWithGuesses.status === 200 && tvLeaks.length === 0,
  tvLeaks.join(" | "),
);

for (const [json, message] of [
  [{}, "Nieprawidłowe dane."],
  [{ intakeOpen: "no" }, "Nieprawidłowe dane."],
  [{ intakeOpen: true, extra: 1 }, "Nieprawidłowe dane."],
  [{ correctAmount: "abc" }, "Wpisz kwotę w złotych, np. 1500 albo 1499,99."],
  [{ correctAmount: "-1" }, "Kwota nie może być ujemna."],
]) {
  const res = await request(guessesApi, { method: "PATCH", json });
  check(`guesses settings refuse ${JSON.stringify(json)}`, res.status === 400 && errorOf(res) === message, res.body);
}
for (const [path, method, json, status] of [
  [`${guessesApi}/999999999`, "PUT", { amount: "1" }, 404],
  [`${guessesApi}/abc`, "PUT", { amount: "1" }, 404],
  [`${guessesApi}/999999999`, "DELETE", undefined, 404],
  [`${guessesApi}/${ola.id}`, "PUT", { amount: "x" }, 400],
  [`${guessesApi}/${ola.id}`, "PUT", { amount: "1", guestId: ania.id }, 400],
  [`${guessesApi}/${ola.id}`, "PUT", { amount: "1", place: "abc" }, 400],
  [`${guessesApi}/${ola.id}`, "PUT", { amount: "1", place: "999" }, 400],
]) {
  const res = await request(path, { method, json });
  check(
    `organizer guess ${method} ${path.replace(guessesApi, "…/guesses")} → ${status}`,
    res.status === status && (status !== 404 || errorOf(res) === "Nie znaleziono gościa."),
    `${res.status} ${res.body}`,
  );
}
const olaDeleted = await request(`${guessesApi}/${ola.id}`, { method: "DELETE" });
check(
  "organizer deletes a guess: the guest is missing again and out of the ranking",
  olaDeleted.status === 200 &&
    isMissingGuess(olaDeleted, ola.id) &&
    rankOf(olaDeleted, ola.id) === undefined &&
    rankOf(olaDeleted, ania.id)?.tied === false,
  `${olaDeleted.status} ${olaDeleted.body}`,
);
await request(`${guessesApi}/${ola.id}`, { method: "PUT", json: { amount: "7777,77" } });

for (const key of [tvKey, aniaNewKey]) {
  for (const [path, method, json] of [
    [`/api/o/${key}/guesses`, "GET", undefined],
    [`/api/o/${key}/guesses`, "PATCH", { intakeOpen: true }],
    [`/api/o/${key}/guesses/${ola.id}`, "PUT", { amount: "1" }],
    [`/api/o/${key}/guesses/${ola.id}`, "DELETE", undefined],
  ]) {
    const res = await request(path, { method, json });
    check(
      `guesses API with a wrong key: ${method} ${path.replace(tvKey, "<tv>").replace(aniaNewKey, "<guest>")}`,
      noAccessJson(res),
      `${res.status} ${res.body}`,
    );
  }
}
for (const key of [organizerKey, tvKey]) {
  const res = await request(guessApi(key), { method: "PUT", json: { amount: "1" } });
  check(
    `guest guess API with a wrong key: ${key === organizerKey ? "<organizer>" : "<tv>"}`,
    noAccessJson(res),
    `${res.status} ${res.body}`,
  );
}
const guessesAfterWrongKeys = await request(guessesApi);
check(
  "wrong keys changed nothing",
  guessesAfterWrongKeys.data?.intakeOpen === false &&
    boardGuest(guessesAfterWrongKeys, ola.id)?.amountGrosze === OLA_GUESS &&
    boardGuest(guessesAfterWrongKeys, ania.id)?.amountGrosze === ANIA_TIE,
  guessesAfterWrongKeys.body,
);

const reopened = await request(guessesApi, { method: "PATCH", json: { intakeOpen: true } });
const aniaAgain = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "2222.23" } });
const boardReopened = await request(guessesApi);
check(
  "after reopening, the guest can change her guess again",
  reopened.status === 200 &&
    reopened.data?.intakeOpen === true &&
    aniaAgain.status === 200 &&
    aniaAgain.data?.guess?.amountGrosze === ANIA_TIE &&
    boardGuest(boardReopened, ania.id)?.enteredBy === "guest" &&
    rankOf(boardReopened, ania.id)?.tied === true,
  `${reopened.status} ${aniaAgain.status} ${aniaAgain.body}`,
);
// Guest page (S-06): the "Twój strzał" section with her own guess, nothing about anyone else's or the ranking.
const phoneWithGuess = await request(`/g/${aniaNewKey}`);
const phoneGuessLeaks = leaksIn(
  phoneWithGuess.body,
  [],
  [`7${NBSP}777,77`, "7 777,77", "7777,77", `5${NBSP}000,00`, "5 000,00", "correctAmount", "ranking", "distanceGrosze"],
);
check(
  "guest page shows her own guess in the guess section",
  phoneWithGuess.status === 200 &&
    phoneWithGuess.body.includes("Twój strzał") &&
    phoneWithGuess.body.includes(`2${NBSP}222,23${NBSP}zł`) &&
    phoneWithGuess.body.includes("Twój typ miejsca") &&
    phoneWithGuess.body.includes("GuestGuessView"),
  String(phoneWithGuess.status),
);
check(
  "guest page leaks no other guess, correct amount or ranking",
  phoneGuessLeaks.length === 0,
  phoneGuessLeaks.join(" | "),
);
const olaPhone = await request(`/g/${olaKey}`);
check(
  "another guest's page shows only her own guess",
  olaPhone.status === 200 &&
    olaPhone.body.includes(`7${NBSP}777,77${NBSP}zł`) &&
    !olaPhone.body.includes("2 222,23") &&
    !olaPhone.body.includes(`2${NBSP}222,23`),
  String(olaPhone.status),
);

// State for the page checks below: intake open, correct amount 5 000,00 zł, Ania 2 222,23 zł (her own) and
// Ola 7 777,77 zł (entered by the organizer) tied on place 1.
const guessesPage = await request(`/o/${organizerKey}/strzaly`);
check(
  "guesses page shows every guess, the tied ranking and the readout button",
  guessesPage.status === 200 &&
    guessesPage.body.includes("Strzały i ranking") &&
    guessesPage.body.includes(GUEST_NAMES[0]) &&
    guessesPage.body.includes(GUEST_NAMES[2]) &&
    guessesPage.body.includes(`2${NBSP}222,23${NBSP}zł`) &&
    guessesPage.body.includes(`7${NBSP}777,77${NBSP}zł`) &&
    guessesPage.body.includes(`5${NBSP}000,00${NBSP}zł`) &&
    guessesPage.body.includes("remis") &&
    guessesPage.body.includes("Czytaj od końca") &&
    guessesPage.body.includes("Zamknij przyjmowanie") &&
    guessesPage.body.includes("GuessManager") &&
    guessesPage.cacheControl.includes("no-store"),
  String(guessesPage.status),
);
for (const key of [tvKey, aniaNewKey]) {
  const res = await request(`/o/${key}/strzaly`);
  const leaks = leaksIn(res.body, [ANIA_TIE, OLA_GUESS, CORRECT], GUEST_NAMES);
  check(
    `guesses page with a wrong key: ${key === tvKey ? "<tv>" : "<guest>"}`,
    res.status === 404 && res.body === deniedBody && leaks.length === 0,
    `${res.status} ${leaks.join(" | ")}`,
  );
}
const shellWithGuesses = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the guesses page with its summary",
  shellWithGuesses.status === 200 &&
    shellWithGuesses.body.includes(`/o/${organizerKey}/strzaly`) &&
    shellWithGuesses.body.includes("Przyjmowanie otwarte · strzały: 2 z 2 · ranking gotowy") &&
    countOf(shellWithGuesses.body, "Wkrótce") === 0,
  String(shellWithGuesses.status),
);

// 19. Question base and draw (S-07). The event was created with the starter base. The organizer pastes, edits, deletes
// and reloads the starter base; the organizer and guests draw ONE question each (never the list); nothing is stored,
// so nobody else sees a draw; the TV gets nothing. Guest access is on here.
const questionsApi = `${api}/questions`;
const guestDrawApi = (key) => `/api/g/${key}/questions/draw`;
const QUESTION_CATEGORIES = ["kontrowersyjne", "generyczne", "refleksyjne"];
const isQuestion = (question) =>
  typeof question === "object" &&
  question !== null &&
  Object.keys(question).sort().join(",") === "category,id,text" &&
  Number.isInteger(question.id) &&
  QUESTION_CATEGORIES.includes(question.category) &&
  typeof question.text === "string" &&
  question.text.length >= 5;
const inCategory = (questions, category) => questions.filter((question) => question.category === category);
// A draw answer is exactly { question } with one question (or null) — never a list.
const isDrawAnswer = (res, category) =>
  res.status === 200 &&
  Object.keys(res.data ?? {}).join(",") === "question" &&
  isQuestion(res.data.question) &&
  (category === null || res.data.question.category === category);

const questionBase = await request(questionsApi);
const baseQuestions = questionBase.data?.questions ?? [];
check(
  "question base: a new event starts with the starter base (~30 per category)",
  questionBase.status === 200 &&
    questionBase.cacheControl.includes("no-store") &&
    baseQuestions.length >= 80 &&
    QUESTION_CATEGORIES.every((category) => inCategory(baseQuestions, category).length >= 25) &&
    questionBase.data.starterMissing === 0 &&
    baseQuestions.every(isQuestion),
  `${questionBase.status} ${baseQuestions.length}`,
);
if (baseQuestions.length === 0) finish();
const starterCount = baseQuestions.length;
const starterReflective = inCategory(baseQuestions, "refleksyjne");

const starterAgain = await request(`${questionsApi}/starter`, { method: "POST" });
check(
  "loading the starter base again adds nothing",
  starterAgain.status === 200 &&
    starterAgain.data?.added === 0 &&
    starterAgain.data.questions.length === starterCount &&
    starterAgain.data.starterMissing === 0,
  `${starterAgain.status} ${starterAgain.body.slice(0, 120)}`,
);

const [firstStarter] = baseQuestions;
const starterDeleted = await request(`${questionsApi}/${firstStarter.id}`, { method: "DELETE" });
const starterBack = await request(`${questionsApi}/starter`, { method: "POST" });
check(
  "a deleted starter question is missing until the starter base is loaded again",
  starterDeleted.status === 200 &&
    starterDeleted.data?.starterMissing === 1 &&
    !starterDeleted.data.questions.some((question) => question.id === firstStarter.id) &&
    starterBack.status === 200 &&
    starterBack.data?.added === 1 &&
    starterBack.data.starterMissing === 0 &&
    starterBack.data.questions.some(
      (question) => question.text === firstStarter.text && question.category === firstStarter.category,
    ),
  `${starterDeleted.status} ${starterBack.status} ${starterBack.body.slice(0, 120)}`,
);

// Paste into "generyczne": a marker and extra spaces, a blank line, a case variant of a starter question, a repeat
// of the first line, a too short and a too long line.
const [someGeneric] = inCategory(baseQuestions, "generyczne");
const SMOKE_Q1 = "Pytanie smoke pierwsze?";
const SMOKE_Q2 = "Pytanie smoke drugie?";
const questionPaste = await request(questionsApi, {
  method: "POST",
  json: {
    category: "generyczne",
    text: [
      `1.   ${SMOKE_Q1}  `,
      "",
      SMOKE_Q2,
      someGeneric.text.toUpperCase(),
      SMOKE_Q1.toLowerCase(),
      "Abc?",
      "x".repeat(301),
      "",
    ].join("\n"),
  },
});
const skippedSummary = (questionPaste.data?.skipped ?? []).map((skip) => `${skip.line}:${skip.reason}`).join(",");
const smokeQ1 = questionPaste.data?.questions?.find((question) => question.text === SMOKE_Q1);
const smokeQ2 = questionPaste.data?.questions?.find((question) => question.text === SMOKE_Q2);
check(
  "paste adds the new questions to the chosen category and lists every skipped line",
  questionPaste.status === 201 &&
    questionPaste.data?.added === 2 &&
    skippedSummary === "4:duplicate,5:repeated,6:too-short,7:too-long" &&
    smokeQ1?.category === "generyczne" &&
    smokeQ2?.category === "generyczne" &&
    questionPaste.data.questions.length === starterCount + 2,
  `${questionPaste.status} ${skippedSummary} ${questionPaste.body.slice(0, 160)}`,
);
if (!smokeQ1 || !smokeQ2) finish();

for (const [name, json, message] of [
  ["only blank lines", { category: "generyczne", text: " \n\n " }, "Wpisz co najmniej jedno pytanie."],
  ["an unknown category", { category: "polityczne", text: "Pytanie smoke trzecie?" }, "Nieprawidłowe dane."],
  ["an extra key", { category: "generyczne", text: "Pytanie smoke trzecie?", guestId: ola.id }, "Nieprawidłowe dane."],
]) {
  const res = await request(questionsApi, { method: "POST", json });
  check(`paste with ${name}: 400`, res.status === 400 && res.data?.error === message, `${res.status} ${res.body}`);
}

const edited = await request(`${questionsApi}/${smokeQ1.id}`, {
  method: "PATCH",
  json: { text: "  Pytanie smoke   zmienione? ", category: "refleksyjne" },
});
check(
  "editing a question changes its text (normalized) and category",
  edited.status === 200 &&
    edited.data?.questions?.some(
      (question) =>
        question.id === smokeQ1.id &&
        question.text === "Pytanie smoke zmienione?" &&
        question.category === "refleksyjne",
    ),
  `${edited.status} ${edited.body.slice(0, 160)}`,
);
for (const [name, path, json, status, message] of [
  [
    "to a text already in the base",
    `${questionsApi}/${smokeQ1.id}`,
    { text: someGeneric.text.toLowerCase() },
    409,
    "To pytanie już jest w bazie.",
  ],
  [
    "to a too short text",
    `${questionsApi}/${smokeQ1.id}`,
    { text: "abc" },
    400,
    "Pytanie musi mieć co najmniej 5 znaków.",
  ],
  ["with nothing to change", `${questionsApi}/${smokeQ1.id}`, {}, 400, "Nieprawidłowe dane."],
  ["of an unknown question", `${questionsApi}/999999999`, { category: "generyczne" }, 404, "Nie znaleziono pytania."],
  ["of a malformed id", `${questionsApi}/abc`, { category: "generyczne" }, 404, "Nie znaleziono pytania."],
]) {
  const res = await request(path, { method: "PATCH", json });
  check(`edit ${name}: ${status}`, res.status === status && res.data?.error === message, `${res.status} ${res.body}`);
}
const deleted = await request(`${questionsApi}/${smokeQ2.id}`, { method: "DELETE" });
const deletedAgain = await request(`${questionsApi}/${smokeQ2.id}`, { method: "DELETE" });
check(
  "deleting a question removes it once",
  deleted.status === 200 &&
    !deleted.data?.questions?.some((question) => question.id === smokeQ2.id) &&
    deletedAgain.status === 404 &&
    deletedAgain.data?.error === "Nie znaleziono pytania.",
  `${deleted.status} ${deletedAgain.status}`,
);

// The organizer draws for themself.
const organizerDraw = await request(`${questionsApi}/draw`, { method: "POST", json: { category: "generyczne" } });
check(
  "organizer draw from a category: one question of it",
  isDrawAnswer(organizerDraw, "generyczne"),
  organizerDraw.body,
);
const organizerDrawAll = await request(`${questionsApi}/draw`, {
  method: "POST",
  json: { category: null, recent: [firstStarter.id] },
});
check("organizer draw from all categories: one question", isDrawAnswer(organizerDrawAll, null), organizerDrawAll.body);
for (const [name, json] of [
  ["an unknown category", { category: "polityczne" }],
  ["no category key", { recent: [] }],
  ["101 recent ids", { category: null, recent: Array.from({ length: 101 }, (_, index) => index + 1) }],
  ["a non-positive recent id", { category: null, recent: [0] }],
]) {
  const res = await request(`${questionsApi}/draw`, { method: "POST", json });
  check(`organizer draw with ${name}: 400`, res.status === 400, `${res.status} ${res.body}`);
}

// Guests draw one question per request, per category or from all; never the list.
for (const category of [...QUESTION_CATEGORIES, null]) {
  const res = await request(guestDrawApi(aniaNewKey), { method: "POST", json: { category } });
  check(`guest draw (${category ?? "wszystkie"}): exactly one question`, isDrawAnswer(res, category), res.body);
}
const olaDraw = await request(guestDrawApi(olaKey), {
  method: "POST",
  json: { category: "kontrowersyjne", recent: [] },
});
check("another guest draws on her own phone", isDrawAnswer(olaDraw, "kontrowersyjne"), olaDraw.body);
const guestDrawExtra = await request(guestDrawApi(aniaNewKey), {
  method: "POST",
  json: { category: "kontrowersyjne", guestId: ola.id },
});
check("guest draw naming another guest: 400", guestDrawExtra.status === 400, `${guestDrawExtra.status}`);
const guestList = await request(`/api/g/${aniaNewKey}/questions`);
check(
  "a guest has no question list route",
  guestList.status === 404 && !baseQuestions.some((question) => guestList.body.includes(question.text)),
  String(guestList.status),
);

// Pages: the guest's phone has the draw section but no question from the base (a draw happens in the browser and
// stays there); the TV shows no question either.
const currentBase = (await request(questionsApi)).data?.questions ?? [];
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;");
const questionLeaks = (body) =>
  currentBase
    .filter((question) => body.includes(question.text) || body.includes(escapeHtml(question.text)))
    .map((question) => question.text);
const phoneWithQuestions = await request(`/g/${aniaNewKey}`);
check(
  "guest page has the question draw section",
  phoneWithQuestions.status === 200 &&
    currentBase.length > 0 &&
    phoneWithQuestions.body.includes("Pytanie do rozmowy") &&
    phoneWithQuestions.body.includes("Wylosowane pytanie widzisz tylko Ty.") &&
    phoneWithQuestions.body.includes("Losuj pytanie") &&
    phoneWithQuestions.body.includes("GuestQuestionDraw"),
  String(phoneWithQuestions.status),
);
check(
  "guest page leaks no question from the base",
  questionLeaks(phoneWithQuestions.body).length === 0,
  questionLeaks(phoneWithQuestions.body).join(" | "),
);
const tvWithQuestions = await request(`/tv/${tvKey}`);
check(
  "TV page shows no question",
  tvWithQuestions.status === 200 && questionLeaks(tvWithQuestions.body).length === 0,
  `${tvWithQuestions.status} ${questionLeaks(tvWithQuestions.body).join(" | ")}`,
);

// Empty category: delete every "refleksyjne" question, draw → null, the starter base restores them.
for (const question of inCategory(edited.data?.questions ?? [], "refleksyjne")) {
  await request(`${questionsApi}/${question.id}`, { method: "DELETE" });
}
const emptyBase = await request(questionsApi);
const emptyOrganizerDraw = await request(`${questionsApi}/draw`, { method: "POST", json: { category: "refleksyjne" } });
const emptyGuestDraw = await request(guestDrawApi(aniaNewKey), { method: "POST", json: { category: "refleksyjne" } });
check(
  "an empty category draws no question",
  inCategory(emptyBase.data?.questions ?? [], "refleksyjne").length === 0 &&
    emptyOrganizerDraw.status === 200 &&
    emptyOrganizerDraw.body === JSON.stringify({ question: null }) &&
    emptyGuestDraw.status === 200 &&
    emptyGuestDraw.body === JSON.stringify({ question: null }),
  `${emptyOrganizerDraw.body} ${emptyGuestDraw.body}`,
);
const reflectiveBack = await request(`${questionsApi}/starter`, { method: "POST" });
check(
  "the starter base restores the deleted starter questions of the category",
  reflectiveBack.status === 200 &&
    reflectiveBack.data?.added === starterReflective.length &&
    reflectiveBack.data.starterMissing === 0,
  `${reflectiveBack.status} ${reflectiveBack.data?.added}`,
);

// The organizer's questions page and the shell card; other roles get the identical denial without any question.
const finalBase = reflectiveBack.data?.questions ?? [];
const plainStarter = finalBase.find((question) => !/[&"'<>]/.test(question.text));
const questionsPage = await request(`/o/${organizerKey}/pytania`);
check(
  "questions page shows the base, the starter card and the draw",
  questionsPage.status === 200 &&
    questionsPage.cacheControl.includes("no-store") &&
    plainStarter !== undefined &&
    questionsPage.body.includes(plainStarter.text) &&
    questionsPage.body.includes("Pytania do rozmowy") &&
    questionsPage.body.includes("Wczytaj bazę startową") &&
    questionsPage.body.includes("Baza startowa jest kompletna.") &&
    questionsPage.body.includes("Losuj pytanie") &&
    questionsPage.body.includes("QuestionManager"),
  String(questionsPage.status),
);
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  const res = await request(`/o/${key}/pytania`);
  check(
    `questions page with a wrong key: ${label}`,
    res.status === 404 && res.body === deniedBody && !finalBase.some((question) => res.body.includes(question.text)),
    String(res.status),
  );
}
const shellWithQuestions = await request(`/o/${organizerKey}`);
const finalCounts = Object.fromEntries(
  QUESTION_CATEGORIES.map((category) => [category, inCategory(finalBase, category).length]),
);
check(
  "organizer shell links to the questions page with its summary",
  shellWithQuestions.status === 200 &&
    shellWithQuestions.body.includes(`/o/${organizerKey}/pytania`) &&
    shellWithQuestions.body.includes("Pytania do rozmowy") &&
    shellWithQuestions.body.includes(`${finalBase.length} pyta`) &&
    shellWithQuestions.body.includes(
      ` · kontrowersyjne ${finalCounts.kontrowersyjne} · generyczne ${finalCounts.generyczne} · refleksyjne ${finalCounts.refleksyjne}`,
    ) &&
    shellWithQuestions.body.includes("Tematy AI") &&
    countOf(shellWithQuestions.body, "Wkrótce") === 0,
  String(shellWithQuestions.status),
);

// Wrong roles: guests and the TV never reach the organizer question API; organizer and TV keys are not guest keys.
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  for (const [method, path, json] of [
    ["GET", `/api/o/${key}/questions`],
    ["POST", `/api/o/${key}/questions`, { category: "generyczne", text: "Pytanie od intruza?" }],
    ["PATCH", `/api/o/${key}/questions/${smokeQ1.id}`, { text: "Pytanie od intruza?" }],
    ["DELETE", `/api/o/${key}/questions/${firstStarter.id}`],
    ["POST", `/api/o/${key}/questions/starter`],
    ["POST", `/api/o/${key}/questions/draw`, { category: null }],
  ]) {
    const res = await request(path, { method, json });
    check(
      `question API with a wrong key: ${method} ${path.replace(key, label)}`,
      noAccessJson(res),
      `${res.status} ${res.body.slice(0, 120)}`,
    );
  }
}
for (const [label, key] of [
  ["<organizer>", organizerKey],
  ["<tv>", tvKey],
]) {
  const res = await request(guestDrawApi(key), { method: "POST", json: { category: null } });
  check(`guest draw with a wrong key: ${label}`, noAccessJson(res), `${res.status} ${res.body}`);
}
const tvDraw = await request(`/api/tv/${tvKey}/questions/draw`, { method: "POST", json: { category: null } });
check(
  "the TV has no question route",
  tvDraw.status === 404 && !baseQuestions.some((question) => tvDraw.body.includes(question.text)),
  String(tvDraw.status),
);

// 20. AI conversation topics (S-08). Only the MOCK provider is ever asked here (no network, no cost): when the server
// reports another provider, every generate check is skipped and one check fails. A guest gets at most 25 topics; a
// failed attempt (header x-ai-mock: fail, honoured only by the mock) does not count; the organizer has no personal
// limit; nothing is stored, so no page shows a topic; the TV gets nothing. Guest access is on here.
const aiApi = `${api}/ai-topics`;
// The limits of src/lib/ai-topics/limits.ts (MAX_GUEST_TOPICS, MAX_EVENT_TOPICS).
const GUEST_AI_LIMIT = 25;
const EVENT_AI_LIMIT = 1000;
const GUEST_AI_FULL = `${GUEST_AI_LIMIT} z ${GUEST_AI_LIMIT}`;
const guestAiApi = (key) => `/api/g/${key}/ai-topics`;
const AI_FAIL = { "x-ai-mock": "fail" };
const keysOf = (value) =>
  Object.keys(value ?? {})
    .sort()
    .join(",");
const isTopic = (topic, category) =>
  keysOf(topic) === "category,text" &&
  QUESTION_CATEGORIES.includes(topic.category) &&
  (category === null || topic.category === category) &&
  typeof topic.text === "string" &&
  topic.text.trim().length >= 5;
const isQuota = (quota, remaining) =>
  keysOf(quota) === "eventExhausted,limit,remaining,used" &&
  quota.limit === GUEST_AI_LIMIT &&
  quota.remaining === remaining &&
  quota.used === GUEST_AI_LIMIT - remaining &&
  quota.eventExhausted === false;
// The mock bills nothing: no tokens, an estimate of 0. lastFailureHint = why the latest finished attempt failed.
const MOCK_FAILURE_HINT = "Dostawca AI niedostępny.";
const usageText = (used, failed, lastFailureHint = null) =>
  JSON.stringify({
    used,
    limit: EVENT_AI_LIMIT,
    failed,
    guestLimit: GUEST_AI_LIMIT,
    inputTokens: 0,
    outputTokens: 0,
    costNanoUsd: 0,
    lastFailureHint,
  });
const generatedTopics = [];
const topicLeaks = (body) => generatedTopics.filter((text) => body.includes(text) || body.includes(escapeHtml(text)));

// client-restaurant-split: the AI board (usage, provider, spend) is the venue's — GET in the panel; the client link's
// GET answers the identical denial and its generation answers the counts without spend or hints.
const aiBoard = await request(`${opsPanel}/ai-topics`, asOps());
const clientAiBoard = await request(aiApi);
check("AI board on the client link: the identical denial", noAccessJson(clientAiBoard), String(clientAiBoard.status));
check(
  "AI board (panel): usage starts at zero, with the limits and the provider (never a key)",
  aiBoard.status === 200 &&
    aiBoard.cacheControl.includes("no-store") &&
    keysOf(aiBoard.data) === "provider,usage" &&
    JSON.stringify(aiBoard.data.usage) === usageText(0, 0) &&
    keysOf(aiBoard.data.provider) === "kind,model,problem,ready",
  aiBoard.body.slice(0, 200),
);
const olaPageBeforeAi = await request(`/g/${olaKey}`);
check(
  "guest page has the AI topic section with the full quota",
  olaPageBeforeAi.status === 200 &&
    olaPageBeforeAi.body.includes("Temat od AI") &&
    olaPageBeforeAi.body.includes("GuestTopicView") &&
    olaPageBeforeAi.body.includes(`Zostało ${GUEST_AI_FULL}`) &&
    olaPageBeforeAi.body.includes("Temat widzisz tylko Ty."),
  String(olaPageBeforeAi.status),
);
const aiOnMock = aiBoard.data?.provider?.kind === "mock" && aiBoard.data.provider.ready === true;
check(
  "AI provider is the mock (the smoke never makes a paid call; set AI_PROVIDER=mock)",
  aiOnMock,
  JSON.stringify(aiBoard.data?.provider),
);

if (aiOnMock) {
  // Ania: one topic per category and one from all, then more until one is left; every answer carries her quota.
  let aniaRemaining = GUEST_AI_LIMIT;
  const aniaCategories = [...QUESTION_CATEGORIES, null];
  while (aniaCategories.length < GUEST_AI_LIMIT - 1) aniaCategories.push(null);
  for (const category of aniaCategories) {
    const res = await request(guestAiApi(aniaNewKey), { method: "POST", json: { category } });
    aniaRemaining--;
    check(
      `guest AI topic (${category ?? "wszystkie"}): one topic, ${aniaRemaining} left`,
      res.status === 200 &&
        keysOf(res.data) === "quota,topic" &&
        isTopic(res.data.topic, category) &&
        isQuota(res.data.quota, aniaRemaining),
      res.body.slice(0, 200),
    );
    if (typeof res.data?.topic?.text === "string") generatedTopics.push(res.data.topic.text);
  }
  for (const [name, json] of [
    ["an extra key", { category: null, guestId: ola.id }],
    ["an unknown category", { category: "polityczne" }],
    ["no category key", {}],
  ]) {
    const res = await request(guestAiApi(aniaNewKey), { method: "POST", json });
    check(
      `guest AI topic with ${name}: 400`,
      res.status === 400 && res.data?.error === "Nieprawidłowe dane.",
      `${res.status} ${res.body}`,
    );
  }
  const aiGet = await request(guestAiApi(aniaNewKey));
  check(
    "the guest AI route has no GET",
    (aiGet.status === 404 || aiGet.status === 405) && topicLeaks(aiGet.body).length === 0,
    String(aiGet.status),
  );

  // A failed attempt says so in Polish, points at the question draw and leaves the quota alone.
  const aniaFail = await request(guestAiApi(aniaNewKey), {
    method: "POST",
    json: { category: "generyczne" },
    extraHeaders: AI_FAIL,
  });
  check(
    "a failed guest attempt: 503, Polish message, quota unchanged, no provider details",
    aniaFail.status === 503 &&
      keysOf(aniaFail.data) === "error,quota" &&
      aniaFail.data.error.includes("nie zmniejszyła limitu") &&
      aniaFail.data.error.includes("Losuj pytanie") &&
      isQuota(aniaFail.data.quota, 1),
    aniaFail.body,
  );
  const aniaFifth = await request(guestAiApi(aniaNewKey), { method: "POST", json: { category: "refleksyjne" } });
  check(
    "the failed attempt left the last topic available",
    aniaFifth.status === 200 && isTopic(aniaFifth.data?.topic, "refleksyjne") && isQuota(aniaFifth.data.quota, 0),
    aniaFifth.body.slice(0, 200),
  );
  if (typeof aniaFifth.data?.topic?.text === "string") generatedTopics.push(aniaFifth.data.topic.text);
  const aniaSixth = await request(guestAiApi(aniaNewKey), { method: "POST", json: { category: null } });
  check(
    "one topic over the limit is refused with a clear Polish message",
    aniaSixth.status === 429 &&
      keysOf(aniaSixth.data) === "error,quota" &&
      aniaSixth.data.error.includes(GUEST_AI_FULL) &&
      isQuota(aniaSixth.data.quota, 0),
    aniaSixth.body,
  );
  const aniaSixthFailing = await request(guestAiApi(aniaNewKey), {
    method: "POST",
    json: { category: null },
    extraHeaders: AI_FAIL,
  });
  check(
    "at the limit even a failing attempt is refused before the AI is asked",
    aniaSixthFailing.status === 429 && aniaSixthFailing.data?.error?.includes(GUEST_AI_FULL),
    aniaSixthFailing.body,
  );

  // Ola has her own limit.
  const olaTopic = await request(guestAiApi(olaKey), { method: "POST", json: { category: "kontrowersyjne" } });
  check(
    "another guest has her own limit",
    olaTopic.status === 200 &&
      isTopic(olaTopic.data?.topic, "kontrowersyjne") &&
      isQuota(olaTopic.data.quota, GUEST_AI_LIMIT - 1),
    olaTopic.body.slice(0, 200),
  );
  if (typeof olaTopic.data?.topic?.text === "string") generatedTopics.push(olaTopic.data.topic.text);

  // The organizer: no personal limit (more than a guest gets); a failure carries a hint about the cause.
  const organizerCount = GUEST_AI_LIMIT + 1;
  const evening = GUEST_AI_LIMIT + 1 + organizerCount;
  let organizerTopics = 0;
  let organizerUsage = null;
  for (let index = 0; index < organizerCount; index++) {
    const category = index % 2 === 0 ? "refleksyjne" : null;
    const res = await request(aiApi, { method: "POST", json: { category } });
    if (res.status === 200 && keysOf(res.data) === "topic,usage" && isTopic(res.data.topic, category)) {
      organizerTopics++;
      generatedTopics.push(res.data.topic.text);
    }
    organizerUsage = res.data?.usage;
  }
  check(
    `the organizer generates more than ${GUEST_AI_LIMIT} topics`,
    organizerTopics === organizerCount && JSON.stringify(organizerUsage) === usageText(evening, 1),
    `${organizerTopics} ${JSON.stringify(organizerUsage)}`,
  );
  const organizerFail = await request(aiApi, { method: "POST", json: { category: null }, extraHeaders: AI_FAIL });
  check(
    "a failed client attempt: 503 with the message and the counts, no hint (the cause is the venue's)",
    organizerFail.status === 503 &&
      keysOf(organizerFail.data) === "error,usage" &&
      organizerFail.data.error.includes("nie zmniejszyła limitu") &&
      JSON.stringify(organizerFail.data.usage) === usageText(evening, 2),
    organizerFail.body,
  );
  const organizerExtra = await request(aiApi, { method: "POST", json: { category: null, guestId: ola.id } });
  check("organizer AI topic with an extra key: 400", organizerExtra.status === 400, String(organizerExtra.status));
  const aiBoardAfter = await request(`${opsPanel}/ai-topics`, asOps());
  check(
    "AI board (panel) counts every success and every failure, with the latest failure's hint",
    aiBoardAfter.status === 200 &&
      JSON.stringify(aiBoardAfter.data?.usage) === usageText(evening, 2, MOCK_FAILURE_HINT),
    aiBoardAfter.body.slice(0, 200),
  );

  // Nothing is stored: no page shows a generated topic, not even the phone that asked for it.
  for (const [label, path] of [
    ["TV page", `/tv/${tvKey}`],
    ["the asking guest's page", `/g/${aniaNewKey}`],
    ["another guest's page", `/g/${olaKey}`],
    ["organizer shell", `/o/${organizerKey}`],
  ]) {
    const res = await request(path);
    check(
      `${label} shows no generated AI topic`,
      res.status === 200 && generatedTopics.length === evening && topicLeaks(res.body).length === 0,
      `${res.status} ${topicLeaks(res.body).join(" | ")}`,
    );
  }
  const aniaPageAfterAi = await request(`/g/${aniaNewKey}`);
  check(
    "the guest page renders the used-up quota",
    aniaPageAfterAi.status === 200 &&
      aniaPageAfterAi.body.includes(`Zostało 0 z ${GUEST_AI_LIMIT}`) &&
      aniaPageAfterAi.body.includes(GUEST_AI_FULL) &&
      // Costs and the organizer's failure hints never reach a guest.
      !aniaPageAfterAi.body.includes("Koszt AI") &&
      !aniaPageAfterAi.body.includes(MOCK_FAILURE_HINT) &&
      topicLeaks(aniaPageAfterAi.body).length === 0,
    String(aniaPageAfterAi.status),
  );

  // The client's AI panel on the questions page and the shell card: counts only (client-restaurant-split); the
  // provider, the failure hint and the cost are on the panel's event page („Koszty AI”).
  const aiPage = await request(`/o/${organizerKey}/pytania`);
  check(
    "questions page has the client's AI panel with the usage only (no provider, hint or cost)",
    aiPage.status === 200 &&
      aiPage.body.includes('id="tematy-ai"') &&
      aiPage.body.includes("Temat od AI") &&
      aiPage.body.includes("Wygeneruj temat z AI") &&
      aiPage.body.includes(`Wykorzystano ${evening} z ${EVENT_AI_LIMIT} · nieudane: 2`) &&
      !aiPage.body.includes("atrapa AI") &&
      !aiPage.body.includes("Ostatnia próba (np. gościa) się nie udała") &&
      !aiPage.body.includes(MOCK_FAILURE_HINT) &&
      !aiPage.body.includes("Koszt AI") &&
      topicLeaks(aiPage.body).length === 0,
    String(aiPage.status),
  );
  const shellWithAi = await request(`/o/${organizerKey}`);
  check(
    "client shell links to the AI panel with the counts only",
    shellWithAi.status === 200 &&
      shellWithAi.body.includes(`/o/${organizerKey}/pytania#tematy-ai`) &&
      shellWithAi.body.includes(`Tematy AI: ${evening} z ${EVENT_AI_LIMIT}`) &&
      !shellWithAi.body.includes("atrapa AI") &&
      !shellWithAi.body.includes("ostatnia próba nieudana") &&
      countOf(shellWithAi.body, "Wkrótce") === 0,
    String(shellWithAi.status),
  );
  const eventPageWithAi = await request(`/panel/wydarzenia/${String(eventA.id)}`, asOps());
  check(
    "the panel's event page shows „Koszty AI”: usage, the provider and the latest failure's hint",
    eventPageWithAi.status === 200 &&
      eventPageWithAi.body.includes("Koszty AI") &&
      eventPageWithAi.body.includes(`Wykorzystano ${evening} z ${EVENT_AI_LIMIT} · nieudane: 2`) &&
      eventPageWithAi.body.includes("atrapa AI") &&
      eventPageWithAi.body.includes(MOCK_FAILURE_HINT) &&
      topicLeaks(eventPageWithAi.body).length === 0,
    String(eventPageWithAi.status),
  );
}
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  const res = await request(`/o/${key}/pytania`);
  check(
    `questions page with the AI panel and a wrong key: ${label}`,
    res.status === 404 && res.body === deniedBody && !res.body.includes("tematy-ai"),
    String(res.status),
  );
}

// Wrong roles: guests and the TV never reach the organizer AI API; organizer and TV keys are not guest keys.
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  for (const [method, json] of [["GET"], ["POST", { category: null }]]) {
    const res = await request(`/api/o/${key}/ai-topics`, { method, json });
    check(`AI API with a wrong key: ${method} /api/o/${label}/ai-topics`, noAccessJson(res), String(res.status));
  }
}
for (const [label, key] of [
  ["<organizer>", organizerKey],
  ["<tv>", tvKey],
]) {
  const res = await request(guestAiApi(key), { method: "POST", json: { category: null } });
  check(`guest AI topic with a wrong key: ${label}`, noAccessJson(res), `${res.status} ${res.body}`);
}
const tvAi = await request(`/api/tv/${tvKey}/ai-topics`, { method: "POST", json: { category: null } });
check("the TV has no AI topic route", tvAi.status === 404 && topicLeaks(tvAi.body).length === 0, String(tvAi.status));

// 21. TV screen (tv-spotlight): the organizer puts a drawn question, an AI topic or a randomly drawn PRESENT guest on
// the TV over the seating. The TV gets it only through its seating poll (no new TV route); guests never. State here:
// Ania Smoke and Ola Smoke, both present and seated in the latest snapshot; guest access on.
const tvSpotApi = `${api}/tv-spotlight`;
const SPOT_QUESTION = "Jakie były Twoje najlepsze wakacje? Smoke";
const SPOT_TOPIC = "Najdziwniejsze jedzenie z podróży Smoke";
const spotNone = await request(tvSpotApi);
check(
  "the TV screen starts with the plan",
  spotNone.status === 200 &&
    spotNone.body === JSON.stringify({ spotlight: null }) &&
    spotNone.cacheControl.includes("no-store"),
  `${spotNone.status} ${spotNone.body}`,
);
const tvPlain = await request(tvSeatingApi);
const guestBeforeSpot = await request(guestStateApi(aniaNewKey));
check(
  "the TV poll carries an empty spotlight",
  tvPlain.status === 200 && tvPlain.data?.spotlight === null && tvPlain.data.publishedAt !== null,
  `${tvPlain.status} ${tvPlain.data?.spotlight}`,
);
for (const json of [
  { kind: "person", text: GUEST_NAMES[0] },
  { kind: "question" },
  { kind: "question", text: "Pytanie", extra: 1 },
  { kind: "question", text: 5 },
]) {
  const res = await request(tvSpotApi, { method: "PUT", json });
  check(
    `the TV screen refuses ${JSON.stringify(json)}`,
    res.status === 400 && errorOf(res) === "Nieprawidłowe dane.",
    `${res.status} ${res.body}`,
  );
}
for (const text of [" \n ", "a".repeat(301)]) {
  const res = await request(tvSpotApi, { method: "PUT", json: { kind: "question", text } });
  check(
    `the TV screen refuses a text of ${text.length} characters`,
    res.status === 400 && errorOf(res) === "Tekst musi mieć od 1 do 300 znaków.",
    `${res.status} ${res.body}`,
  );
}

const spotQuestion = await request(tvSpotApi, {
  method: "PUT",
  json: { kind: "question", text: `  ${SPOT_QUESTION} ` },
});
check(
  "the organizer shows a question on the TV",
  spotQuestion.status === 200 &&
    spotQuestion.data?.spotlight?.kind === "question" &&
    spotQuestion.data.spotlight.text === SPOT_QUESTION &&
    keysOf(spotQuestion.data.spotlight) === "kind,shownAt,text",
  `${spotQuestion.status} ${spotQuestion.body}`,
);
const tvWithQuestion = await tvSince(tvPlain.data?.version);
check(
  "the TV poll gets the question at once, the seating unchanged and no ids",
  tvWithQuestion.status === 200 &&
    tvWithQuestion.data?.spotlight?.kind === "question" &&
    tvWithQuestion.data.spotlight.text === SPOT_QUESTION &&
    JSON.stringify(tvNames(tvWithQuestion)) === JSON.stringify(tvNames(tvPlain)) &&
    leaksFromTv(tvWithQuestion.body).length === 0,
  `${tvWithQuestion.status} ${JSON.stringify(tvWithQuestion.data?.spotlight)}`,
);
const tvQuestionSame = await tvSince(tvWithQuestion.data?.version);
check("the TV poll is 204 while the question stays", tvQuestionSame.status === 204, String(tvQuestionSame.status));
const tvPageWithQuestion = await request(`/tv/${tvKey}`);
check(
  "the TV page renders the question over the plan",
  tvPageWithQuestion.status === 200 &&
    tvPageWithQuestion.body.includes(SPOT_QUESTION) &&
    tvPageWithQuestion.body.includes("Pytanie do rozmowy") &&
    !tvPageWithQuestion.body.includes(organizerKey),
  String(tvPageWithQuestion.status),
);
const guestAfterSpot = await guestSince(aniaNewKey, guestBeforeSpot.data?.version);
const guestPageWithSpot = await request(`/g/${aniaNewKey}`);
check(
  "guests never get the TV screen or its controls",
  guestBeforeSpot.status === 200 &&
    !guestBeforeSpot.body.includes("spotlight") &&
    guestAfterSpot.status === 204 &&
    guestPageWithSpot.status === 200 &&
    !guestPageWithSpot.body.includes(SPOT_QUESTION) &&
    !guestPageWithSpot.body.includes("Pokaż na TV") &&
    !guestPageWithSpot.body.includes("Na ekranie TV") &&
    !guestPageWithSpot.body.includes("tv-spotlight"),
  `${guestAfterSpot.status} ${guestPageWithSpot.status}`,
);
const questionsWithSpot = await request(`/o/${organizerKey}/pytania`);
check(
  "the questions page has the TV controls and says what the TV shows",
  questionsWithSpot.status === 200 &&
    questionsWithSpot.body.includes("Na ekranie TV") &&
    questionsWithSpot.body.includes("Wylosuj osobę na TV") &&
    questionsWithSpot.body.includes(`Na TV jest pytanie: „${SPOT_QUESTION}”`),
  String(questionsWithSpot.status),
);

const spotTopic = await request(tvSpotApi, { method: "PUT", json: { kind: "topic", text: SPOT_TOPIC } });
const tvWithTopic = await tvSince(tvWithQuestion.data?.version);
check(
  "an AI topic replaces the question on the TV",
  spotTopic.status === 200 &&
    spotTopic.data?.spotlight?.kind === "topic" &&
    tvWithTopic.status === 200 &&
    tvWithTopic.data?.spotlight?.kind === "topic" &&
    tvWithTopic.data.spotlight.text === SPOT_TOPIC,
  `${spotTopic.status} ${tvWithTopic.status} ${JSON.stringify(tvWithTopic.data?.spotlight)}`,
);

const PRESENT_NAMES = [GUEST_NAMES[0], GUEST_NAMES[2]];
const spotPerson = await request(`${tvSpotApi}/person`, { method: "POST" });
const spotPersonAgain = await request(`${tvSpotApi}/person`, { method: "POST" });
const tvWithPerson = await tvSince(tvWithTopic.data?.version);
check(
  "drawing a person puts a present guest on the TV, never the same one twice in a row",
  spotPerson.status === 200 &&
    spotPerson.data?.spotlight?.kind === "person" &&
    PRESENT_NAMES.includes(spotPerson.data.spotlight.text) &&
    spotPersonAgain.status === 200 &&
    PRESENT_NAMES.includes(spotPersonAgain.data?.spotlight?.text) &&
    spotPersonAgain.data.spotlight.text !== spotPerson.data.spotlight.text &&
    tvWithPerson.status === 200 &&
    tvWithPerson.data?.spotlight?.kind === "person" &&
    tvWithPerson.data.spotlight.text === spotPersonAgain.data.spotlight.text,
  `${spotPerson.body} ${spotPersonAgain.body} ${tvWithPerson.status}`,
);

for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  for (const [method, path, json] of [
    ["GET", ""],
    ["PUT", "", { kind: "question", text: "Pytanie" }],
    ["DELETE", ""],
    ["POST", "/person"],
  ]) {
    const res = await request(`/api/o/${key}/tv-spotlight${path}`, { method, json });
    check(
      `TV screen API with a wrong key: ${method} /api/o/${label}/tv-spotlight${path}`,
      noAccessJson(res),
      String(res.status),
    );
  }
}
const tvSpotRoute = await request(`/api/tv/${tvKey}/tv-spotlight`);
check("the TV has no spotlight route of its own", tvSpotRoute.status === 404, String(tvSpotRoute.status));
const spotStill = await request(tvSpotApi);
check(
  "refused requests change nothing on the TV",
  spotStill.data?.spotlight?.text === spotPersonAgain.data?.spotlight?.text,
  spotStill.body,
);

const spotHidden = await request(tvSpotApi, { method: "DELETE" });
const tvAfterHide = await tvSince(tvWithPerson.data?.version);
check(
  "hiding brings the plan back on the TV",
  spotHidden.status === 200 &&
    spotHidden.body === JSON.stringify({ spotlight: null }) &&
    tvAfterHide.status === 200 &&
    tvAfterHide.data?.spotlight === null &&
    tvAfterHide.data.version === tvPlain.data?.version &&
    JSON.stringify(tvNames(tvAfterHide)) === JSON.stringify(tvNames(tvPlain)),
  `${spotHidden.status} ${tvAfterHide.status} ${tvAfterHide.data?.version}`,
);

const accessOff = await request(linksApi, { method: "PATCH", json: { enabled: false } });
const offAgainPage = await request(`/g/${aniaNewKey}`);
const offAgainState = await request(guestStateApi(aniaNewKey));
check(
  "turning guest access off closes every guest link again",
  accessOff.status === 200 &&
    accessOff.data?.enabled === false &&
    offAgainPage.status === 404 &&
    offAgainPage.body === deniedBody &&
    noAccessJson(offAgainState),
  `${accessOff.status} ${offAgainPage.status} ${offAgainState.status}`,
);
const guessWithAccessOff = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1" } });
check("guest guess with access off: JSON 404", noAccessJson(guessWithAccessOff), guessWithAccessOff.body);
const drawWithAccessOff = await request(guestDrawApi(aniaNewKey), { method: "POST", json: { category: null } });
check("guest question draw with access off: JSON 404", noAccessJson(drawWithAccessOff), drawWithAccessOff.body);
const aiWithAccessOff = await request(guestAiApi(aniaNewKey), { method: "POST", json: { category: null } });
check("guest AI topic with access off: JSON 404", noAccessJson(aiWithAccessOff), aiWithAccessOff.body);

// 22. Offline readout (S-09). Every organizer page except the print sheet carries the offline fallback (its own island
// or OfflineSync), rendered online: the server HTML never contains the offline notice.
const OFFLINE_NOTICE_TEXTS = ["Brak połączenia z serwerem", "Pokaż ostatni zapisany stan", "Ostatni zapisany stan"];
for (const [path, island] of [
  ["", "OfflineSync"],
  ["/goscie", "OfflineSync"],
  ["/sale", "OfflineSync"],
  ["/linki", "OfflineSync"],
  ["/pytania", "OfflineSync"],
  ["/rozsadzenie", "SeatingEditor"],
  ["/strzaly", "GuessManager"],
]) {
  const res = await request(`/o/${organizerKey}${path}`);
  const notices = OFFLINE_NOTICE_TEXTS.filter((text) => res.body.includes(text));
  check(
    `organizer page /o/<org>${path} carries the offline fallback, no notice while online`,
    res.status === 200 && res.body.includes(`component-export="${island}"`) && notices.length === 0,
    `${res.status} ${notices.join(" | ")}`,
  );
}

// The readout page is the copy the organizer's service worker keeps: organizer only, never cached by HTTP, and its
// HTML carries no saved data (guests, tables, amounts) — the island reads them from the browser's memory.
const readoutPage = await request(`/o/${organizerKey}/odczyt`);
const readoutLeaks = leaksIn(readoutPage.body, [ANIA_TIE, OLA_GUESS, CORRECT], [...GUEST_NAMES, TABLE_NAME, ROOM_NAME]);
check(
  "offline readout page renders without any saved data in its HTML",
  readoutPage.status === 200 &&
    readoutPage.cacheControl.includes("no-store") &&
    readoutPage.body.includes("Odczyt bez sieci") &&
    readoutPage.body.includes('component-export="OfflineReadoutPage"') &&
    OFFLINE_NOTICE_TEXTS.every((text) => !readoutPage.body.includes(text)) &&
    readoutLeaks.length === 0,
  `${readoutPage.status} ${readoutLeaks.join(" | ")}`,
);
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  const res = await request(`/o/${key}/odczyt`);
  check(
    `offline readout page with a wrong key: ${label}`,
    res.status === 404 && res.body === deniedBody,
    String(res.status),
  );
}
const shellWithReadout = await request(`/o/${organizerKey}`);
check(
  "organizer shell links to the offline readout",
  shellWithReadout.status === 200 &&
    shellWithReadout.body.includes(`/o/${organizerKey}/odczyt`) &&
    shellWithReadout.body.includes("Odczyt bez sieci"),
  String(shellWithReadout.status),
);
const workerResponse = await fetch(`${BASE_URL}/organizer-sw.js`);
const workerSource = await workerResponse.text();
const workerType = workerResponse.headers.get("content-type") ?? "";
check(
  "organizer service worker is served as JavaScript and holds no keys",
  workerResponse.status === 200 &&
    workerType.includes("javascript") &&
    workerSource.includes('addEventListener("fetch"') &&
    !workerSource.includes(organizerKey) &&
    !workerSource.includes(tvKey),
  `${workerResponse.status} ${workerType}`,
);

// 22b. Layout proposal from the plan photo (venue-drawing). Organizer only. Only the MOCK provider is ever asked
// (no network, no cost): it answers with every table moved (rectangular ones turned 90°), one new table, every room
// outlined and another chair scale. Nothing is saved by the read; applying the kept lines moves tables in place (seat
// assignments stay), the board shows unpublished changes, and the TV draws the new rotation only after a publish.
const proposalApi = `${api}/venue/layout-proposal`;
const proposalOn = (key) => `/api/o/${key}/venue/layout-proposal`;
const proposalTv = await requestBytes(proposalOn(tvKey), { method: "POST", body: TINY_PNG, contentType: "image/png" });
const proposalGuest = await requestBytes(proposalOn(aniaKey), {
  method: "POST",
  body: TINY_PNG,
  contentType: "image/png",
});
const applyTv = await request(`/api/o/${tvKey}/venue/layout`, {
  method: "POST",
  json: { tables: [], newTables: [], rooms: [], chairPitch: null },
});
check(
  "layout proposal and apply with the TV or a guest key: JSON no-access",
  [proposalTv, proposalGuest, applyTv].every(
    (response) => response.status === 404 && JSON.stringify(response.data) === '{"error":"Brak dostępu"}',
  ),
  [proposalTv.status, proposalGuest.status, applyTv.status].join(" "),
);
const proposalHtml = await requestBytes(proposalApi, {
  method: "POST",
  body: new TextEncoder().encode("<html><body>nie obraz</body></html>"),
  contentType: "text/html",
});
const proposalHuge = new Uint8Array(1_572_865);
proposalHuge.set(TINY_PNG.subarray(0, 8));
const proposalTooLarge = await requestBytes(proposalApi, {
  method: "POST",
  body: proposalHuge,
  contentType: "image/png",
});
check(
  "layout proposal refuses a non-image (415) and more than 1.5 MB (413)",
  proposalHtml.status === 415 && proposalTooLarge.status === 413,
  `${proposalHtml.status} ${proposalTooLarge.status}`,
);

if (aiOnMock) {
  const venueBeforeProposal = await request(`${api}/venue`);
  const boardBeforeProposal = await request(seatingApi);
  const proposal = await requestBytes(proposalApi, { method: "POST", body: TINY_PNG, contentType: "image/png" });
  const proposed = proposal.data?.proposal;
  const venueAfterRead = await request(`${api}/venue`);
  check(
    "layout proposal (mock) lists moves, one new table, outlines and the scale, and saves nothing",
    proposal.status === 200 &&
      keysOf(proposed) === "chairPitch,newTables,previousChairPitch,rooms,skipped,updates" &&
      proposal.data.costNanoUsd === 0 &&
      proposed.updates.length > 0 &&
      proposed.newTables.length === 1 &&
      proposed.rooms.length === venueBeforeProposal.data.rooms.length &&
      proposed.chairPitch === 0.03 &&
      !GUEST_NAMES.some(
        (name) => proposal.bytes.length > 0 && new TextDecoder().decode(proposal.bytes).includes(name),
      ) &&
      JSON.stringify(venueAfterRead.data) === JSON.stringify(venueBeforeProposal.data),
    `${proposal.status} ${new TextDecoder().decode(proposal.bytes).slice(0, 300)}`,
  );

  const turnedUpdate = proposed?.updates.find((update) => update.rotation !== update.previous.rotation);
  const applyBody = {
    tables: (proposed?.updates ?? []).map((update) => ({
      id: update.tableId,
      x: update.x,
      y: update.y,
      rotation: update.rotation,
    })),
    newTables: proposed?.newTables ?? [],
    rooms: (proposed?.rooms ?? []).map((room) => ({ id: room.roomId, outline: room.outline })),
    chairPitch: proposed?.chairPitch ?? null,
  };
  const duplicate = await request(`${api}/venue/layout`, {
    method: "POST",
    json: { ...applyBody, newTables: [{ ...applyBody.newTables[0], name: TABLE_NAME.toUpperCase() }] },
  });
  const afterDuplicate = await request(`${api}/venue`);
  check(
    "applying a proposal with a duplicate table name writes nothing",
    duplicate.status === 409 &&
      duplicate.data?.error === "Stolik o tej nazwie już jest." &&
      JSON.stringify(afterDuplicate.data) === JSON.stringify(venueBeforeProposal.data),
    `${duplicate.status} ${duplicate.body}`,
  );

  const applied = await request(`${api}/venue/layout`, { method: "POST", json: applyBody });
  const boardAfterApply = await request(seatingApi);
  const turnedTable = applied.data?.tables?.find((table) => table.id === turnedUpdate?.tableId);
  check(
    "applying the proposal moves tables in place, adds the new one and keeps every seat assignment",
    applied.status === 200 &&
      applied.data.tables.length === venueBeforeProposal.data.tables.length + 1 &&
      turnedUpdate !== undefined &&
      turnedTable?.rotation === turnedUpdate.rotation &&
      applied.data.chairPitch === 0.03 &&
      applied.data.rooms.every((room) => room.outline !== null) &&
      JSON.stringify(boardAfterApply.data?.assignments) === JSON.stringify(boardBeforeProposal.data?.assignments) &&
      boardAfterApply.data?.upToDate === false,
    `${applied.status} ${applied.body.slice(0, 300)}`,
  );
  const tvBeforePublish = await request(`/api/tv/${tvKey}/seating`);
  const republished = await request(`${seatingApi}/publish`, { method: "POST" });
  const tvAfterPublish = await request(`/api/tv/${tvKey}/seating`);
  check(
    "the TV draws the applied layout only after a publish",
    tvBeforePublish.data?.tables?.find((table) => table.name === turnedTable?.name)?.rotation !==
      turnedUpdate?.rotation &&
      republished.status === 201 &&
      tvAfterPublish.data?.tables?.find((table) => table.name === turnedTable?.name)?.rotation ===
        turnedUpdate?.rotation &&
      tvAfterPublish.data?.chairPitch === 0.03,
    `${republished.status} ${tvAfterPublish.status}`,
  );
} else {
  check("layout proposal checks run only on the mock AI provider", false, "AI_PROVIDER is not the mock");
}

// 23. Food orders and the restaurant link (restaurant-orders). The organizer keeps the order (dish, unit price,
// quantity, note, for a guest, a table or nobody) and ticks what was served; the restaurant's own key (/r/<key>) shows
// the prep list and where to serve by the PUBLISHED seating — never prices, ids or other keys. Every other key is
// refused on /r/ and the restaurant key opens nothing else; „Wymień link” kills the old link at once.
const ordersApi = `${api}/orders`;
const shellWithOrders = await request(`/o/${organizerKey}`);
// client-restaurant-split: the tablet link is the venue's (the panel's event card), never on the client's pages.
const restaurantKey = eventA.restaurantKey;
check(
  "client shell has the orders card and no tablet link",
  shellWithOrders.status === 200 &&
    Boolean(restaurantKey) &&
    restaurantKey !== organizerKey &&
    restaurantKey !== tvKey &&
    !shellWithOrders.body.includes(restaurantKey) &&
    !/\/r\/[A-Za-z0-9_-]{24}/.test(shellWithOrders.body) &&
    shellWithOrders.body.includes(`/o/${organizerKey}/zamowienia`) &&
    shellWithOrders.body.includes("Zamówienia i restauracja"),
  `${shellWithOrders.status} ${restaurantKey}`,
);
if (!restaurantKey) finish();
const tvPageNoRestaurant = await request(`/tv/${tvKey}`);
check("the TV page never contains the restaurant key", !tvPageNoRestaurant.body.includes(restaurantKey));

// The restaurant's pages start in English (i18n): its denials are the English no-access page, still one body for
// every reason; the other prefixes keep the Polish one.
const restaurantDeniedBody = (await request("/r/garbage")).body;
check(
  "restaurant denial page is the English no-access page",
  restaurantDeniedBody.includes('lang="en"') &&
    restaurantDeniedBody.includes("This page is only available through a link from the organizer.") &&
    restaurantDeniedBody !== deniedBody,
);
for (const path of [
  "/r/garbage",
  `/r/${unknownKey}`,
  `/r/${organizerKey}`,
  `/r/${tvKey}`,
  `/r/${aniaNewKey}`,
  `/o/${restaurantKey}`,
  `/o/${restaurantKey}/zamowienia`,
  `/tv/${restaurantKey}`,
  `/g/${restaurantKey}`,
]) {
  const res = await request(path);
  check(
    `restaurant denial matrix: ${path
      .replace(organizerKey, "<organizer>")
      .replace(tvKey, "<tv>")
      .replace(restaurantKey, "<restaurant>")
      .replace(aniaNewKey, "<guest>")}`,
    res.status === 404 &&
      res.body === (path.startsWith("/r/") ? restaurantDeniedBody : deniedBody) &&
      res.cacheControl.includes("no-store"),
    String(res.status),
  );
}
for (const [method, path] of [
  ["GET", `/api/r/${organizerKey}/orders`],
  ["GET", `/api/r/${tvKey}/orders`],
  ["GET", `/api/r/${aniaNewKey}/orders`],
  ["GET", `/api/r/${tvKey}/plan/image`],
  ["GET", `/api/o/${restaurantKey}/orders`],
  ["POST", `/api/o/${restaurantKey}/restaurant-link`],
  ["GET", `/api/tv/${restaurantKey}/seating`],
  ["GET", `/api/g/${restaurantKey}/state`],
  ["GET", `/api/o/${tvKey}/orders`],
  ["POST", `/api/o/${tvKey}/restaurant-link`],
]) {
  const res = await request(path, { method });
  check(
    `restaurant API denial: ${method} ${path
      .replace(organizerKey, "<organizer>")
      .replace(tvKey, "<tv>")
      .replace(restaurantKey, "<restaurant>")
      .replace(aniaNewKey, "<guest>")}`,
    path.startsWith("/api/r/")
      ? res.status === 404 && res.body === JSON.stringify({ error: "No access" })
      : noAccessJson(res),
    `${res.status} ${res.body}`,
  );
}

// A guest without a published seat: their lines wait under „Do rozstawienia”.
const celinaAdded = await request(`${api}/guests`, { method: "POST", json: { text: "Celina Smoke" } });
check("orders: a guest without a published seat is added", celinaAdded.status === 201, celinaAdded.body);
const ordersBefore = await request(ordersApi);
check(
  "orders: an empty order to start with, private",
  ordersBefore.status === 200 &&
    ordersBefore.cacheControl.includes("no-store") &&
    ordersBefore.data?.items?.length === 0 &&
    ordersBefore.data.totals.totalGrosze === 0 &&
    Array.isArray(ordersBefore.data.guests) &&
    Array.isArray(ordersBefore.data.tables),
  ordersBefore.body.slice(0, 200),
);
const seatedGuest = ordersBefore.data?.guests?.find((guest) => guest.seat !== null);
const unseatedGuest = ordersBefore.data?.guests?.find((guest) => guest.seat === null);
const publishedTable = ordersBefore.data?.tables?.find((table) => table.published);
check(
  "orders: the form lists guests with their published seats and the tables",
  Boolean(seatedGuest) && Boolean(unseatedGuest) && Boolean(publishedTable),
  ordersBefore.body.slice(0, 300),
);
// serving-highlight: the organizer's board carries the published drawing (what the restaurant sees) for the plan.
const boardSeating = ordersBefore.data?.seating;
check(
  "orders: the board carries the published drawing for the plan",
  typeof boardSeating?.publishedAt === "string" &&
    Array.isArray(boardSeating.tables) &&
    boardSeating.tables.some((table) => table.name === publishedTable?.name),
  JSON.stringify(boardSeating ?? null).slice(0, 200),
);

const addLine = (json) => request(ordersApi, { method: "POST", json });
// client-restaurant-split (FR-027): the client never sends a price — a new name costs 0 until the venue sets it in
// „Cennik wydarzenia” (PUT /api/panel/events/<id>/prices, the ops owner here). addPricedLine adds the line on the client
// link, sets its name's price in the panel and answers the client's fresh board with the add's status.
const setPrice = (name, price, kind = "dish") =>
  request(`${opsPanel}/prices`, asOps({ method: "PUT", json: { kind, name, price } }));
const addPricedLine = async ({ price, ...json }) => {
  const added = await addLine(json);
  if (added.status !== 201) return added;
  const priced = await setPrice(json.name, price);
  if (priced.status !== 200) return priced;
  return { ...(await request(ordersApi)), status: added.status };
};
const unpricedSchabowy = await addLine({ name: "Schabowy Smoke", quantity: 1 });
const unpricedId = unpricedSchabowy.data?.items?.find((item) => item.name === "Schabowy Smoke")?.id;
check(
  "orders: a dish the venue has not priced yet costs 0",
  unpricedSchabowy.status === 201 &&
    unpricedSchabowy.data.items.find((item) => item.id === unpricedId)?.unitPriceGrosze === 0,
  unpricedSchabowy.body.slice(0, 200),
);
await request(`${ordersApi}/${String(unpricedId)}`, { method: "DELETE" });
const schabowy = await addPricedLine({
  name: "  Schabowy   Smoke ",
  price: "49,90 zł",
  quantity: 1,
  note: "bez cebuli",
  assignment: { guestId: seatedGuest?.id },
});
await addPricedLine({ name: "Żurek Smoke", price: "24", quantity: 2, assignment: { guestId: seatedGuest?.id } });
await addPricedLine({ name: "Woda Smoke", price: "18", quantity: 2, assignment: { tableId: publishedTable?.id } });
await addPricedLine({ name: "Pierogi Smoke", price: "36", quantity: 1, assignment: { guestId: unseatedGuest?.id } });
const tortLine = await addPricedLine({ name: "Tort Smoke", price: "350", quantity: 1, assignment: null });
const seatedTable = tortLine.data?.placement?.tables?.find((table) => table.name === seatedGuest?.seat?.table);
check(
  "orders: lines are added with normalized names and grosze, totals and placement by the published seating",
  schabowy.status === 201 &&
    tortLine.status === 201 &&
    tortLine.data.items.length === 5 &&
    tortLine.data.items[0].name === "Schabowy Smoke" &&
    tortLine.data.items[0].unitPriceGrosze === 4990 &&
    tortLine.data.totals.totalGrosze === 4990 + 4800 + 3600 + 3600 + 35000 &&
    tortLine.data.totals.quantity === 7 &&
    seatedTable?.seats?.some(
      (seat) =>
        seat.seat === seatedGuest?.seat?.seat &&
        seat.items.map((item) => item.name).join() === "Schabowy Smoke,Żurek Smoke",
    ) &&
    tortLine.data.placement.unplaced.some(
      (group) => group.kind === "guest" && group.name === unseatedGuest?.displayName,
    ) &&
    tortLine.data.placement.unassigned.map((item) => item.name).join() === "Tort Smoke",
  tortLine.body.slice(0, 400),
);
check(
  "orders: the prep list adds up each dish",
  tortLine.data?.prep?.find((line) => line.name === "Żurek Smoke")?.quantity === 2 &&
    tortLine.data.prep.find((line) => line.name === "Schabowy Smoke")?.notes?.[0]?.note === "bez cebuli",
  JSON.stringify(tortLine.data?.prep),
);

for (const [label, json, status, message] of [
  ["a zero quantity", { name: "X", quantity: 0 }, 400, "Ilość to liczba od 1 do 99."],
  [
    "a price (the venue's, client-restaurant-split)",
    { name: "X", price: "1", quantity: 1 },
    400,
    "Nieprawidłowe dane.",
  ],
  ["no dish name", { name: "  ", quantity: 1 }, 400, "Wpisz nazwę dania."],
  [
    "a guest and a table at once",
    { name: "X", quantity: 1, assignment: { guestId: 1, tableId: 1 } },
    400,
    "Nieprawidłowe dane.",
  ],
  ["an extra key", { name: "X", quantity: 1, priceGrosze: 100 }, 400, "Nieprawidłowe dane."],
  [
    "a guest that does not exist",
    { name: "X", quantity: 1, assignment: { guestId: 2_000_000_000 } },
    409,
    "Nie ma już takiego gościa albo stolika.",
  ],
]) {
  const res = await addLine(json);
  check(`orders refuse ${label}`, res.status === status && errorOf(res) === message, `${res.status} ${res.body}`);
}
const unknownLine = await request(`${ordersApi}/2000000000`, { method: "PATCH", json: { delivered: true } });
check(
  "orders: an unknown line is 404",
  unknownLine.status === 404 && errorOf(unknownLine) === "Nie znaleziono pozycji zamówienia.",
  `${unknownLine.status} ${unknownLine.body}`,
);

// The restaurant's view.
const restaurantApiBase = `/api/r/${restaurantKey}`;
const restaurantPage = await request(`/r/${restaurantKey}`);
check(
  "restaurant page: the prep list and placement, private, without prices or other keys",
  restaurantPage.status === 200 &&
    restaurantPage.cacheControl.includes("no-store") &&
    restaurantPage.referrerPolicy === "no-referrer" &&
    restaurantPage.body.includes("Schabowy Smoke") &&
    restaurantPage.body.includes('lang="en"') &&
    restaurantPage.body.includes("To prepare") &&
    restaurantPage.body.includes("Tap a dish or a line and its place lights up on the plan.") &&
    !restaurantPage.body.includes("zł") &&
    !restaurantPage.body.includes("49,90") &&
    !restaurantPage.body.includes("4990") &&
    !restaurantPage.body.includes(organizerKey) &&
    !restaurantPage.body.includes(tvKey),
  String(restaurantPage.status),
);
// The language switch (i18n): `?lang=pl` stores the restaurant's own cookie and redirects to the clean address; with it
// the page and the API answer in Polish, and the organizer's pages are not affected by it.
const toPolish = await request(`/r/${restaurantKey}?lang=pl`);
check(
  "restaurant language switch: cookie and redirect to the same address",
  toPolish.status === 303 &&
    toPolish.location === `/r/${restaurantKey}` &&
    /(^|, )kp-lang-r=pl;/.test(toPolish.setCookie) &&
    /HttpOnly/i.test(toPolish.setCookie),
  `${toPolish.status} ${toPolish.location.replace(restaurantKey, "<restaurant>")}`,
);
const polishCookie = { Cookie: "kp-lang-r=pl" };
const restaurantPagePl = await request(`/r/${restaurantKey}`, { extraHeaders: polishCookie });
const restaurantDeniedApiPl = await request(`/api/r/${tvKey}/orders`, { extraHeaders: polishCookie });
const organizerWithRestaurantCookie = await request(`/o/${organizerKey}`, {
  extraHeaders: { Cookie: "kp-lang-r=en" },
});
check(
  "restaurant in Polish with its cookie; the organizer stays Polish",
  restaurantPagePl.body.includes('lang="pl"') &&
    restaurantPagePl.body.includes("Do przygotowania") &&
    restaurantPagePl.body.includes("Kliknij danie albo pozycję") &&
    noAccessJson(restaurantDeniedApiPl) &&
    organizerWithRestaurantCookie.body.includes('lang="pl"'),
);
const organizerInEnglish = await request(`/o/${organizerKey}`, { extraHeaders: { Cookie: "kp-lang=en" } });
check("organizer in English with its cookie", organizerInEnglish.body.includes('lang="en"'));
const restaurantView = await request(`${restaurantApiBase}/orders`);
const servedTable = restaurantView.data?.placement?.tables?.find((table) => table.name === seatedGuest?.seat?.table);
check(
  "restaurant API: no prices, ids, keys or absences; dishes at the published seat and on the table",
  restaurantView.status === 200 &&
    restaurantView.cacheControl.includes("no-store") &&
    !/Grosze|"id"|guestId|tableId|isAbsent|zł/.test(restaurantView.body) &&
    !restaurantView.body.includes(organizerKey) &&
    !restaurantView.body.includes(tvKey) &&
    !restaurantView.body.includes(restaurantKey) &&
    servedTable?.seats?.some((seat) => seat.guestName === seatedGuest?.displayName) &&
    restaurantView.data.totals.quantity === 7 &&
    restaurantView.data.totals.toServe === 7 &&
    restaurantView.data.seating.publishedAt !== null,
  restaurantView.body.slice(0, 400),
);
const restaurantSame = await request(
  `${restaurantApiBase}/orders?since=${encodeURIComponent(restaurantView.data?.version ?? "")}`,
);
check(
  "restaurant API: an unchanged view answers 204",
  restaurantSame.status === 204 && restaurantSame.body === "",
  String(restaurantSame.status),
);
const restaurantImage = await requestBytes(`${restaurantApiBase}/plan/image`);
check(
  "restaurant API: the plan image (for the drawing's aspect ratio)",
  restaurantImage.status === 200 &&
    restaurantImage.contentType.startsWith("image/") &&
    restaurantImage.nosniff === "nosniff",
  `${restaurantImage.status} ${restaurantImage.contentType}`,
);
const schabowyId = tortLine.data?.items?.find((item) => item.name === "Schabowy Smoke")?.id;
const ticked = await request(`${ordersApi}/${schabowyId}`, { method: "PATCH", json: { delivered: true } });
const restaurantTicked = await request(
  `${restaurantApiBase}/orders?since=${encodeURIComponent(restaurantView.data?.version ?? "")}`,
);
check(
  "a „Wydane” tick reaches the restaurant at its next poll",
  ticked.status === 200 &&
    ticked.data.totals.deliveredQuantity === 1 &&
    restaurantTicked.status === 200 &&
    restaurantTicked.data.totals.toServe === 6 &&
    restaurantTicked.data.version !== restaurantView.data?.version &&
    restaurantTicked.data.prep.find((line) => line.name === "Schabowy Smoke")?.toServe === 0,
  `${ticked.status} ${restaurantTicked.status}`,
);
const movedOnly = await request(`${ordersApi}/${schabowyId}`, {
  method: "PATCH",
  json: { assignment: { tableId: publishedTable?.id }, quantity: 2 },
});
const repriced = await setPrice("schabowy smoke", "52");
const moved = await request(ordersApi);
const movedLine = moved.data?.items?.find((item) => item.id === schabowyId);
check(
  "orders: a line is moved to a table and repriced by the venue, keeping its tick on the first piece (the new one is to serve)",
  movedOnly.status === 200 &&
    repriced.status === 200 &&
    moved.status === 200 &&
    movedLine?.guestId === null &&
    movedLine.tableId === publishedTable?.id &&
    movedLine.unitPriceGrosze === 5200 &&
    movedLine.quantity === 2 &&
    movedLine.delivered === false &&
    JSON.stringify(movedLine.deliveredPieces) === "[1]" &&
    JSON.stringify(movedLine.marks) === JSON.stringify([{ piece: 1, by: "organizer", guestId: null }]),
  moved.body.slice(0, 300),
);

// 23b. Delivered pieces (guest-delivered). A guest's phone shows their own dishes and the dishes for the middle of
// their table (latest published seating), each piece with its own „Dotarło”; no prices, no ids of people. A guest may
// mark only those lines, never undo the organizer's mark; the organizer marks single pieces too and sees who marked
// what; the restaurant and the guest's poll (204 when unchanged) follow.
const guestOrdersApi = (key) => `/api/g/${key}/orders`;
const linksForOrders = await request(linksApi);
const seatedKey = linkOf(linksForOrders, seatedGuest?.id)?.key;
const unseatedKey = linkOf(linksForOrders, unseatedGuest?.id)?.key;
const ordersAccessOn = await request(linksApi, { method: "PATCH", json: { enabled: true } });
const boardForGuests = await request(ordersApi);
const guestTableId = boardForGuests.data?.tables?.find((table) => table.name === seatedGuest?.seat?.table)?.id;
const lineIdOf = (name) => boardForGuests.data?.items?.find((item) => item.name === name)?.id;
const zurekId = lineIdOf("Żurek Smoke");
const pierogiId = lineIdOf("Pierogi Smoke");
const tableLineNames = (boardForGuests.data?.items ?? [])
  .filter((item) => item.tableId === guestTableId)
  .map((item) => item.name)
  .sort()
  .join();
const seatedState = await request(guestStateApi(seatedKey));
const phoneOrders = (res) => res.data?.orders ?? [];
const phoneLine = (res, name) => phoneOrders(res).find((line) => line.name === name);
check(
  "guest-delivered: the phone gets its own dishes and its table's, every piece, no prices or ids",
  ordersAccessOn.status === 200 &&
    Boolean(seatedKey) &&
    seatedState.status === 200 &&
    phoneOrders(seatedState)
      .filter((line) => line.kind === "own")
      .map((line) => line.name)
      .join() === "Żurek Smoke" &&
    phoneOrders(seatedState)
      .filter((line) => line.kind === "table")
      .map((line) => line.name)
      .sort()
      .join() === tableLineNames &&
    JSON.stringify(phoneLine(seatedState, "Żurek Smoke")?.pieces) ===
      JSON.stringify([
        { piece: 1, deliveredBy: null },
        { piece: 2, deliveredBy: null },
      ]) &&
    !/Grosze|price|"guestId"|"tableId"|"id"|"marks"/.test(JSON.stringify(seatedState.data?.orders)),
  JSON.stringify(seatedState.data?.orders ?? seatedState.body).slice(0, 400),
);
const unseatedState = await request(guestStateApi(unseatedKey));
check(
  "guest-delivered: a guest without a published seat sees only their own dish",
  unseatedState.status === 200 &&
    phoneOrders(unseatedState)
      .map((line) => `${line.kind}:${line.name}`)
      .join() === "own:Pierogi Smoke",
  JSON.stringify(unseatedState.data?.orders ?? unseatedState.body).slice(0, 200),
);
const seatedPage = await request(`/g/${seatedKey}`);
check(
  "guest-delivered: the guest page renders „Twoje zamówienie” without prices",
  seatedPage.status === 200 &&
    seatedPage.body.includes("Twoje zamówienie") &&
    seatedPage.body.includes("Żurek Smoke") &&
    !seatedPage.body.includes("24,00") &&
    !seatedPage.body.includes("unitPriceGrosze"),
  String(seatedPage.status),
);

const markPiece = (key, json) => request(guestOrdersApi(key), { method: "PUT", json });
const markedByGuest = await markPiece(seatedKey, { lineId: zurekId, piece: 2, delivered: true });
const boardAfterPieceMark = await request(ordersApi);
const zurekAfterGuest = boardAfterPieceMark.data?.items?.find((item) => item.id === zurekId);
const restaurantAfterGuest = await request(`${restaurantApiBase}/orders`);
check(
  "guest-delivered: a guest marks ONE piece; the organizer sees who, the restaurant one piece less to serve",
  markedByGuest.status === 200 &&
    JSON.stringify(phoneLine(markedByGuest, "Żurek Smoke")?.pieces) ===
      JSON.stringify([
        { piece: 1, deliveredBy: null },
        { piece: 2, deliveredBy: "you" },
      ]) &&
    markedByGuest.data.version !== seatedState.data?.version &&
    zurekAfterGuest?.delivered === false &&
    JSON.stringify(zurekAfterGuest.marks) === JSON.stringify([{ piece: 2, by: "guest", guestId: seatedGuest?.id }]) &&
    restaurantAfterGuest.data?.prep?.find((line) => line.name === "Żurek Smoke")?.toServe === 1 &&
    !JSON.stringify(restaurantAfterGuest.data).includes('"marks"'),
  `${markedByGuest.status} ${markedByGuest.body.slice(0, 300)}`,
);
const sinceAfterMark = await guestSince(seatedKey, markedByGuest.data?.version);
check(
  "guest-delivered: the phone's next poll is 204 (the same token on both paths)",
  sinceAfterMark.status === 204,
  String(sinceAfterMark.status),
);

for (const [label, key, json, status, message] of [
  [
    "another guest's dish",
    seatedKey,
    { lineId: pierogiId, piece: 1, delivered: true },
    409,
    "Tej pozycji nie ma już przy Tobie ani na Twoim stole.",
  ],
  [
    "a piece the line does not have",
    seatedKey,
    { lineId: zurekId, piece: 3, delivered: true },
    409,
    "Tej sztuki nie ma już na zamówieniu.",
  ],
  [
    "a line of a table the guest does not sit at",
    unseatedKey,
    { lineId: zurekId, piece: 1, delivered: true },
    409,
    "Tej pozycji nie ma już przy Tobie ani na Twoim stole.",
  ],
  [
    "a guest id in the body",
    seatedKey,
    { lineId: zurekId, piece: 1, delivered: true, guestId: 1 },
    400,
    "Nieprawidłowe dane.",
  ],
  ["a piece 0", seatedKey, { lineId: zurekId, piece: 0, delivered: true }, 400, "Nieprawidłowe dane."],
]) {
  const res = await markPiece(key, json);
  check(
    `guest-delivered refuses ${label}`,
    res.status === status && errorOf(res) === message,
    `${res.status} ${res.body}`,
  );
}
const organizerPiece = await request(`${ordersApi}/${zurekId}/pieces`, {
  method: "PUT",
  json: { piece: 1, delivered: true },
});
const undoOrganizer = await markPiece(seatedKey, { lineId: zurekId, piece: 1, delivered: false });
const undoOwn = await markPiece(seatedKey, { lineId: zurekId, piece: 2, delivered: false });
check(
  "guest-delivered: the organizer marks a single piece; the guest cannot undo it but undoes their own",
  organizerPiece.status === 200 &&
    JSON.stringify(organizerPiece.data.items.find((item) => item.id === zurekId)?.deliveredPieces) === "[1,2]" &&
    organizerPiece.data.items.find((item) => item.id === zurekId)?.delivered === true &&
    undoOrganizer.status === 409 &&
    errorOf(undoOrganizer) === "Tę sztukę oznaczył organizator — cofnąć może tylko on." &&
    undoOwn.status === 200 &&
    JSON.stringify(phoneLine(undoOwn, "Żurek Smoke")?.pieces) ===
      JSON.stringify([
        { piece: 1, deliveredBy: "organizer" },
        { piece: 2, deliveredBy: null },
      ]),
  `${organizerPiece.status} ${undoOrganizer.status} ${undoOwn.status}`,
);
const organizerPieceBad = await request(`${ordersApi}/${zurekId}/pieces`, {
  method: "PUT",
  json: { piece: 3, delivered: true },
});
const organizerPieceUnknown = await request(`${ordersApi}/2000000000/pieces`, {
  method: "PUT",
  json: { piece: 1, delivered: true },
});
const tvPieces = await request(`/api/o/${tvKey}/orders/${zurekId}/pieces`, {
  method: "PUT",
  json: { piece: 1, delivered: false },
});
const tvAfterPieces = await request(tvSeatingApi);
check(
  "guest-delivered: organizer piece API refuses a missing piece (409), an unknown line (404) and other keys",
  organizerPieceBad.status === 409 &&
    organizerPieceUnknown.status === 404 &&
    noAccessJson(tvPieces) &&
    tvAfterPieces.status === 200 &&
    !tvAfterPieces.body.includes("Żurek"),
  `${organizerPieceBad.status} ${organizerPieceUnknown.status} ${tvPieces.status}`,
);
const ordersAccessOff = await request(linksApi, { method: "PATCH", json: { enabled: false } });
const markWithAccessOff = await markPiece(seatedKey, { lineId: zurekId, piece: 2, delivered: true });
check(
  "guest-delivered: with guest access off the mark is the JSON 404",
  ordersAccessOff.status === 200 && noAccessJson(markWithAccessOff),
  markWithAccessOff.body,
);
const tortId = tortLine.data?.items?.find((item) => item.name === "Tort Smoke")?.id;
const deletedLine = await request(`${ordersApi}/${tortId}`, { method: "DELETE" });
const deletedLineAgain = await request(`${ordersApi}/${tortId}`, { method: "DELETE" });
check(
  "orders: a line is deleted once",
  deletedLine.status === 200 && deletedLine.data.items.length === 4 && deletedLineAgain.status === 404,
  `${deletedLine.status} ${deletedLineAgain.status}`,
);
const ordersPage = await request(`/o/${organizerKey}/zamowienia`);
const tvOrdersPage = await request(`/o/${tvKey}/zamowienia`);
check(
  "client order page renders without the tablet link; other keys get the denial",
  ordersPage.status === 200 &&
    ordersPage.body.includes("Zamówienia i restauracja") &&
    !ordersPage.body.includes(restaurantKey) &&
    !ordersPage.body.includes("Wymień link") &&
    ordersPage.body.includes("Schabowy Smoke") &&
    tvOrdersPage.status === 404,
  `${ordersPage.status} ${tvOrdersPage.status}`,
);

// 23c. Drinks on the bill (bill-drinks). The organizer's own list (name, price per item, quantity) for checking the
// restaurant's bill: on the organizer's board and order page only — never on the restaurant's page or API, the TV or a
// guest's phone (with guest access on); other keys are refused. One drink stays for the reset below.
const drinksApi = `${api}/drinks`;
const DRINK = "Piwo Drinksmoke";
const addDrink = (json) => request(drinksApi, { method: "POST", json });
// Priced like the dishes: the client adds the drink, the venue sets its name's price in the panel.
const addPricedDrink = async ({ price, ...json }) => {
  const added = await addDrink(json);
  if (added.status !== 201) return added;
  const priced = await setPrice(json.name, price, "drink");
  if (priced.status !== 200) return priced;
  return { ...(await request(ordersApi)), status: added.status };
};
const drinkAdded = await addPricedDrink({ name: `  ${DRINK}  `, price: "14,50 zł", quantity: 12 });
const drinkId = drinkAdded.data?.drinks?.find((drink) => drink.name === DRINK)?.id;
check(
  "drinks: a drink joins the organizer's board, its sum apart from the dishes'",
  drinkAdded.status === 201 &&
    drinkAdded.cacheControl.includes("no-store") &&
    Boolean(drinkId) &&
    drinkAdded.data.drinks.length === 1 &&
    drinkAdded.data.drinks[0].unitPriceGrosze === 1450 &&
    drinkAdded.data.drinks[0].quantity === 12 &&
    drinkAdded.data.drinkTotals.totalGrosze === 12 * 1450 &&
    drinkAdded.data.totals.totalGrosze === deletedLine.data?.totals?.totalGrosze &&
    !drinkAdded.data.items.some((item) => item.name === DRINK) &&
    !drinkAdded.data.prep.some((line) => line.name === DRINK),
  drinkAdded.body.slice(0, 300),
);
const wineAdded = await addPricedDrink({ name: "Wino Drinksmoke", price: "120", quantity: 1 });
const wineId = wineAdded.data?.drinks?.find((drink) => drink.name === "Wino Drinksmoke")?.id;
const drinkChanged = await request(`${drinksApi}/${drinkId}`, { method: "PATCH", json: { quantity: 15 } });
check(
  "drinks: a drink's quantity is changed, the sum follows",
  wineAdded.status === 201 &&
    drinkChanged.status === 200 &&
    drinkChanged.data?.drinks?.find((drink) => drink.id === drinkId)?.quantity === 15 &&
    drinkChanged.data.drinkTotals.totalGrosze === 15 * 1450 + 12_000 &&
    drinkChanged.data.drinkTotals.lines === 2,
  drinkChanged.body.slice(0, 300),
);
for (const [label, method, path, json, status, message] of [
  ["no name", "POST", drinksApi, { name: " ", quantity: 1 }, 400, "Wpisz nazwę napoju."],
  ["a quantity above 999", "POST", drinksApi, { name: "X", quantity: 1000 }, 400, "Ilość to liczba od 1 do 999."],
  [
    "a price (the venue's, client-restaurant-split)",
    "POST",
    drinksApi,
    { name: "X", price: "1", quantity: 1 },
    400,
    "Nieprawidłowe dane.",
  ],
  ["an assignment", "POST", drinksApi, { name: "X", quantity: 1, assignment: null }, 400, "Nieprawidłowe dane."],
  ["an empty change", "PATCH", `${drinksApi}/${drinkId}`, {}, 400, "Nieprawidłowe dane."],
  ["an unknown drink", "PATCH", `${drinksApi}/2000000000`, { quantity: 1 }, 404, "Nie znaleziono napoju."],
]) {
  const res = await request(path, { method, json });
  check(`drinks refuse ${label}`, res.status === status && errorOf(res) === message, `${res.status} ${res.body}`);
}
for (const [method, path] of [
  ["POST", `/api/o/${tvKey}/drinks`],
  ["POST", `/api/o/${restaurantKey}/drinks`],
  ["POST", `/api/o/${seatedKey}/drinks`],
  ["PATCH", `/api/o/${tvKey}/drinks/${drinkId}`],
  ["DELETE", `/api/o/${restaurantKey}/drinks/${drinkId}`],
]) {
  const res = await request(path, {
    method,
    json: method === "DELETE" ? undefined : { name: "X", quantity: 1 },
  });
  check(
    `drinks: other keys are refused (${method} ${path.replace(tvKey, "<tv>").replace(restaurantKey, "<restaurant>").replace(seatedKey, "<guest>")})`,
    noAccessJson(res),
    `${res.status} ${res.body}`,
  );
}
const drinksGuestAccessOn = await request(linksApi, { method: "PATCH", json: { enabled: true } });
const drinkLeakChecks = [
  ["the restaurant's page", await request(`/r/${restaurantKey}`)],
  ["the restaurant's API", await request(`${restaurantApiBase}/orders`)],
  ["the TV page", await request(`/tv/${tvKey}`)],
  ["the TV poll", await request(tvSeatingApi)],
  ["the guest's page", await request(`/g/${seatedKey}`)],
  ["the guest's poll", await request(guestStateApi(seatedKey))],
];
for (const [label, res] of drinkLeakChecks) {
  check(
    `drinks never reach ${label}`,
    drinksGuestAccessOn.status === 200 &&
      res.status === 200 &&
      !res.body.includes("Drinksmoke") &&
      !res.body.includes("Napoje do rachunku") &&
      !res.body.includes("Drinks for the bill"),
    `${res.status} ${res.body.slice(0, 120)}`,
  );
}
await request(linksApi, { method: "PATCH", json: { enabled: false } });
const drinksPage = await request(`/o/${organizerKey}/zamowienia`);
check(
  "drinks: the organizer's order page lists them and the bill total",
  drinksPage.status === 200 &&
    drinksPage.body.includes(DRINK) &&
    drinksPage.body.includes("Napoje do rachunku") &&
    drinksPage.body.includes("Rachunek razem"),
  String(drinksPage.status),
);
const wineDeleted = await request(`${drinksApi}/${wineId}`, { method: "DELETE" });
const wineDeletedAgain = await request(`${drinksApi}/${wineId}`, { method: "DELETE" });
check(
  "drinks: a drink is deleted once",
  wineDeleted.status === 200 &&
    wineDeleted.data.drinks.map((drink) => drink.name).join() === DRINK &&
    wineDeletedAgain.status === 404 &&
    errorOf(wineDeletedAgain) === "Nie znaleziono napoju.",
  `${wineDeleted.status} ${wineDeletedAgain.status}`,
);

// client-restaurant-split (FR-025): the client link cannot replace the tablet link any more (the identical denial);
// the venue does it on the panel's event card.
const clientRotation = await request(`${api}/restaurant-link`, { method: "POST" });
const stillOldRestaurant = await request(`/r/${restaurantKey}`);
check(
  "„Wymień link” of the tablet on the client link: the identical denial, the tablet link unchanged",
  noAccessJson(clientRotation) && stillOldRestaurant.status === 200,
  `${clientRotation.status} ${stillOldRestaurant.status}`,
);
const rotated = await request(`${opsPanel}/links/restaurant`, asOps({ method: "POST" }));
const newRestaurantKey = new RegExp(`^/r/(${KEY})$`).exec(rotated.data?.event?.links?.restaurant ?? "")?.[1];
const oldRestaurantPage = await request(`/r/${restaurantKey}`);
const oldRestaurantApi = await request(`${restaurantApiBase}/orders`);
const newRestaurantPage = newRestaurantKey ? await request(`/r/${newRestaurantKey}`) : null;
const shellAfterRotation = await request(`/o/${organizerKey}`);
check(
  "„Wymień link” in the panel: a new tablet key, the old link dead at once, never on the client shell",
  rotated.status === 200 &&
    Boolean(newRestaurantKey) &&
    newRestaurantKey !== restaurantKey &&
    oldRestaurantPage.status === 404 &&
    oldRestaurantPage.body === restaurantDeniedBody &&
    oldRestaurantApi.status === 404 &&
    oldRestaurantApi.body === JSON.stringify({ error: "No access" }) &&
    newRestaurantPage?.status === 200 &&
    shellAfterRotation.status === 200 &&
    !shellAfterRotation.body.includes(`/r/${newRestaurantKey}`) &&
    !shellAfterRotation.body.includes(`/r/${restaurantKey}`),
  `${rotated.status} ${rotated.body.slice(0, 200)}`,
);

// 23d. Event isolation (multi-tenant-events, NFR-012). Event B (its own restaurant, created in section 3) gets guests, a
// group, a room, a table, a published seating, a guess, a question, a dish and a drink through ITS organizer key.
// Then A's keys aim at B's ids: every write is refused exactly like an id that does not exist (same status, same body),
// nothing of B shows up in anything A's links read, B reads the same before and after, and B's TV, restaurant and guest
// links show B only. Section 24 then resets all of A, and B must still read the same.
const bApi = `/api/o/${eventB.organizerKey}`;
const B_MARK = `Bx${RUN_TAG}`;
const B_GUESTS = ["Bartek", "Basia", "Bogdan", "Bożena"].map((name) => `${name} ${B_MARK}`);
const B_DISH = `Danie ${B_MARK}`;
const B_DRINK = `Napój ${B_MARK}`;
const B_QUESTION = `Pytanie izolacji ${B_MARK}?`;
const UNKNOWN_ID = 2_000_000_000;

const bPasted = await request(`${bApi}/guests`, { method: "POST", json: { text: B_GUESTS.join("\n") } });
const [b1, b2, b3, b4] = B_GUESTS.map((name) => guestNamed(bPasted, name)?.id);
const bGroup = await request(`${bApi}/groups`, { method: "POST", json: { guestIds: [b1, b2] } });
const bRoom = await request(`${bApi}/rooms`, { method: "POST", json: { name: `Sala ${B_MARK}` } });
const bRoomId = bRoom.data?.rooms?.[0]?.id;
const bTable = await request(`${bApi}/tables`, {
  method: "POST",
  json: { roomId: bRoomId, name: `Stół ${B_MARK}`, seatCount: 4, shape: "round", x: 0.5, y: 0.5 },
});
const bTableId = bTable.data?.tables?.[0]?.id;
for (const [guestId, seat] of [
  [b1, 1],
  [b2, 2],
  [b3, 3],
]) {
  await request(`${bApi}/seating/guests/${guestId}`, { method: "PUT", json: { tableId: bTableId, seat } });
}
const bPublished = await request(`${bApi}/seating/publish`, { method: "POST" });
const bSnapshotId = bPublished.data?.published?.snapshotId;
const bGuess = await request(`${bApi}/guesses/${b1}`, { method: "PUT", json: { amount: "1500" } });
const bQuestion = await request(`${bApi}/questions`, {
  method: "POST",
  json: { category: "generyczne", text: B_QUESTION },
});
const bQuestionId = bQuestion.data?.questions?.find((question) => question.text === B_QUESTION)?.id;
const bOrder = await request(`${bApi}/orders`, {
  method: "POST",
  json: { name: B_DISH, quantity: 2, assignment: { guestId: b1 } },
});
const bLineId = bOrder.data?.items?.find((item) => item.name === B_DISH)?.id;
const bDrink = await request(`${bApi}/drinks`, { method: "POST", json: { name: B_DRINK, quantity: 3 } });
const bDrinkId = bDrink.data?.drinks?.find((drink) => drink.name === B_DRINK)?.id;
const bLinks = await request(`${bApi}/guest-links`, { method: "PATCH", json: { enabled: true } });
const bGuestKey = linkOf(bLinks, b1)?.key;
const bGroupId = bGroup.data?.groups?.[0]?.id;
check(
  "isolation: event B is set up through its own organizer key",
  bPasted.status === 201 &&
    [b1, b2, b3, b4].every(Boolean) &&
    bGroup.status === 201 &&
    Boolean(bGroupId) &&
    bRoom.status === 201 &&
    bTable.status === 201 &&
    Boolean(bTableId) &&
    bPublished.status === 201 &&
    Boolean(bSnapshotId) &&
    bGuess.status === 200 &&
    bQuestion.status === 201 &&
    Boolean(bQuestionId) &&
    bOrder.status === 201 &&
    Boolean(bLineId) &&
    bDrink.status === 201 &&
    Boolean(bDrinkId) &&
    bLinks.status === 200 &&
    isKey(bGuestKey),
  [bPasted, bGroup, bRoom, bTable, bPublished, bGuess, bQuestion, bOrder, bDrink, bLinks]
    .map((res) => res.status)
    .join(" "),
);

// Everything B's organizer reads, to compare after A's attempts and after A's reset.
const B_READS = [
  "guests",
  "venue",
  "seating",
  "seating/history",
  "seating/published",
  "guesses",
  "guest-links",
  "questions",
  "orders",
  "tv-spotlight",
  "trial-reset",
];
const readB = async () => {
  const bodies = [];
  for (const path of B_READS) {
    const res = await request(`${bApi}/${path}`);
    bodies.push(`${String(res.status)} ${res.body}`);
  }
  return bodies;
};
const bBefore = await readB();

const aGuests = (await request(`${api}/guests`)).data?.guests ?? [];
const aGuestNames = aGuests.map((guest) => guest.displayName);
const aGuestId = aGuests[0]?.id;
const aTableId = (await request(`${api}/venue`)).data?.tables?.[0]?.id;
const aBoard = await request(ordersApi);
const aLineId = aBoard.data?.items?.[0]?.id;
const aDishNames = (aBoard.data?.items ?? []).map((item) => item.name);
check(
  "isolation: event A has guests, a table and a dish to aim with",
  Boolean(aGuestId) && Boolean(aTableId) && Boolean(aLineId) && aGuestNames.length > 0 && aDishNames.length > 0,
);

// [label, method, path for an id, body for an id, B's id]: the same request with UNKNOWN_ID must answer the same.
const foreignWrites = [
  ["rename B's guest", "PATCH", (id) => `guests/${id}`, () => ({ displayName: "Przejęty gość" }), b1],
  ["delete B's guest", "DELETE", (id) => `guests/${id}`, () => undefined, b4],
  ["group B's guests", "POST", () => "groups", (id) => ({ guestIds: [id, id === UNKNOWN_ID ? id - 1 : b4] }), b3],
  ["dissolve B's group", "DELETE", (id) => `groups/${id}`, () => undefined, bGroupId],
  ["rename B's room", "PATCH", (id) => `rooms/${id}`, () => ({ name: "Przejęta sala" }), bRoomId],
  ["delete B's room", "DELETE", (id) => `rooms/${id}`, () => undefined, bRoomId],
  ["rename B's table", "PATCH", (id) => `tables/${id}`, () => ({ name: "Przejęty stół" }), bTableId],
  ["delete B's table", "DELETE", (id) => `tables/${id}`, () => undefined, bTableId],
  [
    "add a table to B's room",
    "POST",
    () => "tables",
    (id) => ({ roomId: id, name: "Obcy stół", seatCount: 4, shape: "round", x: 0.2, y: 0.2 }),
    bRoomId,
  ],
  ["move A's table into B's room", "PATCH", () => `tables/${aTableId}`, (id) => ({ roomId: id }), bRoomId],
  ["seat B's guest", "PUT", (id) => `seating/guests/${id}`, () => ({ tableId: aTableId, seat: 1 }), b4],
  [
    "seat A's guest at B's table",
    "PUT",
    () => `seating/guests/${aGuestId}`,
    (id) => ({ tableId: id, seat: 4 }),
    bTableId,
  ],
  ["pin B's guest", "PATCH", (id) => `seating/guests/${id}`, () => ({ pinned: true }), b1],
  ["unseat B's guest", "DELETE", (id) => `seating/guests/${id}`, () => undefined, b1],
  ["restore B's snapshot", "POST", () => "seating/restore", (id) => ({ snapshotId: id }), bSnapshotId],
  ["enter B's guest's guess", "PUT", (id) => `guesses/${id}`, () => ({ amount: "1" }), b2],
  ["delete B's guest's guess", "DELETE", (id) => `guesses/${id}`, () => undefined, b1],
  ["revoke B's guest link", "POST", (id) => `guest-links/${id}/revoke`, () => undefined, b1],
  ["edit B's question", "PATCH", (id) => `questions/${id}`, () => ({ text: "Przejęte pytanie?" }), bQuestionId],
  ["delete B's question", "DELETE", (id) => `questions/${id}`, () => undefined, bQuestionId],
  [
    "order a dish for B's guest",
    "POST",
    () => "orders",
    (id) => ({ name: "Obce danie", quantity: 1, assignment: { guestId: id } }),
    b1,
  ],
  [
    "order a dish for B's table",
    "POST",
    () => "orders",
    (id) => ({ name: "Obce danie", quantity: 1, assignment: { tableId: id } }),
    bTableId,
  ],
  ["give A's dish to B's guest", "PATCH", () => `orders/${aLineId}`, (id) => ({ assignment: { guestId: id } }), b1],
  ["mark B's dish served", "PATCH", (id) => `orders/${id}`, () => ({ delivered: true }), bLineId],
  ["mark a piece of B's dish", "PUT", (id) => `orders/${id}/pieces`, () => ({ piece: 1, delivered: true }), bLineId],
  ["delete B's dish", "DELETE", (id) => `orders/${id}`, () => undefined, bLineId],
  ["change B's drink", "PATCH", (id) => `drinks/${id}`, () => ({ quantity: 9 }), bDrinkId],
  ["delete B's drink", "DELETE", (id) => `drinks/${id}`, () => undefined, bDrinkId],
];
for (const [label, method, pathOf, bodyOf, foreignId] of foreignWrites) {
  const send = (id) => {
    const json = bodyOf(id);
    return request(`${api}/${pathOf(id)}`, json === undefined ? { method } : { method, json });
  };
  const foreign = await send(foreignId);
  const unknown = await send(UNKNOWN_ID);
  check(
    `isolation: A's key cannot ${label} (answered like an unknown id)`,
    foreign.status >= 400 && foreign.status === unknown.status && foreign.body === unknown.body,
    `${foreign.status} ${unknown.status} ${foreign.body.slice(0, 120)}`,
  );
}

// The panel side: A's owner cannot price, reset or read the AI costs of B's event (the identical 404).
for (const [method, path, json] of [
  ["PUT", "prices", { kind: "dish", name: B_DISH, price: "1" }],
  ["GET", "prices", undefined],
  ["POST", "reset", { parts: ["guesses"] }],
  ["GET", "ai-topics", undefined],
]) {
  const res = await request(`/api/panel/events/${String(eventB.id)}/${path}`, asOps({ method, json }));
  check(`isolation: A's owner gets the identical 404 on B's ${method} ${path}`, noAccessJson(res), String(res.status));
}

// A draft with B's guest (at A's table) and A's guest at B's table: the same 409 and problems as ids that do not exist.
const draftOf = (guestId, tableId) =>
  request(`${seatingApi}/draft`, {
    method: "POST",
    json: {
      seats: [
        { guestId, tableId: aTableId, seat: 1 },
        { guestId: aGuestId, tableId, seat: 2 },
      ],
    },
  });
const foreignDraft = await draftOf(b4, bTableId);
const unknownDraft = await draftOf(UNKNOWN_ID, UNKNOWN_ID);
check(
  "isolation: A's draft with B's guest and table is refused like unknown ids",
  foreignDraft.status === 409 &&
    foreignDraft.body === unknownDraft.body &&
    foreignDraft.data?.problems?.includes("W projekcie jest osoba, której nie ma już na liście gości.") &&
    foreignDraft.data.problems.includes("W projekcie jest stolik, którego już nie ma."),
  `${foreignDraft.body} / ${unknownDraft.body}`,
);

// A guest of A marks a piece of B's dish: the same 409 as a line that does not exist.
await request(linksApi, { method: "PATCH", json: { enabled: true } });
const aGuestKey = (await request(linksApi)).data?.guests?.[0]?.key;
const foreignPiece = await request(`/api/g/${aGuestKey}/orders`, {
  method: "PUT",
  json: { lineId: bLineId, piece: 1, delivered: true },
});
const unknownPiece = await request(`/api/g/${aGuestKey}/orders`, {
  method: "PUT",
  json: { lineId: UNKNOWN_ID, piece: 1, delivered: true },
});
const aGuestState = await request(guestStateApi(aGuestKey));
const aGuestPage = await request(`/g/${aGuestKey}`);
check(
  "isolation: A's guest cannot mark B's dish and sees nothing of B",
  foreignPiece.status === 409 &&
    foreignPiece.body === unknownPiece.body &&
    aGuestState.status === 200 &&
    aGuestPage.status === 200 &&
    ![aGuestState.body, aGuestPage.body].some((body) => body.includes(B_MARK) || body.includes(OTHER_EVENT_NAME)),
  `${foreignPiece.status} ${unknownPiece.status} ${aGuestState.status} ${aGuestPage.status}`,
);
await request(linksApi, { method: "PATCH", json: { enabled: false } });

// Nothing A's organizer, TV or restaurant links read mentions B.
const aReads = [
  ...B_READS.map((path) => `${api}/${path}`),
  `/o/${organizerKey}`,
  `/o/${organizerKey}/goscie`,
  `/o/${organizerKey}/sale`,
  `/o/${organizerKey}/rozsadzenie`,
  `/o/${organizerKey}/strzaly`,
  `/o/${organizerKey}/linki`,
  `/o/${organizerKey}/pytania`,
  `/o/${organizerKey}/zamowienia`,
  `/tv/${tvKey}`,
  tvSeatingApi,
  `/r/${newRestaurantKey}`,
  `/api/r/${newRestaurantKey}/orders`,
];
const aLeaks = [];
for (const path of aReads) {
  const res = await request(path);
  if (res.status !== 200 || res.body.includes(B_MARK) || res.body.includes(OTHER_EVENT_NAME)) {
    aLeaks.push(`${path.replace(organizerKey, "<organizer>").replace(tvKey, "<tv>")} ${String(res.status)}`);
  }
}
check("isolation: nothing A's links read mentions event B", aLeaks.length === 0, aLeaks.join(", "));

const bAfterAttempts = await readB();
check(
  "isolation: event B reads exactly the same after A's attempts",
  bAfterAttempts.every((body, index) => body === bBefore[index]),
  B_READS.filter((_, index) => bAfterAttempts[index] !== bBefore[index]).join(", "),
);

// B's own links show B and nothing of A.
const mentionsA = (body) => body.includes(EVENT_NAME) || aGuestNames.some((name) => body.includes(name));
const bTvSeating = await request(`/api/tv/${eventB.tvKey}/seating`);
const bTvPage = await request(`/tv/${eventB.tvKey}`);
const bRestaurant = await request(`/api/r/${eventB.restaurantKey}/orders`);
const bRestaurantPage = await request(`/r/${eventB.restaurantKey}`);
const bGuestState = await request(guestStateApi(bGuestKey));
const bGuestPage = await request(`/g/${bGuestKey}`);
check(
  "isolation: B's TV, restaurant and guest links show B's seating, dish and event only",
  bTvSeating.status === 200 &&
    B_GUESTS.slice(0, 3).every((name) => bTvSeating.body.includes(name)) &&
    bTvPage.status === 200 &&
    bRestaurant.status === 200 &&
    bRestaurant.body.includes(B_DISH) &&
    !aDishNames.some((name) => bRestaurant.body.includes(name)) &&
    bRestaurantPage.status === 200 &&
    bGuestState.status === 200 &&
    bGuestState.data?.status === "seated" &&
    bGuestPage.status === 200 &&
    bGuestPage.body.includes(OTHER_EVENT_NAME) &&
    ![bTvSeating, bTvPage, bRestaurant, bRestaurantPage, bGuestState, bGuestPage].some((res) => mentionsA(res.body)),
  [bTvSeating, bTvPage, bRestaurant, bRestaurantPage, bGuestState, bGuestPage].map((res) => res.status).join(" "),
);

// B's keys in another role's place get the same denials as any wrong key (keys are global, never per event).
const bKeyDenials = [];
for (const [path, expected] of [
  [`/o/${eventB.tvKey}`, deniedBody],
  [`/o/${bGuestKey}`, deniedBody],
  [`/o/${eventB.restaurantKey}`, deniedBody],
  [`/tv/${eventB.organizerKey}`, deniedBody],
  [`/tv/${bGuestKey}`, deniedBody],
  [`/g/${eventB.organizerKey}`, deniedBody],
  [`/g/${eventB.tvKey}`, deniedBody],
  [`/r/${eventB.organizerKey}`, restaurantDeniedBody],
  [`/api/o/${eventB.tvKey}/guests`, JSON.stringify({ error: "Brak dostępu" })],
  [`/api/tv/${bGuestKey}/seating`, JSON.stringify({ error: "Brak dostępu" })],
  [`/api/g/${eventB.organizerKey}/state`, JSON.stringify({ error: "Brak dostępu" })],
  [`/api/r/${eventB.tvKey}/orders`, JSON.stringify({ error: "No access" })],
]) {
  const res = await request(path);
  if (res.status !== 404 || res.body !== expected) {
    const shown = [eventB.organizerKey, eventB.tvKey, eventB.restaurantKey, bGuestKey].reduce(
      (text, key) => text.replace(key, "<key>"),
      path,
    );
    bKeyDenials.push(`${shown} ${String(res.status)}`);
  }
}
check(
  "isolation: B's keys in another role's place get the usual denial",
  bKeyDenials.length === 0,
  bKeyDenials.join(", "),
);

// 24. Reset. Since client-restaurant-split (FR-028) the full „Reset danych” is the venue's (panel, owners and
// managers: the ops owner here) and the client link has „Reset prób” (seating + guesses only); the client's old reset
// route answers the identical denial. One POST resets the chosen parts (implied ones added) in one transaction and
// answers with the Polish summary. Here: a subset first (guesses + AI usage), then the guest links, then the client's
// trial reset, then everything — the client and TV links keep working, the event is empty except the 90 starter
// questions.
const resetApi = `${opsPanel}/reset`;
const trialResetApi = `${api}/trial-reset`;
const RESET_PARTS = ["guesses", "aiUsage", "seating", "guests", "venue", "orders", "questions", "guestLinks"];
const COUNT_KEYS = [
  "guesses",
  "correctAmountSet",
  "intakeOpen",
  "aiAttempts",
  "aiUsed",
  "seats",
  "pinned",
  "snapshots",
  "guests",
  "groups",
  "plan",
  "rooms",
  "tables",
  "orders",
  "questions",
  "guestAccessEnabled",
]
  .sort()
  .join(",");
// Flat objects compared regardless of key order.
const sameFlat = (a, b) =>
  JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const isSummary = (data, lines) =>
  Array.isArray(data?.summary) &&
  data.summary.length === lines &&
  data.summary.every((line) => typeof line === "string" && line.length > 0);

const shellWithReset = await request(`/o/${organizerKey}`);
const tvPageWithoutReset = await request(`/tv/${tvKey}`);
const eventPageWithReset = await request(`/panel/wydarzenia/${String(eventA.id)}`, asOps());
check(
  "client shell ends with the „Reset prób” card (no full reset); the TV page has none",
  shellWithReset.status === 200 &&
    shellWithReset.body.includes("Reset prób") &&
    !shellWithReset.body.includes("Reset danych") &&
    shellWithReset.body.includes('component-export="ResetPanel"') &&
    shellWithReset.body.includes("&quot;variant&quot;:[0,&quot;trial&quot;]") &&
    shellWithReset.body.indexOf("Reset prób") > shellWithReset.body.indexOf("Odczyt bez sieci") &&
    tvPageWithoutReset.status === 200 &&
    !tvPageWithoutReset.body.includes("Reset prób") &&
    !tvPageWithoutReset.body.includes("Reset danych") &&
    !tvPageWithoutReset.body.includes("ResetPanel"),
  `${shellWithReset.status} ${tvPageWithoutReset.status}`,
);
check(
  "the panel's event page has the full „Reset danych” for the owner",
  eventPageWithReset.status === 200 &&
    eventPageWithReset.body.includes("Reset danych") &&
    eventPageWithReset.body.includes("data-event-reset") &&
    eventPageWithReset.body.includes('component-export="ResetPanel"'),
  String(eventPageWithReset.status),
);

for (const [label, key] of [
  ["<organizer>", organizerKey],
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  for (const method of ["GET", "POST"]) {
    const res = await request(
      `/api/o/${key}/reset`,
      method === "POST" ? { method, json: { parts: [...RESET_PARTS] } } : {},
    );
    check(
      `full reset on a key: ${method} ${label} → the identical denial`,
      noAccessJson(res),
      `${res.status} ${res.body}`,
    );
  }
}
for (const [label, key] of [
  ["<tv>", tvKey],
  ["<guest>", aniaNewKey],
]) {
  for (const method of ["GET", "POST"]) {
    const res = await request(
      `/api/o/${key}/trial-reset`,
      method === "POST" ? { method, json: { parts: ["seating"] } } : {},
    );
    check(`trial reset with a wrong key: ${method} ${label}`, noAccessJson(res), `${res.status} ${res.body}`);
  }
}
const resetNoSession = await request(resetApi);
check("panel reset without a session: 401", resetNoSession.status === 401, String(resetNoSession.status));

const resetPreview = await request(resetApi, asOps());
const previewCounts = resetPreview.data?.counts;
check(
  "reset preview: fresh counts of everything a reset would remove",
  resetPreview.status === 200 &&
    resetPreview.cacheControl.includes("no-store") &&
    keysOf(resetPreview.data) === "counts,starterQuestions" &&
    keysOf(previewCounts) === COUNT_KEYS &&
    resetPreview.data.starterQuestions === 90 &&
    previewCounts.guests > 0 &&
    previewCounts.tables > 0 &&
    previewCounts.snapshots > 0 &&
    previewCounts.guesses > 0 &&
    previewCounts.correctAmountSet === true &&
    previewCounts.aiAttempts > 0 &&
    previewCounts.plan === true &&
    previewCounts.orders > 0 &&
    !resetPreview.body.includes(organizerKey) &&
    !resetPreview.body.includes(tvKey),
  `${resetPreview.status} ${resetPreview.body}`,
);

for (const [label, options] of [
  ["a body without parts", { json: {} }],
  ["an empty list", { json: { parts: [] } }],
  ["an unknown part", { json: { parts: ["event"] } }],
  ["an extra key", { json: { parts: ["guesses"], organizerKey } }],
  ["malformed JSON", { rawBody: "{" }],
]) {
  const res = await request(resetApi, asOps({ method: "POST", ...options }));
  check(`reset refuses ${label}: 400`, res.status === 400 && errorOf(res) === "Nieprawidłowe dane.", res.body);
}
for (const [label, options] of [
  ["a part outside the trial", { json: { parts: ["guests"] } }],
  ["the full list", { json: { parts: [...RESET_PARTS] } }],
  ["an empty list", { json: { parts: [] } }],
  ["an extra key", { json: { parts: ["seating"], organizerKey } }],
]) {
  const res = await request(trialResetApi, { method: "POST", ...options });
  check(`trial reset refuses ${label}: 400`, res.status === 400 && errorOf(res) === "Nieprawidłowe dane.", res.body);
}
const previewAfterRefusals = await request(resetApi, asOps());
check(
  "refused resets change nothing",
  previewAfterRefusals.status === 200 && previewAfterRefusals.body === resetPreview.body,
  previewAfterRefusals.body,
);

const spotBeforeReset = await request(tvSpotApi, { method: "PUT", json: { kind: "question", text: SPOT_QUESTION } });
const subsetReset = await request(resetApi, asOps({ method: "POST", json: { parts: ["aiUsage", "guesses"] } }));
const guessesAfterSubset = await request(guessesApi);
const aiAfterSubset = await request(`${opsPanel}/ai-topics`, asOps());
const guestsAfterSubset = await request(`${api}/guests`);
const venueAfterSubset = await request(`${api}/venue`);
check(
  "reset of guesses + AI usage clears exactly those",
  subsetReset.status === 200 &&
    JSON.stringify(subsetReset.data?.parts) === JSON.stringify(["guesses", "aiUsage"]) &&
    sameFlat(subsetReset.data.before, previewCounts) &&
    isSummary(subsetReset.data, 2) &&
    guessesAfterSubset.data?.intakeOpen === true &&
    guessesAfterSubset.data.correctAmountGrosze === null &&
    guessesAfterSubset.data.ranking === null &&
    guessesAfterSubset.data.guests.every((guest) => guest.amountGrosze === null) &&
    JSON.stringify(aiAfterSubset.data?.usage) === usageText(0, 0) &&
    guestsAfterSubset.data?.guests?.length === previewCounts.guests &&
    venueAfterSubset.data?.tables?.length === previewCounts.tables,
  `${subsetReset.status} ${subsetReset.body}`,
);

const spotAfterSubset = await request(tvSpotApi);
const tvAfterSubset = await request(tvSeatingApi);
check(
  "any reset takes what was on the TV down",
  spotBeforeReset.status === 200 &&
    spotBeforeReset.data?.spotlight?.text === SPOT_QUESTION &&
    spotAfterSubset.body === JSON.stringify({ spotlight: null }) &&
    tvAfterSubset.data?.spotlight === null,
  `${spotBeforeReset.status} ${spotAfterSubset.body}`,
);

await request(linksApi, { method: "PATCH", json: { enabled: true } });
const aniaBeforeLinksReset = await request(guestStateApi(aniaNewKey));
const linksReset = await request(resetApi, asOps({ method: "POST", json: { parts: ["guestLinks"] } }));
const linksAfterReset = await request(linksApi);
const aniaAfterLinksReset = await request(guestStateApi(aniaNewKey));
check(
  "reset of guest links: a new key for every guest, guest access off, the old link dead",
  aniaBeforeLinksReset.status === 200 &&
    linksReset.status === 200 &&
    linksReset.data?.guestKeysReplaced === previewCounts.guests &&
    isSummary(linksReset.data, 1) &&
    linksAfterReset.data?.enabled === false &&
    linksAfterReset.data.guests.length === previewCounts.guests &&
    linksAfterReset.data.guests.every((guest) => isKey(guest.key) && guest.key !== aniaNewKey) &&
    noAccessJson(aniaAfterLinksReset),
  `${aniaBeforeLinksReset.status} ${linksReset.status} ${aniaAfterLinksReset.status}`,
);

// The client's „Reset prób”: the seating (with every publication) and the guesses go; guests, the venue, orders and
// questions stay.
const trialPreview = await request(trialResetApi);
const panelPreviewBeforeTrial = await request(resetApi, asOps());
const trialReset = await request(trialResetApi, { method: "POST", json: { parts: ["seating", "guesses"] } });
const afterTrial = (await request(resetApi, asOps())).data?.counts;
const beforeTrial = panelPreviewBeforeTrial.data?.counts;
check(
  "„Reset prób”: the preview is the panel's, the reset clears seating and guesses only",
  trialPreview.status === 200 &&
    trialPreview.body === panelPreviewBeforeTrial.body &&
    beforeTrial?.snapshots > 0 &&
    trialReset.status === 200 &&
    JSON.stringify(trialReset.data?.parts) === JSON.stringify(["guesses", "seating"]) &&
    isSummary(trialReset.data, 2) &&
    afterTrial?.seats === 0 &&
    afterTrial.snapshots === 0 &&
    afterTrial.guesses === 0 &&
    afterTrial.guests === beforeTrial.guests &&
    afterTrial.groups === beforeTrial.groups &&
    afterTrial.rooms === beforeTrial.rooms &&
    afterTrial.tables === beforeTrial.tables &&
    afterTrial.orders === beforeTrial.orders &&
    afterTrial.questions === beforeTrial.questions &&
    afterTrial.plan === beforeTrial.plan,
  `${trialPreview.status} ${trialReset.status} ${trialReset.body.slice(0, 200)}`,
);

const tvBeforeFullReset = await request(tvSeatingApi);
const fullReset = await request(resetApi, asOps({ method: "POST", json: { parts: [...RESET_PARTS] } }));
check(
  "reset of everything answers with every part and its summary",
  fullReset.status === 200 &&
    JSON.stringify(fullReset.data?.parts) === JSON.stringify(RESET_PARTS) &&
    fullReset.data.questionsAdded === 90 &&
    isSummary(fullReset.data, RESET_PARTS.length) &&
    !fullReset.body.includes(organizerKey) &&
    !fullReset.body.includes(tvKey),
  `${fullReset.status} ${fullReset.body}`,
);
const guestsAfterReset = await request(`${api}/guests`);
const venueAfterReset = await request(`${api}/venue`);
const tvAfterReset = await request(tvSeatingApi);
const publishedAfterReset = await request(`${seatingApi}/published`);
const questionsAfterReset = await request(questionsApi);
const guessesAfterReset = await request(guessesApi);
const linksAfterFullReset = await request(linksApi);
const previewAfterReset = await request(resetApi, asOps());
check(
  "after resetting everything: no guests, venue, seating or guesses",
  guestsAfterReset.data?.guests?.length === 0 &&
    guestsAfterReset.data.groups.length === 0 &&
    venueAfterReset.body === JSON.stringify({ plan: null, rooms: [], tables: [], chairPitch: 0.035 }) &&
    tvAfterReset.status === 200 &&
    tvAfterReset.data?.publishedAt === null &&
    tvAfterReset.data.tables.length === 0 &&
    tvAfterReset.data.version !== tvBeforeFullReset.data?.version &&
    publishedAfterReset.body === JSON.stringify({ published: null }) &&
    guessesAfterReset.data?.guests?.length === 0 &&
    guessesAfterReset.data.intakeOpen === true &&
    guessesAfterReset.data.correctAmountGrosze === null &&
    linksAfterFullReset.data?.enabled === false,
  `${guestsAfterReset.body} ${venueAfterReset.body} ${tvAfterReset.body}`,
);
const personAfterReset = await request(`${tvSpotApi}/person`, { method: "POST" });
check(
  "after resetting everything nobody can be drawn for the TV",
  personAfterReset.status === 409 &&
    errorOf(personAfterReset) === "Nie ma kogo losować — brak obecnych gości na liście." &&
    (await request(tvSpotApi)).body === JSON.stringify({ spotlight: null }),
  `${personAfterReset.status} ${personAfterReset.body}`,
);
check(
  "after resetting everything: exactly the 90 starter questions",
  questionsAfterReset.data?.questions?.length === 90 && questionsAfterReset.data.starterMissing === 0,
  `${questionsAfterReset.data?.questions?.length} ${questionsAfterReset.data?.starterMissing}`,
);
check(
  "after resetting everything: the preview counts nothing but the starter questions",
  previewAfterReset.status === 200 &&
    sameFlat(previewAfterReset.data?.counts, {
      guesses: 0,
      correctAmountSet: false,
      intakeOpen: true,
      aiAttempts: 0,
      aiUsed: 0,
      seats: 0,
      pinned: 0,
      snapshots: 0,
      guests: 0,
      groups: 0,
      plan: false,
      rooms: 0,
      tables: 0,
      orders: 0,
      questions: 90,
      guestAccessEnabled: false,
    }),
  previewAfterReset.body,
);
const drinksAfterReset = await request(ordersApi);
check(
  "after resetting everything: no drinks left (the orders part deletes them)",
  drinksAfterReset.status === 200 &&
    drinksAfterReset.data?.drinks?.length === 0 &&
    drinksAfterReset.data.drinkTotals.totalGrosze === 0,
  drinksAfterReset.body.slice(0, 200),
);
const shellAfterReset = await request(`/o/${organizerKey}`);
const tvPageAfterReset = await request(`/tv/${tvKey}`);
check(
  "after resetting everything: the organizer and TV links still open",
  shellAfterReset.status === 200 && tvPageAfterReset.status === 200,
  `${shellAfterReset.status} ${tvPageAfterReset.status}`,
);
const bAfterReset = await readB();
check(
  "isolation: resetting everything in A leaves event B exactly as it was",
  bAfterReset.every((body, index) => body === bBefore[index]),
  B_READS.filter((_, index) => bAfterReset[index] !== bBefore[index]).join(", "),
);

// The ops owner leaves A before the team sections (its session stays; it opens nothing in A any more).
try {
  if (opsAccount) await removeMembership(platformEnv, restaurantA.id, opsAccount.id);
} catch (error) {
  check("the ops owner leaves A", false, error instanceof PlatformError ? error.message : String(error));
}
const opsAfterLeaving = await request(`${opsPanel}/ai-topics`, asOps());
check("the ops owner opens nothing in A after leaving", noAccessJson(opsAfterLeaving), String(opsAfterLeaving.status));

// 25. Staff accounts (staff-accounts, F-03): one-time links set the password, e-mail + password log in for 30 days,
// logout (here or everywhere) and a password change end sessions, failed logins are throttled per e-mail, every
// mutation needs the page's own Origin, and the panel guard opens only the person's own restaurants and events (one 404
// for everything else). Accounts: owner of A, waiter of A, owner of B, a platform admin without restaurants and an
// account only for the throttle, all with e-mails of this run.
const STAFF_PASSWORD = "smoke-haslo-1";
const NEW_STAFF_PASSWORD = "smoke-nowe-haslo-2";
const staffEmail = (who) => `${who}-${RUN_TAG}@smoke.stolik`;
const SESSION_RE = /(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/;
const sessionOf = (res) => SESSION_RE.exec(res.setCookie)?.[1] ?? null;
const asStaff = (token) => `kp-session=${token}`;
const pathOf = (res) => (res.location ? new URL(res.location, BASE_URL) : null);
const redirectsTo = (res, target) => res.status === 303 && `${pathOf(res)?.pathname}${pathOf(res)?.search}` === target;
const authHeaders = (res) =>
  res.referrerPolicy === "same-origin" && res.frameOptions === "DENY" && res.cacheControl.includes("no-store");
const redeem = (token, password = STAFF_PASSWORD, repeat = password, options = {}) =>
  request("/api/auth/password-link", { method: "POST", form: { token, password, repeat }, ...options });
const logIn = (email, password, options = {}) =>
  request("/api/auth/login", { method: "POST", form: { email, password }, ...options });
const me = (token) => request("/api/panel/me", { cookie: asStaff(token) });

const staff = {};
try {
  for (const [who, role, restaurant] of [
    ["ownerA", "owner", restaurantA],
    ["waiterA", "waiter", restaurantA],
    ["ownerB", "owner", restaurantB],
    ["admin", null, null],
    ["throttled", null, null],
  ]) {
    const account = await ensureStaffAccount(platformEnv, {
      email: staffEmail(who.toLowerCase()),
      displayName: `Smoke ${who}`,
      isPlatformAdmin: who === "admin",
    });
    if (restaurant) {
      await addMembership(platformEnv, restaurant.id, account.id, role);
    }
    const invite = await issueStaffLink(platformEnv, account.id, "invite", BASE_URL);
    staff[who] = { email: account.email, id: account.id, invite: invite.token };
  }
} catch (error) {
  check(
    "staff accounts are created in the local database",
    false,
    error instanceof PlatformError ? error.message : String(error),
  );
  finish();
}

// Pages and redirects without a session.
const loginPage = await request("/logowanie");
check(
  "staff: the login page has the form and the auth headers (same-origin referrer, no framing, no-store)",
  loginPage.status === 200 && loginPage.body.includes('action="/api/auth/login"') && authHeaders(loginPage),
  `${loginPage.status} ${loginPage.referrerPolicy} ${loginPage.frameOptions}`,
);
const organizerHeaders = await request(`/o/${organizerKey}`);
check(
  "staff: the key routes keep Referrer-Policy: no-referrer",
  organizerHeaders.status === 200 && organizerHeaders.referrerPolicy === "no-referrer",
  organizerHeaders.referrerPolicy,
);
const panelNoSession = await request("/panel");
const panelDeepNoSession = await request("/panel/x");
const panelKeyNoSession = await request(`/panel/${organizerKey}`);
check(
  "staff: /panel, /panel/x and an organizer key under /panel without a session → 303 to /logowanie, no-store",
  [panelNoSession, panelDeepNoSession, panelKeyNoSession].every(
    (res) => redirectsTo(res, "/logowanie") && res.cacheControl.includes("no-store"),
  ),
  [panelNoSession, panelDeepNoSession, panelKeyNoSession].map((res) => `${res.status} ${res.location}`).join(", "),
);
const meNoCookie = await request("/api/panel/me");
const meGarbage = await request("/api/panel/me", { cookie: asStaff(randomBytes(32).toString("base64url")) });
const meMalformed = await request("/api/panel/me", { cookie: "kp-session=abc" });
const panelApiUnknown = await request("/api/panel/nie-ma");
check(
  "staff: the panel API without a valid session → identical 401 bodies (no cookie, unknown, malformed, unknown route)",
  [meNoCookie, meGarbage, meMalformed, panelApiUnknown].every(
    (res) => res.status === 401 && res.body === meNoCookie.body && res.cacheControl.includes("no-store"),
  ) && meNoCookie.data?.error !== undefined,
  [meNoCookie, meGarbage, meMalformed, panelApiUnknown].map((res) => res.status).join(" "),
);
check(
  "staff: a session cookie that opens nothing is cleared (Max-Age=0)",
  /kp-session=;[^,]*Max-Age=0/.test(meGarbage.setCookie) && meNoCookie.setCookie === "",
  meGarbage.setCookie,
);

// One-time links: an unknown or malformed link and (later) a used one get the identical invalid-link page.
const linkUnknown = await request(`/haslo/${randomBytes(32).toString("base64url")}`);
const linkMalformed = await request("/haslo/abc");
check(
  "staff: an unknown and a malformed password link → identical 404 invalid-link page",
  linkUnknown.status === 404 &&
    linkMalformed.status === 404 &&
    linkUnknown.body === linkMalformed.body &&
    linkUnknown.body.includes("Link nieważny") &&
    authHeaders(linkUnknown),
  `${linkUnknown.status} ${linkMalformed.status}`,
);
const inviteA = `/haslo/${staff.ownerA.invite}`;
const invitePage = await request(inviteA);
check(
  "staff: a valid invitation shows the account's e-mail with the auth headers",
  invitePage.status === 200 &&
    invitePage.body.includes(staff.ownerA.email) &&
    invitePage.body.includes('action="/api/auth/password-link"') &&
    authHeaders(invitePage),
  `${invitePage.status} ${invitePage.referrerPolicy}`,
);
const tooShort = await redeem(staff.ownerA.invite, "krotkie");
const mismatch = await redeem(staff.ownerA.invite, STAFF_PASSWORD, `${STAFF_PASSWORD}x`);
const stillValid = await request(inviteA);
check(
  "staff: a too short or mismatched password → back to the link with a code, the link still works",
  redirectsTo(tooShort, `${inviteA}?blad=krotkie`) &&
    redirectsTo(mismatch, `${inviteA}?blad=rozne`) &&
    tooShort.setCookie === "" &&
    stillValid.status === 200,
  `${tooShort.location} ${mismatch.location} ${stillValid.status}`.replaceAll(staff.ownerA.invite, "<token>"),
);
const redeemedA = await redeem(staff.ownerA.invite);
const sessionA1 = sessionOf(redeemedA);
check(
  "staff: setting the password → 303 /panel with a 30-day HttpOnly SameSite=Lax cookie (no Secure on http)",
  redirectsTo(redeemedA, "/panel") &&
    sessionA1 !== null &&
    /HttpOnly/i.test(redeemedA.setCookie) &&
    /SameSite=Lax/i.test(redeemedA.setCookie) &&
    /Path=\/(;|$)/.test(redeemedA.setCookie) &&
    /Max-Age=2592000/.test(redeemedA.setCookie) &&
    (behindTls || !/Secure/i.test(redeemedA.setCookie)),
  redeemedA.setCookie.replace(SESSION_RE, "kp-session=<token>;"),
);
const linkUsed = await request(inviteA);
const redeemAgain = await redeem(staff.ownerA.invite);
check(
  "staff: a used link → the identical invalid-link page, and it sets no password again",
  linkUsed.status === 404 && linkUsed.body === linkUnknown.body && redirectsTo(redeemAgain, inviteA),
  `${linkUsed.status} ${redeemAgain.status} ${redeemAgain.location}`.replaceAll(staff.ownerA.invite, "<token>"),
);
const redeemedWaiter = await redeem(staff.waiterA.invite, STAFF_PASSWORD, STAFF_PASSWORD, { extraHeaders: viaProxy });
const sessionWaiter = sessionOf(redeemedWaiter);
check(
  "staff: behind a TLS proxy the session cookie is Secure",
  redirectsTo(redeemedWaiter, "/panel") && sessionWaiter !== null && /Secure/i.test(redeemedWaiter.setCookie),
  redeemedWaiter.setCookie.replace(SESSION_RE, "kp-session=<token>;"),
);
const sessionB = sessionOf(await redeem(staff.ownerB.invite));
const sessionAdmin = sessionOf(await redeem(staff.admin.invite));
const sessionThrottled = sessionOf(await redeem(staff.throttled.invite));
check(
  "staff: every invited account sets its password",
  [sessionB, sessionAdmin, sessionThrottled].every((token) => token !== null),
);

// The panel with a session.
const panelA = await request("/panel", { cookie: asStaff(sessionA1) });
check(
  "staff: /panel shows the person, restaurant A and the role „Właściciel” with the auth headers",
  panelA.status === 200 &&
    panelA.body.includes(staff.ownerA.email) &&
    panelA.body.includes(`Restauracja smoke A ${RUN_TAG}`) &&
    panelA.body.includes("Właściciel") &&
    !panelA.body.includes(`Restauracja smoke B ${RUN_TAG}`) &&
    authHeaders(panelA),
  `${panelA.status} ${panelA.referrerPolicy}`,
);
const loginWithSession = await request("/logowanie", { cookie: asStaff(sessionA1) });
check(
  "staff: /logowanie with a session → 303 /panel",
  redirectsTo(loginWithSession, "/panel"),
  loginWithSession.location,
);
const meA = await me(sessionA1);
check(
  "staff: /api/panel/me answers the person and their restaurants with roles (no tokens, no ids of sessions)",
  meA.status === 200 &&
    meA.data?.email === staff.ownerA.email &&
    meA.data.isPlatformAdmin === false &&
    meA.data.restaurants?.length === 1 &&
    meA.data.restaurants[0].id === restaurantA.id &&
    meA.data.restaurants[0].role === "owner" &&
    !meA.body.includes(sessionA1),
  meA.body,
);

// Login: one answer for a wrong password and an unknown e-mail; typos below the limit do not lock anyone out.
const wrongPassword = await logIn(staff.ownerA.email, "zle-haslo-123");
const unknownEmail = await logIn(staffEmail("nikt"), "zle-haslo-123");
check(
  "staff: a wrong password and an unknown e-mail → the identical 303 /logowanie?blad=dane without a cookie",
  redirectsTo(wrongPassword, "/logowanie?blad=dane") &&
    redirectsTo(unknownEmail, "/logowanie?blad=dane") &&
    wrongPassword.body === unknownEmail.body &&
    wrongPassword.setCookie === "" &&
    unknownEmail.setCookie === "",
  `${wrongPassword.location} ${unknownEmail.location}`,
);
const loggedInA = await logIn(` ${staff.ownerA.email.toUpperCase()} `, STAFF_PASSWORD);
const sessionA2 = sessionOf(loggedInA);
check(
  "staff: the right password (e-mail in any case, spaces around) → 303 /panel with a new session",
  redirectsTo(loggedInA, "/panel") && sessionA2 !== null && sessionA2 !== sessionA1,
  loggedInA.location,
);
for (let typo = 0; typo < 3; typo++) {
  await logIn(staff.ownerB.email, `literowka-${String(typo)}-xyz`);
}
const afterTypos = await logIn(staff.ownerB.email, STAFF_PASSWORD);
check(
  "staff: three typos, then the right password → logged in",
  redirectsTo(afterTypos, "/panel") && sessionOf(afterTypos) !== null,
  afterTypos.location,
);
for (let failure = 0; failure < 10; failure++) {
  await logIn(staff.throttled.email, `zle-haslo-${String(failure)}`);
  await logIn(staffEmail("nieznany"), `zle-haslo-${String(failure)}`);
}
const throttledRight = await logIn(staff.throttled.email, STAFF_PASSWORD);
const throttledUnknown = await logIn(staffEmail("nieznany"), STAFF_PASSWORD);
check(
  "staff: after 10 failures even the right password → 303 blad=limit with Retry-After, identical for an unknown e-mail",
  redirectsTo(throttledRight, "/logowanie?blad=limit") &&
    redirectsTo(throttledUnknown, "/logowanie?blad=limit") &&
    throttledRight.setCookie === "" &&
    Number(throttledRight.retryAfter) > 0 &&
    Number(throttledRight.retryAfter) <= 900 &&
    Number(throttledUnknown.retryAfter) > 0 &&
    throttledRight.body === throttledUnknown.body,
  `${throttledRight.location} ${throttledRight.retryAfter} ${throttledUnknown.location} ${throttledUnknown.retryAfter}`,
);
check(
  "staff: the throttle stops new logins only, a session of that account still works",
  (await me(sessionThrottled)).status === 200,
);

// Origin: every auth and panel mutation without the page's own Origin → 403, and nothing happens.
const FOREIGN = { Origin: "https://evil.example" };
const originAttempts = [
  ["login, no Origin, form", () => logIn(staff.ownerA.email, STAFF_PASSWORD, { noOrigin: true })],
  ["login, foreign Origin, form", () => logIn(staff.ownerA.email, STAFF_PASSWORD, { extraHeaders: FOREIGN })],
  [
    "login, foreign Origin, JSON",
    () =>
      request("/api/auth/login", {
        method: "POST",
        json: { email: staff.ownerA.email, password: STAFF_PASSWORD },
        extraHeaders: FOREIGN,
      }),
  ],
  [
    "logout, no Origin",
    () => request("/api/auth/logout", { method: "POST", cookie: asStaff(sessionA1), noOrigin: true }),
  ],
  [
    "logout, foreign Origin",
    () => request("/api/auth/logout", { method: "POST", form: {}, cookie: asStaff(sessionA1), extraHeaders: FOREIGN }),
  ],
  [
    "password change, no Origin, form",
    () =>
      request("/api/panel/password", {
        method: "POST",
        form: { current: STAFF_PASSWORD, password: NEW_STAFF_PASSWORD, repeat: NEW_STAFF_PASSWORD },
        cookie: asStaff(sessionA1),
        noOrigin: true,
      }),
  ],
  [
    "password change, foreign Origin, JSON",
    () =>
      request("/api/panel/password", {
        method: "POST",
        json: { current: STAFF_PASSWORD, password: NEW_STAFF_PASSWORD, repeat: NEW_STAFF_PASSWORD },
        cookie: asStaff(sessionA1),
        extraHeaders: FOREIGN,
      }),
  ],
];
const originResults = [];
for (const [name, attempt] of originAttempts) {
  const res = await attempt();
  originResults.push(`${name}: ${String(res.status)}${res.setCookie ? " +cookie" : ""}`);
  if (res.status !== 403 || res.setCookie !== "") {
    check(`staff: Origin refused (${name})`, false, `${res.status} ${res.body.slice(0, 120)}`);
  }
}
check(
  "staff: login, logout and the password change without the page's Origin → 403 without a cookie",
  originResults.every((line) => line.endsWith(": 403")),
  originResults.join("; "),
);
const stillLoggedIn = await me(sessionA1);
const oldPasswordStill = await logIn(staff.ownerA.email, STAFF_PASSWORD);
check(
  "staff: after the refused attempts the session still works and the password is unchanged",
  stillLoggedIn.status === 200 && redirectsTo(oldPasswordStill, "/panel"),
  `${stillLoggedIn.status} ${oldPasswordStill.location}`,
);
const sessionA3 = sessionOf(oldPasswordStill);

// Password change: a wrong current password is refused; a change ends every OTHER session.
const changePassword = (token, current, password, repeat = password) =>
  request("/api/panel/password", { method: "POST", form: { current, password, repeat }, cookie: asStaff(token) });
const wrongCurrent = await changePassword(sessionA1, "nie-to-haslo-1", NEW_STAFF_PASSWORD);
check(
  "staff: a password change with a wrong current password → 303 /panel?blad=obecne#haslo",
  wrongCurrent.status === 303 && wrongCurrent.location === "/panel?blad=obecne#haslo",
  wrongCurrent.location,
);
const changed = await changePassword(sessionA1, STAFF_PASSWORD, NEW_STAFF_PASSWORD);
const meA1AfterChange = await me(sessionA1);
const meA2AfterChange = await me(sessionA2);
const meA3AfterChange = await me(sessionA3);
const oldPassword = await logIn(staff.ownerA.email, STAFF_PASSWORD);
const newPassword = await logIn(staff.ownerA.email, NEW_STAFF_PASSWORD);
check(
  "staff: a password change keeps this session, ends the others, and only the new password logs in",
  redirectsTo(changed, "/panel?haslo=zmienione") &&
    meA1AfterChange.status === 200 &&
    meA2AfterChange.status === 401 &&
    meA3AfterChange.status === 401 &&
    redirectsTo(oldPassword, "/logowanie?blad=dane") &&
    redirectsTo(newPassword, "/panel"),
  [changed.location, meA1AfterChange.status, meA2AfterChange.status, meA3AfterChange.status, oldPassword.location].join(
    " ",
  ),
);
const sessionA4 = sessionOf(newPassword);

// Logout here, then everywhere.
const loggedOut = await request("/api/auth/logout", { method: "POST", form: {}, cookie: asStaff(sessionA1) });
const meAfterLogout = await me(sessionA1);
check(
  "staff: logout → 303 /logowanie?wylogowano=1 with the cookie cleared, the old cookie gets 401",
  redirectsTo(loggedOut, "/logowanie?wylogowano=1") &&
    /kp-session=;[^,]*Max-Age=0/.test(loggedOut.setCookie) &&
    meAfterLogout.status === 401 &&
    (await me(sessionA4)).status === 200,
  `${loggedOut.location} ${meAfterLogout.status}`,
);
const sessionA5 = sessionOf(await logIn(staff.ownerA.email, NEW_STAFF_PASSWORD));
const everywhere = await request("/api/auth/logout", {
  method: "POST",
  form: { wszedzie: "1" },
  cookie: asStaff(sessionA4),
});
const meA4AfterAll = await me(sessionA4);
const meA5AfterAll = await me(sessionA5);
check(
  "staff: logout everywhere ends every session of the person",
  redirectsTo(everywhere, "/logowanie?wylogowano=1") && meA4AfterAll.status === 401 && meA5AfterAll.status === 401,
  `${everywhere.location} ${meA4AfterAll.status} ${meA5AfterAll.status}`,
);

// The guard: own restaurant and event only; everything else is one 404, like a wrong link key.
const sessionOwner = sessionOf(await logIn(staff.ownerA.email, NEW_STAFF_PASSWORD));
const panelGet = (token, path) => request(`/api/panel${path}`, { cookie: asStaff(token) });
const ownRestaurant = await panelGet(sessionOwner, `/restaurants/${String(restaurantA.id)}`);
const ownEvent = await panelGet(sessionOwner, `/events/${String(eventA.id)}`);
check(
  "staff: the owner of A reads restaurant A and event A",
  ownRestaurant.status === 200 &&
    ownRestaurant.data?.restaurant?.id === restaurantA.id &&
    ownRestaurant.data.role === "owner" &&
    ownEvent.status === 200 &&
    ownEvent.data?.event?.id === eventA.id &&
    // Owners and managers hold the event's links since restaurant-events (S-11); the tablet key is the one the
    // orders section put in place with „Wymień link”.
    ownEvent.data.event.links?.organizer === `/o/${organizerKey}` &&
    ownEvent.data.event.links.tv === `/tv/${tvKey}` &&
    ownEvent.data.event.links.restaurant === `/r/${newRestaurantKey}`,
  `${ownRestaurant.status} ${ownEvent.status} ${ownEvent.body.slice(0, 160)}`,
);
const guardDenied = [];
for (const path of [
  `/restaurants/${String(restaurantB.id)}`,
  `/events/${String(eventB.id)}`,
  "/restaurants/2000000000",
  "/events/2000000000",
  "/restaurants/99999999999",
  "/restaurants/abc",
  "/events/abc",
  "/restaurants/-1",
]) {
  const res = await panelGet(sessionOwner, path);
  if (!noAccessJson(res)) {
    guardDenied.push(`${path} ${String(res.status)} ${res.body.slice(0, 60)}`);
  }
}
check(
  "staff: another restaurant's restaurant or event, unknown, huge and malformed ids → the identical 404",
  guardDenied.length === 0,
  guardDenied.join("; "),
);
const waiterRestaurant = await panelGet(sessionWaiter, `/restaurants/${String(restaurantA.id)}`);
const waiterEvent = await panelGet(sessionWaiter, `/events/${String(eventA.id)}`);
check(
  "staff: the waiter of A reads restaurant A (role waiter) but not its event (the identical 404)",
  waiterRestaurant.status === 200 && waiterRestaurant.data?.role === "waiter" && noAccessJson(waiterEvent),
  `${waiterRestaurant.status} ${waiterEvent.status}`,
);
const adminMe = await me(sessionAdmin);
const adminRestaurant = await panelGet(sessionAdmin, `/restaurants/${String(restaurantA.id)}`);
const adminEvent = await panelGet(sessionAdmin, `/events/${String(eventA.id)}`);
check(
  "staff: the platform admin is flagged but opens no restaurant without a membership (the identical 404)",
  adminMe.status === 200 &&
    adminMe.data?.isPlatformAdmin === true &&
    adminMe.data.restaurants?.length === 0 &&
    noAccessJson(adminRestaurant) &&
    noAccessJson(adminEvent),
  `${adminMe.body} ${adminRestaurant.status} ${adminEvent.status}`,
);
const ownerBReadsA = await panelGet(sessionB, `/restaurants/${String(restaurantA.id)}`);
check("staff: the owner of B does not open restaurant A (the identical 404)", noAccessJson(ownerBReadsA));

// Link keys are untouched by a staff session.
const organizerWithSession = await request(`/o/${organizerKey}`, { cookie: asStaff(sessionOwner) });
const garbageWithSession = await request("/o/garbage", { cookie: asStaff(sessionOwner) });
const tvWithSession = await request(`/tv/${tvKey}`, { cookie: asStaff(sessionOwner) });
check(
  "staff: a session cookie changes nothing on the key routes (organizer and TV open, a garbage key is the no-access page)",
  organizerWithSession.status === 200 &&
    organizerWithSession.referrerPolicy === "no-referrer" &&
    tvWithSession.status === 200 &&
    garbageWithSession.status === 404 &&
    garbageWithSession.body.includes(NO_ACCESS_TEXT),
  `${organizerWithSession.status} ${tvWithSession.status} ${garbageWithSession.status}`,
);
const keyAsSession = await request("/api/panel/me", { cookie: asStaff(organizerKey) });
check(
  "staff: an organizer key as a session cookie opens nothing",
  keyAsSession.status === 401,
  String(keyAsSession.status),
);

// 26. Platform panel (platform-restaurants, S-10): only the platform admin lists the restaurants (counters and owners,
// never an event's data), creates one with its owner's one-time invitation, gives an owner a fresh link (invitation
// or password reset), adds owners and switches a restaurant off and on. Other staff get the guard's identical 404,
// no session the identical 401; every mutation needs the page's own Origin. A disabled restaurant opens nothing to its
// staff, while its events' links keep working. Uses the sessions of section 25.
const PLATFORM_API = "/api/panel/platform/restaurants";
const RESET_STAFF_PASSWORD = "smoke-reset-haslo-3";
const HASLO_PATH = /^\/haslo\/([A-Za-z0-9_-]{43})$/;
const platformCall = (token, path = "", options = {}) =>
  request(`${PLATFORM_API}${path}`, { ...(token ? { cookie: asStaff(token) } : {}), ...options });
const idPath = (id) => `/${String(id)}`;
const listedOf = (res) => (Array.isArray(res.data?.restaurants) ? res.data.restaurants : []);
const findListed = (res, id) => listedOf(res).find((restaurant) => restaurant.id === id);
const sortedIds = (rows) =>
  rows
    .map((row) => row.id)
    .sort((a, b) => a - b)
    .join(",");
const isNoAccessPage = (res) => res.status === 404 && res.body.includes(NO_ACCESS_TEXT);
// The panel hub's entry of a restaurant (`<li … data-restaurant-id="<id>">…</li>`).
const hubEntry = (res, id) => {
  const start = res.body.indexOf(`data-restaurant-id="${String(id)}"`);
  return start === -1 ? "" : res.body.slice(start, res.body.indexOf("</li>", start));
};

let dbRestaurants = [];
try {
  dbRestaurants = await listRestaurants(platformEnv);
} catch (error) {
  check(
    "platform: the restaurants are read from the database",
    false,
    error instanceof PlatformError ? error.message : String(error),
  );
}
const adminList = await platformCall(sessionAdmin);
const listedA = findListed(adminList, restaurantA.id);
check(
  "platform: the admin lists every restaurant of the database (no-store), A with 1 event, 2 people and owner A with a password",
  adminList.status === 200 &&
    adminList.cacheControl.includes("no-store") &&
    dbRestaurants.length > 0 &&
    sortedIds(listedOf(adminList)) === sortedIds(dbRestaurants) &&
    listedA?.name === `Restauracja smoke A ${RUN_TAG}` &&
    listedA.disabled === false &&
    listedA.eventCount === 1 &&
    listedA.memberCount === 2 &&
    listedA.owners.length === 1 &&
    listedA.owners[0].email === staff.ownerA.email &&
    listedA.owners[0].accountId === staff.ownerA.id &&
    listedA.owners[0].hasPassword === true,
  `${adminList.status} ${listedOf(adminList).length}/${dbRestaurants.length} ${JSON.stringify(listedA)}`,
);
check(
  "platform: the admin's list carries no event data (event A's name and keys are not in it)",
  adminList.status === 200 &&
    ![EVENT_NAME, organizerKey, tvKey, eventA.restaurantKey].some((secret) => adminList.body.includes(secret)),
);
const platformPage = await request("/panel/platforma", { cookie: asStaff(sessionAdmin) });
const adminHub = await request("/panel", { cookie: asStaff(sessionAdmin) });
check(
  "platform: /panel/platforma opens for the admin with A's name and the auth headers; /panel links to it",
  platformPage.status === 200 &&
    platformPage.body.includes(`Restauracja smoke A ${RUN_TAG}`) &&
    authHeaders(platformPage) &&
    adminHub.status === 200 &&
    adminHub.body.includes('href="/panel/platforma"') &&
    adminHub.body.includes("Panel platformy"),
  `${platformPage.status} ${adminHub.status}`,
);

// Everyone but the admin: the identical 404 (staff) or 401 (no session), and nothing happens.
const platformAttempts = [
  ["list", "", {}],
  ["disable A", idPath(restaurantA.id), { method: "PATCH", json: { disabled: true } }],
  ["add an owner to A", `${idPath(restaurantA.id)}/owners`, { method: "POST", json: { email: staffEmail("intruz") } }],
  ["link for owner A", `${idPath(restaurantA.id)}/owners/${String(staff.ownerA.id)}/link`, { method: "POST" }],
  [
    "create a restaurant",
    "",
    { method: "POST", json: { name: `Restauracja intruza ${RUN_TAG}`, ownerEmail: staffEmail("intruz") } },
  ],
];
const unknownForStaff = await panelGet(sessionOwner, "/restaurants/2000000000");
const platformDenied = [];
for (const [who, token] of [
  ["owner A", sessionOwner],
  ["owner B", sessionB],
  ["waiter A", sessionWaiter],
]) {
  for (const [name, path, options] of platformAttempts) {
    const res = await platformCall(token, path, options);
    if (!noAccessJson(res) || res.body !== unknownForStaff.body) {
      platformDenied.push(`${who}, ${name}: ${String(res.status)} ${res.body.slice(0, 60)}`);
    }
  }
}
check(
  "platform: owners and waiters get the identical 404 of an unknown restaurant on every platform route",
  noAccessJson(unknownForStaff) && platformDenied.length === 0,
  platformDenied.join("; "),
);
const anonymousDenied = [];
for (const [name, path, options] of platformAttempts) {
  const res = await platformCall(null, path, options);
  if (res.status !== 401 || res.body !== meNoCookie.body) {
    anonymousDenied.push(`${name}: ${String(res.status)} ${res.body.slice(0, 60)}`);
  }
}
check(
  "platform: without a session every platform route → the identical 401 of /api/panel/me",
  anonymousDenied.length === 0,
  anonymousDenied.join("; "),
);
const platformPageOwner = await request("/panel/platforma", { cookie: asStaff(sessionOwner) });
const platformPageAnonymous = await request("/panel/platforma");
check(
  "platform: /panel/platforma → the no-access page for an owner, 303 /logowanie without a session",
  isNoAccessPage(platformPageOwner) && redirectsTo(platformPageAnonymous, "/logowanie"),
  `${platformPageOwner.status} ${platformPageAnonymous.status} ${platformPageAnonymous.location}`,
);

// Origin: every platform mutation without the page's own Origin → 403, also for the admin.
const platformOriginResults = [];
for (const [name, path, options] of platformAttempts.filter(([, , options]) => options.method)) {
  for (const [how, extra] of [
    ["no Origin", { noOrigin: true }],
    ["foreign Origin", { extraHeaders: FOREIGN }],
  ]) {
    const res = await platformCall(sessionAdmin, path, { ...options, ...extra });
    if (res.status !== 403) {
      platformOriginResults.push(`${name}, ${how}: ${String(res.status)}`);
    }
  }
}
const listAfterRefusals = await platformCall(sessionAdmin);
check(
  "platform: create, disable, add owner and link without the page's Origin → 403 (admin too), nothing changed",
  platformOriginResults.length === 0 &&
    listedOf(listAfterRefusals).length === listedOf(adminList).length &&
    findListed(listAfterRefusals, restaurantA.id)?.disabled === false &&
    findListed(listAfterRefusals, restaurantA.id)?.owners.length === 1,
  platformOriginResults.join("; "),
);

// Validation and unknown targets (admin).
const platformInvalid = [];
for (const [name, path, options] of [
  ["empty name", "", { method: "POST", json: { name: "", ownerEmail: staffEmail("walidacja") } }],
  ["81-character name", "", { method: "POST", json: { name: "x".repeat(81), ownerEmail: staffEmail("walidacja") } }],
  ["bad e-mail", "", { method: "POST", json: { name: `Walidacja ${RUN_TAG}`, ownerEmail: "nie-email" } }],
  [
    "extra field",
    "",
    { method: "POST", json: { name: `Walidacja ${RUN_TAG}`, ownerEmail: staffEmail("walidacja"), extra: 1 } },
  ],
  ["disabled as text", idPath(restaurantA.id), { method: "PATCH", json: { disabled: "yes" } }],
  ["owner with a bad e-mail", `${idPath(restaurantA.id)}/owners`, { method: "POST", json: { email: "nie-email" } }],
]) {
  const res = await platformCall(sessionAdmin, path, options);
  if (res.status !== 400 || typeof res.data?.error !== "string") {
    platformInvalid.push(`${name}: ${String(res.status)}`);
  }
}
check(
  "platform: an empty or 81-character name, a bad e-mail, an extra field, disabled as text → 400 with a message",
  platformInvalid.length === 0,
  platformInvalid.join("; "),
);
const platformUnknown = [];
for (const [name, path, options] of [
  ["disable unknown", "/2000000000", { method: "PATCH", json: { disabled: true } }],
  ["disable huge", "/99999999999", { method: "PATCH", json: { disabled: true } }],
  ["disable malformed", "/abc", { method: "PATCH", json: { disabled: true } }],
  ["owner of unknown", "/2000000000/owners", { method: "POST", json: { email: staffEmail("walidacja") } }],
  ["link of unknown restaurant", `/2000000000/owners/${String(staff.ownerA.id)}/link`, { method: "POST" }],
  ["link of a waiter", `${idPath(restaurantA.id)}/owners/${String(staff.waiterA.id)}/link`, { method: "POST" }],
  ["link of another's owner", `${idPath(restaurantB.id)}/owners/${String(staff.ownerA.id)}/link`, { method: "POST" }],
  ["link of a malformed account", `${idPath(restaurantA.id)}/owners/abc/link`, { method: "POST" }],
]) {
  const res = await platformCall(sessionAdmin, path, options);
  if (!noAccessJson(res)) {
    platformUnknown.push(`${name}: ${String(res.status)} ${res.body.slice(0, 60)}`);
  }
}
const listAfterInvalid = await platformCall(sessionAdmin);
check(
  "platform: unknown, huge or malformed ids and an account that is not an owner there → the identical 404, nothing created",
  platformUnknown.length === 0 && listedOf(listAfterInvalid).length === listedOf(adminList).length,
  platformUnknown.join("; "),
);

// Flow: a new restaurant with a new owner, the owner's invitation, their empty restaurant panel.
const nameC = `Restauracja smoke C ${RUN_TAG}`;
const emailC = staffEmail("ownerc");
const createdC = await platformCall(sessionAdmin, "", {
  method: "POST",
  json: { name: nameC, ownerEmail: emailC, ownerName: "Smoke ownerC" },
});
const restaurantCId = typeof createdC.data?.restaurantId === "number" ? createdC.data.restaurantId : 2000000001;
const ownerC = createdC.data?.owner ?? null;
const listedC = findListed(createdC, restaurantCId);
check(
  "platform: the admin creates restaurant C with a new owner → 201, the owner's invitation /haslo/<token>, C listed without events",
  createdC.status === 201 &&
    ownerC?.email === emailC &&
    ownerC.created === true &&
    ownerC.hasPassword === false &&
    ownerC.link?.kind === "invite" &&
    HASLO_PATH.test(ownerC.link.path) &&
    listedC?.name === nameC &&
    listedC.disabled === false &&
    listedC.eventCount === 0 &&
    listedC.memberCount === 1 &&
    listedC.owners[0]?.hasPassword === false,
  `${createdC.status} ${createdC.body.slice(0, 200)}`.replace(/\/haslo\/[A-Za-z0-9_-]+/g, "/haslo/<token>"),
);
const firstInviteC = HASLO_PATH.exec(ownerC?.link?.path ?? "")?.[1] ?? "brak";
const newInviteC = await platformCall(
  sessionAdmin,
  `${idPath(restaurantCId)}/owners/${String(ownerC?.accountId)}/link`,
  {
    method: "POST",
  },
);
const inviteCToken = HASLO_PATH.exec(newInviteC.data?.link?.path ?? "")?.[1] ?? "brak";
const firstInvitePage = await request(`/haslo/${firstInviteC}`);
const inviteCPage = await request(`/haslo/${inviteCToken}`);
check(
  "platform: „Nowy link” for an owner without a password → a new invitation; the earlier one stops working",
  newInviteC.status === 200 &&
    newInviteC.data?.link?.kind === "invite" &&
    inviteCToken !== firstInviteC &&
    firstInvitePage.status === 404 &&
    firstInvitePage.body === linkUnknown.body &&
    inviteCPage.status === 200 &&
    inviteCPage.body.includes(emailC),
  `${newInviteC.status} ${newInviteC.data?.link?.kind} ${firstInvitePage.status} ${inviteCPage.status}`,
);
const redeemedC = await redeem(inviteCToken);
const sessionC = sessionOf(redeemedC);
const hubC = await request("/panel", { cookie: asStaff(sessionC) });
const pageC = await request(`/panel/restauracje/${String(restaurantCId)}`, { cookie: asStaff(sessionC) });
check(
  "platform: the owner of C sets the password, /panel links C to its restaurant panel, which shows C and „Właściciel”",
  redirectsTo(redeemedC, "/panel") &&
    sessionC !== null &&
    hubC.status === 200 &&
    hubC.body.includes(nameC) &&
    hubC.body.includes(`href="/panel/restauracje/${String(restaurantCId)}"`) &&
    pageC.status === 200 &&
    pageC.body.includes(nameC) &&
    pageC.body.includes("Właściciel") &&
    authHeaders(pageC),
  `${redeemedC.status} ${hubC.status} ${pageC.status}`,
);
const cReadsC = await panelGet(sessionC, `/restaurants/${String(restaurantCId)}`);
const cReadsA = await panelGet(sessionC, `/restaurants/${String(restaurantA.id)}`);
const cPageA = await request(`/panel/restauracje/${String(restaurantA.id)}`, { cookie: asStaff(sessionC) });
const cPageUnknown = await request("/panel/restauracje/2000000000", { cookie: asStaff(sessionC) });
const cPageMalformed = await request("/panel/restauracje/abc", { cookie: asStaff(sessionC) });
check(
  "platform: the owner of C reads C but restaurant A, an unknown and a malformed id are the identical 404 (API and page)",
  cReadsC.status === 200 &&
    cReadsC.data?.role === "owner" &&
    noAccessJson(cReadsA) &&
    isNoAccessPage(cPageA) &&
    cPageA.body === cPageUnknown.body &&
    cPageA.body === cPageMalformed.body &&
    cPageUnknown.status === 404 &&
    cPageMalformed.status === 404,
  `${cReadsC.status} ${cReadsA.status} ${cPageA.status} ${cPageUnknown.status} ${cPageMalformed.status}`,
);
const listWithC = await platformCall(sessionAdmin);
check(
  "platform: after the invitation the admin sees C's owner with a password",
  findListed(listWithC, restaurantCId)?.owners[0]?.hasPassword === true,
  JSON.stringify(findListed(listWithC, restaurantCId)),
);

// A lost password: „Nowy link” for an owner with a password is a reset link; setting the new password ends their
// sessions and only the new password logs in (US-05).
const resetC = await platformCall(sessionAdmin, `${idPath(restaurantCId)}/owners/${String(ownerC?.accountId)}/link`, {
  method: "POST",
});
const resetCToken = HASLO_PATH.exec(resetC.data?.link?.path ?? "")?.[1] ?? "brak";
const redeemedResetC = await redeem(resetCToken, RESET_STAFF_PASSWORD);
const meCAfterReset = await me(sessionC);
const oldPasswordC = await logIn(emailC, STAFF_PASSWORD);
const newPasswordC = await logIn(emailC, RESET_STAFF_PASSWORD);
check(
  "platform: a reset link for an owner with a password → the old session gets 401 and only the new password logs in",
  resetC.status === 200 &&
    resetC.data?.link?.kind === "reset" &&
    redirectsTo(redeemedResetC, "/panel") &&
    meCAfterReset.status === 401 &&
    redirectsTo(oldPasswordC, "/logowanie?blad=dane") &&
    redirectsTo(newPasswordC, "/panel"),
  `${resetC.status} ${resetC.data?.link?.kind} ${redeemedResetC.status} ${meCAfterReset.status} ${oldPasswordC.location} ${newPasswordC.location}`,
);

// One more owner: an account that already has a password gets no link and sees the restaurant after logging in.
const ownerAToB = await platformCall(sessionAdmin, `${idPath(restaurantB.id)}/owners`, {
  method: "POST",
  json: { email: staff.ownerA.email.toUpperCase() },
});
const meOwnerAWithB = await me(sessionOwner);
check(
  "platform: adding owner A (who has a password) to B → no link, B lists them, and owner A's /api/panel/me shows B",
  ownerAToB.status === 200 &&
    ownerAToB.data?.owner?.link === null &&
    ownerAToB.data.owner.hasPassword === true &&
    ownerAToB.data.owner.created === false &&
    findListed(ownerAToB, restaurantB.id)?.owners.some((owner) => owner.email === staff.ownerA.email) === true &&
    meOwnerAWithB.data?.restaurants?.some(
      (restaurant) => restaurant.id === restaurantB.id && restaurant.role === "owner",
    ) === true,
  `${ownerAToB.status} ${ownerAToB.body.slice(0, 160)}`,
);

// Disable A: its staff open nothing of it at once; its event's links keep working; enable → back.
const disableA = await platformCall(sessionAdmin, idPath(restaurantA.id), {
  method: "PATCH",
  json: { disabled: true },
});
const disabledReads = [];
for (const [who, token] of [
  ["owner A", sessionOwner],
  ["waiter A", sessionWaiter],
]) {
  for (const path of [`/restaurants/${String(restaurantA.id)}`, `/events/${String(eventA.id)}`]) {
    const res = await panelGet(token, path);
    if (!noAccessJson(res)) {
      disabledReads.push(`${who} ${path}: ${String(res.status)}`);
    }
  }
}
const ownerAReadsBWhileAOff = await panelGet(sessionOwner, `/restaurants/${String(restaurantB.id)}`);
const pageAOff = await request(`/panel/restauracje/${String(restaurantA.id)}`, { cookie: asStaff(sessionOwner) });
const hubAOff = await request("/panel", { cookie: asStaff(sessionOwner) });
const meAOff = await me(sessionOwner);
check(
  "platform: the admin disables A → owner A and the waiter get the identical 404 for A and its event, owner A still opens B",
  disableA.status === 200 &&
    findListed(disableA, restaurantA.id)?.disabled === true &&
    disabledReads.length === 0 &&
    ownerAReadsBWhileAOff.status === 200,
  `${disableA.status} ${disabledReads.join("; ")} ${ownerAReadsBWhileAOff.status}`,
);
check(
  "platform: a disabled restaurant's page is the no-access page and /panel marks it „Wyłączona” without a link",
  isNoAccessPage(pageAOff) &&
    pageAOff.body === cPageUnknown.body &&
    hubEntry(hubAOff, restaurantA.id).includes("Wyłączona") &&
    !hubAOff.body.includes(`href="/panel/restauracje/${String(restaurantA.id)}"`) &&
    meAOff.data?.restaurants?.find((restaurant) => restaurant.id === restaurantA.id)?.disabled === true,
  `${pageAOff.status} ${hubEntry(hubAOff, restaurantA.id).length}`,
);
const organizerWhileOff = await request(`/o/${organizerKey}`);
const guestsWhileOff = await request(`/api/o/${organizerKey}/guests`);
check(
  "platform: the event links of a disabled restaurant keep working (organizer page and API)",
  organizerWhileOff.status === 200 && guestsWhileOff.status === 200,
  `${organizerWhileOff.status} ${guestsWhileOff.status}`,
);
const enableA = await platformCall(sessionAdmin, idPath(restaurantA.id), {
  method: "PATCH",
  json: { disabled: false },
});
const ownerAReadsAAgain = await panelGet(sessionOwner, `/restaurants/${String(restaurantA.id)}`);
const pageAOn = await request(`/panel/restauracje/${String(restaurantA.id)}`, { cookie: asStaff(sessionOwner) });
check(
  "platform: enabling A gives its staff access back (API and restaurant page)",
  enableA.status === 200 &&
    findListed(enableA, restaurantA.id)?.disabled === false &&
    ownerAReadsAAgain.status === 200 &&
    pageAOn.status === 200 &&
    pageAOn.body.includes(`Restauracja smoke A ${RUN_TAG}`),
  `${enableA.status} ${ownerAReadsAAgain.status} ${pageAOn.status}`,
);

// 27. Restaurant events (restaurant-events, S-11): owners and managers of a restaurant list its events (upcoming, past,
// archive), create one (it lands on its card with the client, TV and staff tablet links), edit, archive and restore
// it and replace each link (the old one opens nothing at once); only the owner deletes an event, with everything in
// it. A waiter, another restaurant's owner and the platform admin get the identical 404 of an unknown id, no session
// the identical 401, a foreign Origin 403. Every event changed here is created here (never event A or B). Uses the
// sessions of sections 25–26 and a manager of A created here.
const eventsApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/events`;
const eventApi = (id) => `/api/panel/events/${String(id)}`;
const eventPage = (id) => `/panel/wydarzenia/${String(id)}`;
const restaurantPageOf = (id, list = "") => `/panel/restauracje/${String(id)}${list ? `?lista=${list}` : ""}`;
const asSession = (token, options = {}) => ({ ...(token ? { cookie: asStaff(token) } : {}), ...options });
const staffCall = (token, path, options = {}) => request(path, asSession(token, options));
const listIds = (res, list) => (Array.isArray(res.data?.[list]) ? res.data[list].map((event) => event.id) : []);
const keyOfPath = (path) => (typeof path === "string" ? (path.split("/")[2] ?? "") : "");
const LINK_KINDS = ["organizer", "tv", "restaurant"];
const LINK_PREFIX = { organizer: "o", tv: "tv", restaurant: "r" };
const hasFreshLinks = (event) =>
  LINK_KINDS.every((kind) =>
    new RegExp(`^/${LINK_PREFIX[kind]}/${KEY}$`).test(
      typeof event?.links?.[kind] === "string" ? event.links[kind] : "",
    ),
  ) && new Set(LINK_KINDS.map((kind) => keyOfPath(event.links[kind]))).size === 3;
// The restaurant page's row of an event (`<li … data-event-id="<id>">…</li>`).
const eventRow = (res, id) => {
  const start = res.body.indexOf(`data-event-id="${String(id)}"`);
  return start === -1 ? "" : res.body.slice(start, res.body.indexOf("</li>", start));
};
const shiftDate = (date, days) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const RESTAURANT_DENIED_JSON = JSON.stringify({ error: "No access" });
// What a replaced or deleted link answers: the identical denial of its area (page and JSON).
const LINK_ROUTES = {
  organizer: { page: (key) => `/o/${key}`, api: (key) => `/api/o/${key}/guests` },
  tv: { page: (key) => `/tv/${key}`, api: (key) => `/api/tv/${key}/seating` },
  restaurant: { page: (key) => `/r/${key}`, api: (key) => `/api/r/${key}/orders` },
};
const linkDenied = async (kind, key) => {
  const page = await request(LINK_ROUTES[kind].page(key));
  const json = await request(LINK_ROUTES[kind].api(key));
  return (
    page.status === 404 &&
    page.body === (kind === "restaurant" ? restaurantDeniedBody : deniedBody) &&
    (kind === "restaurant" ? json.status === 404 && json.body === RESTAURANT_DENIED_JSON : noAccessJson(json))
  );
};
const linkOpens = async (kind, key) => {
  const page = await request(LINK_ROUTES[kind].page(key));
  const json = await request(LINK_ROUTES[kind].api(key));
  return page.status === 200 && json.status === 200;
};

let sessionManager = null;
try {
  const account = await ensureStaffAccount(platformEnv, {
    email: staffEmail("managera"),
    displayName: "Smoke managerA",
  });
  await addMembership(platformEnv, restaurantA.id, account.id, "manager");
  const invite = await issueStaffLink(platformEnv, account.id, "invite", BASE_URL);
  sessionManager = sessionOf(await redeem(invite.token));
} catch (error) {
  check(
    "events: the manager of A is created in the local database",
    false,
    error instanceof PlatformError ? error.message : String(error),
  );
  finish();
}
check("events: the manager of A has a session", Boolean(sessionManager));

// Lists: event A (created today by section 3) is under upcoming as today; no keys in the list.
const listA = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const today = typeof listA.data?.today === "string" ? listA.data.today : "";
check(
  "events: owner A lists A's events (no-store) — event A today under upcoming, past and archive empty, no keys",
  listA.status === 200 &&
    listA.cacheControl.includes("no-store") &&
    /^\d{4}-\d{2}-\d{2}$/.test(today) &&
    listA.data.upcoming.some((event) => event.id === eventA.id && event.timing === "today") &&
    listIds(listA, "past").length === 0 &&
    listIds(listA, "archived").length === 0 &&
    ![organizerKey, tvKey].some((secret) => listA.body.includes(secret)),
  `${listA.status} ${listA.body.slice(0, 200)}`,
);
if (!today) finish();

// Create: 201 with the card and three fresh links; the card page and the restaurant page show it.
const futureDate = shiftDate(today, 30);
const createIn = (token, json, options = {}) =>
  staffCall(token, eventsApiOf(restaurantA.id), { method: "POST", json, ...options });
const createdFuture = await createIn(sessionOwner, {
  name: `  Wigilia   smoke ${RUN_TAG} `,
  date: futureDate,
  expectedGuests: 80,
});
let party = createdFuture.data?.event;
check(
  "events: owner A creates an event → 201 with its card: normalized name, date, 80 guests, upcoming, three fresh links",
  createdFuture.status === 201 &&
    createdFuture.data.role === "owner" &&
    party?.name === `Wigilia smoke ${RUN_TAG}` &&
    party.date === futureDate &&
    party.expectedGuests === 80 &&
    party.archived === false &&
    party.archivedAt === null &&
    party.timing === "upcoming" &&
    party.guestCount === 0 &&
    party.restaurantId === restaurantA.id &&
    party.restaurantName === `Restauracja smoke A ${RUN_TAG}` &&
    hasFreshLinks(party) &&
    ![organizerKey, tvKey, eventA.restaurantKey].some((key) => createdFuture.body.includes(key)),
  `${createdFuture.status} ${createdFuture.body.slice(0, 200)}`,
);
if (!party || !hasFreshLinks(party)) finish();
const partyCard = await staffCall(sessionOwner, eventApi(party.id));
const partyPage = await staffCall(sessionOwner, eventPage(party.id));
check(
  "events: the card API and the card page (auth headers) show the event and its client link",
  partyCard.status === 200 &&
    JSON.stringify(partyCard.data?.event) === JSON.stringify(party) &&
    partyPage.status === 200 &&
    authHeaders(partyPage) &&
    partyPage.body.includes(`Wigilia smoke ${RUN_TAG}`) &&
    partyPage.body.includes(party.links.organizer) &&
    partyPage.body.includes("Usuń wydarzenie trwale"),
  `${partyCard.status} ${partyPage.status}`,
);
const restaurantEventsPage = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id));
const restaurantPageOddList = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id, "cokolwiek"));
check(
  "events: the restaurant page has the create form and lists the event under „Nadchodzące” (also for an unknown ?lista)",
  restaurantEventsPage.status === 200 &&
    restaurantEventsPage.body.includes("Nowe wydarzenie") &&
    restaurantEventsPage.body.includes('data-event-list="upcoming"') &&
    eventRow(restaurantEventsPage, party.id).includes(`href="${eventPage(party.id)}"`) &&
    eventRow(restaurantEventsPage, eventA.id).includes("Dziś") &&
    eventRow(restaurantPageOddList, party.id) !== "" &&
    !restaurantEventsPage.body.includes(party.links.organizer),
  `${restaurantEventsPage.status} ${restaurantPageOddList.status}`,
);
const partyOrganizer = await request(party.links.organizer);
const partyQuestions = await request(`/api/o/${keyOfPath(party.links.organizer)}/questions`);
check(
  "events: the new client link opens the organizer view with the starter question base (90)",
  partyOrganizer.status === 200 && partyQuestions.status === 200 && partyQuestions.data?.questions?.length === 90,
  `${partyOrganizer.status} ${partyQuestions.status} ${partyQuestions.data?.questions?.length}`,
);
const createdPast = await createIn(sessionOwner, { name: `Urodziny smoke ${RUN_TAG}`, date: shiftDate(today, -10) });
const birthday = createdPast.data?.event;
const listWithPast = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const pastPage = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id, "minione"));
check(
  "events: a past date without a guest count → the past list and ?lista=minione",
  createdPast.status === 201 &&
    birthday?.timing === "past" &&
    birthday.expectedGuests === null &&
    listIds(listWithPast, "past").includes(birthday.id) &&
    !listIds(listWithPast, "upcoming").includes(birthday.id) &&
    listIds(listWithPast, "upcoming").includes(party.id) &&
    pastPage.body.includes('data-event-list="past"') &&
    eventRow(pastPage, birthday.id) !== "" &&
    eventRow(pastPage, party.id) === "",
  `${createdPast.status} ${createdPast.body.slice(0, 160)}`,
);

// Validation: 400 with a message, nothing created or changed.
const invalidCreates = [
  { name: "", date: futureDate },
  { name: "   ", date: futureDate },
  { name: "x".repeat(121), date: futureDate },
  { name: "Zła data", date: "2026-02-30" },
  { name: "Zła data", date: "12.12.2026" },
  { name: "Za mało gości", date: futureDate, expectedGuests: 0 },
  { name: "Za dużo gości", date: futureDate, expectedGuests: 1001 },
  { name: "Ułamek gości", date: futureDate, expectedGuests: 2.5 },
  { name: "Bez daty" },
  { name: "Dodatkowe pole", date: futureDate, restaurantId: restaurantB.id },
];
const createProblems = [];
for (const json of invalidCreates) {
  const res = await createIn(sessionOwner, json);
  if (res.status !== 400 || typeof res.data?.error !== "string") {
    createProblems.push(`${JSON.stringify(json).slice(0, 40)} ${String(res.status)}`);
  }
}
const tooLongEvent = await createIn(sessionOwner, { name: "x".repeat(121), date: futureDate });
const listAfterInvalidEvents = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
check(
  "events: invalid new events → 400 with a message (the 121-character name names the limit), nothing created",
  createProblems.length === 0 &&
    tooLongEvent.data?.error?.includes("120") === true &&
    JSON.stringify(listAfterInvalidEvents.data) === JSON.stringify(listWithPast.data),
  createProblems.join("; "),
);
const invalidPatches = [{}, { name: "" }, { date: "2026-13-01" }, { expectedGuests: 0 }, { archived: "tak" }, { x: 1 }];
const patchProblems = [];
for (const json of invalidPatches) {
  const res = await staffCall(sessionOwner, eventApi(party.id), { method: "PATCH", json });
  if (res.status !== 400 || typeof res.data?.error !== "string") {
    patchProblems.push(`${JSON.stringify(json)} ${String(res.status)}`);
  }
}
const partyAfterInvalid = await staffCall(sessionOwner, eventApi(party.id));
check(
  "events: invalid edits (empty, bad fields, unknown field) → 400 with a message, the card unchanged",
  patchProblems.length === 0 && JSON.stringify(partyAfterInvalid.data?.event) === JSON.stringify(party),
  patchProblems.join("; "),
);

// Edit.
const editedEvent = await staffCall(sessionOwner, eventApi(party.id), {
  method: "PATCH",
  json: { name: `Wigilia firmowa smoke ${RUN_TAG}`, date: shiftDate(today, 32), expectedGuests: 90 },
});
const guestsCleared = await staffCall(sessionOwner, eventApi(party.id), {
  method: "PATCH",
  json: { expectedGuests: null },
});
check(
  "events: editing the name, date and guest count (then clearing it) → the card answers with the new values, links kept",
  editedEvent.status === 200 &&
    editedEvent.data?.event?.name === `Wigilia firmowa smoke ${RUN_TAG}` &&
    editedEvent.data.event.date === shiftDate(today, 32) &&
    editedEvent.data.event.expectedGuests === 90 &&
    guestsCleared.status === 200 &&
    guestsCleared.data?.event?.expectedGuests === null &&
    guestsCleared.data.event.name === `Wigilia firmowa smoke ${RUN_TAG}` &&
    JSON.stringify(guestsCleared.data.event.links) === JSON.stringify(party.links),
  `${editedEvent.status} ${guestsCleared.status}`,
);
party = guestsCleared.data?.event ?? party;

// Replace each link: a fresh key, the other two unchanged, the old link dead at once (page and API), the new one open.
for (const kind of LINK_KINDS) {
  const oldKey = keyOfPath(party.links[kind]);
  const openedBefore = await linkOpens(kind, oldKey);
  const rotated = await staffCall(sessionOwner, `${eventApi(party.id)}/links/${kind}`, { method: "POST" });
  const next = rotated.data?.event;
  const newKey = keyOfPath(next?.links?.[kind]);
  const othersKept = LINK_KINDS.filter((other) => other !== kind).every(
    (other) => next?.links?.[other] === party.links[other],
  );
  const oldDenied = await linkDenied(kind, oldKey);
  const newOpens = await linkOpens(kind, newKey);
  check(
    `events: replacing the ${kind} link → a new key, the other links kept; the old page and API get the identical 404, the new ones open`,
    openedBefore &&
      rotated.status === 200 &&
      new RegExp(`^${KEY}$`).test(newKey) &&
      newKey !== oldKey &&
      othersKept &&
      oldDenied &&
      newOpens,
    `${String(openedBefore)} ${rotated.status} ${String(othersKept)} ${String(oldDenied)} ${String(newOpens)}`,
  );
  party = next ?? party;
}
const guestKind = await staffCall(sessionOwner, `${eventApi(party.id)}/links/guest`, { method: "POST" });
const oddKind = await staffCall(sessionOwner, `${eventApi(party.id)}/links/organizer-key`, { method: "POST" });
const partyAfterKinds = await staffCall(sessionOwner, eventApi(party.id));
check(
  "events: any other link kind (guests' links are the client's) → the identical 404, nothing replaced",
  noAccessJson(guestKind) &&
    noAccessJson(oddKind) &&
    JSON.stringify(partyAfterKinds.data?.event) === JSON.stringify(party),
  `${guestKind.status} ${oddKind.status}`,
);

// Archive and restore: the event moves between the lists; its links keep working.
const archivedParty = await staffCall(sessionOwner, eventApi(party.id), { method: "PATCH", json: { archived: true } });
const listArchived = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const archivePage = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id, "archiwum"));
const clientWhileArchived = await linkOpens("organizer", keyOfPath(party.links.organizer));
const tvWhileArchived = await linkOpens("tv", keyOfPath(party.links.tv));
const tabletWhileArchived = await linkOpens("restaurant", keyOfPath(party.links.restaurant));
check(
  "events: archiving → only in the archive (also ?lista=archiwum), the client, TV and tablet links keep working",
  archivedParty.status === 200 &&
    archivedParty.data?.event?.archived === true &&
    typeof archivedParty.data.event.archivedAt === "string" &&
    listIds(listArchived, "archived").includes(party.id) &&
    !listIds(listArchived, "upcoming").includes(party.id) &&
    eventRow(archivePage, party.id) !== "" &&
    clientWhileArchived &&
    tvWhileArchived &&
    tabletWhileArchived,
  `${archivedParty.status} ${String(clientWhileArchived)} ${String(tvWhileArchived)} ${String(tabletWhileArchived)}`,
);
const restoredParty = await staffCall(sessionOwner, eventApi(party.id), { method: "PATCH", json: { archived: false } });
const listRestored = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
check(
  "events: restoring → back under upcoming, archive mark cleared",
  restoredParty.status === 200 &&
    restoredParty.data?.event?.archived === false &&
    restoredParty.data.event.archivedAt === null &&
    listIds(listRestored, "upcoming").includes(party.id) &&
    !listIds(listRestored, "archived").includes(party.id),
  `${restoredParty.status}`,
);
party = restoredParty.data?.event ?? party;

// The manager of A: everything but the permanent delete.
const managerList = await staffCall(sessionManager, eventsApiOf(restaurantA.id));
const managerCreated = await createIn(sessionManager, { name: `Komunia smoke ${RUN_TAG}`, date: shiftDate(today, 60) });
const communion = managerCreated.data?.event;
const managerRotated = communion
  ? await staffCall(sessionManager, `${eventApi(communion.id)}/links/tv`, { method: "POST" })
  : null;
const managerArchived = communion
  ? await staffCall(sessionManager, eventApi(communion.id), { method: "PATCH", json: { archived: true } })
  : null;
const managerDelete = communion ? await staffCall(sessionManager, eventApi(communion.id), { method: "DELETE" }) : null;
const communionAfter = communion ? await staffCall(sessionOwner, eventApi(communion.id)) : null;
const managerPage = communion ? await staffCall(sessionManager, eventPage(communion.id)) : null;
check(
  "events: the manager of A lists, creates, replaces a link and archives, but DELETE → the identical 404 and the event stays",
  managerList.status === 200 &&
    listIds(managerList, "upcoming").includes(party.id) &&
    managerCreated.status === 201 &&
    managerCreated.data?.role === "manager" &&
    managerRotated?.status === 200 &&
    managerRotated.data?.event?.links?.tv !== communion?.links?.tv &&
    managerArchived?.status === 200 &&
    managerArchived.data?.event?.archived === true &&
    noAccessJson(managerDelete) &&
    communionAfter?.status === 200 &&
    communionAfter.data?.event?.archived === true,
  `${managerList.status} ${managerCreated.status} ${managerRotated?.status} ${managerArchived?.status} ${managerDelete?.status} ${communionAfter?.status}`,
);
check(
  "events: the manager's card page has the links but no permanent delete",
  managerPage?.status === 200 &&
    managerPage.body.includes(`Komunia smoke ${RUN_TAG}`) &&
    !managerPage.body.includes("Usuń wydarzenie trwale"),
  String(managerPage?.status),
);

// Waiter A, owner B and the platform admin: the identical 404 of an unknown id, and nothing changes.
const outsiderAttempts = (id) => [
  ["list A", eventsApiOf(restaurantA.id), {}],
  ["create in A", eventsApiOf(restaurantA.id), { method: "POST", json: { name: "Intruz", date: futureDate } }],
  ["card", eventApi(id), {}],
  ["edit", eventApi(id), { method: "PATCH", json: { name: "Intruz" } }],
  ["archive", eventApi(id), { method: "PATCH", json: { archived: true } }],
  ["replace the client link", `${eventApi(id)}/links/organizer`, { method: "POST" }],
  ["delete", eventApi(id), { method: "DELETE" }],
];
const listBeforeOutsiders = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const outsiderDenied = [];
const unknownPageOf = {};
for (const [who, token] of [
  ["waiter A", sessionWaiter],
  ["owner B", sessionB],
  ["admin", sessionAdmin],
]) {
  for (const [name, path, options] of outsiderAttempts(party.id)) {
    const res = await staffCall(token, path, options);
    if (!noAccessJson(res)) {
      outsiderDenied.push(`${who} ${name}: ${String(res.status)}`);
    }
  }
  const unknown = await staffCall(token, eventApi(2_000_000_000));
  if (!noAccessJson(unknown)) {
    outsiderDenied.push(`${who} unknown id: ${String(unknown.status)}`);
  }
  const page = await staffCall(token, eventPage(party.id));
  const unknownPage = await staffCall(token, eventPage(2_000_000_000));
  unknownPageOf[who] = unknownPage.body;
  if (!isNoAccessPage(page) || page.body !== unknownPage.body || page.body.includes(party.links.organizer)) {
    outsiderDenied.push(`${who} card page: ${String(page.status)}`);
  }
}
const listAfterOutsiders = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const partyAfterOutsiders = await staffCall(sessionOwner, eventApi(party.id));
check(
  "events: waiter A, owner B and the admin get the identical 404 (API and card page) for A's events, nothing changes",
  outsiderDenied.length === 0 &&
    JSON.stringify(partyAfterOutsiders.data?.event) === JSON.stringify(party) &&
    JSON.stringify(listAfterOutsiders.data) === JSON.stringify(listBeforeOutsiders.data) &&
    unknownPageOf["waiter A"] === unknownPageOf["owner B"],
  outsiderDenied.join("; "),
);
const waiterRestaurantPage = await staffCall(sessionWaiter, restaurantPageOf(restaurantA.id));
check(
  "events: the waiter's restaurant page shows no events, no create form and no links, only the note",
  waiterRestaurantPage.status === 200 &&
    waiterRestaurantPage.body.includes("Dzisiejsze wydarzenia dla kelnerów") &&
    !waiterRestaurantPage.body.includes("Nowe wydarzenie") &&
    !waiterRestaurantPage.body.includes("data-event-id") &&
    !waiterRestaurantPage.body.includes(party.name),
  String(waiterRestaurantPage.status),
);
const malformedDenied = [];
for (const path of [
  eventApi("abc"),
  eventApi("99999999999"),
  eventApi("-1"),
  eventApi("1.5"),
  eventsApiOf("abc"),
  eventsApiOf("99999999999"),
  eventsApiOf(2_000_000_000),
]) {
  const res = await staffCall(sessionOwner, path);
  if (!noAccessJson(res)) {
    malformedDenied.push(`${path} ${String(res.status)}`);
  }
}
for (const id of [2_000_000_000, "abc"]) {
  const res = await staffCall(sessionOwner, `${eventApi(id)}/links/organizer`, { method: "POST" });
  if (!noAccessJson(res)) {
    malformedDenied.push(`POST ${eventApi(id)}/links/organizer ${String(res.status)}`);
  }
}
const ownerUnknownPage = await staffCall(sessionOwner, eventPage(2_000_000_000));
for (const id of ["abc", "99999999999", "-1"]) {
  const page = await staffCall(sessionOwner, eventPage(id));
  if (!isNoAccessPage(page) || page.body !== ownerUnknownPage.body) {
    malformedDenied.push(`${eventPage(id)} ${String(page.status)}`);
  }
}
check(
  "events: unknown, huge and malformed ids → the identical 404 (API and card page)",
  malformedDenied.length === 0 && isNoAccessPage(ownerUnknownPage),
  malformedDenied.join("; "),
);

// No session: the identical 401 of /api/panel/me; the card page sends to the login page.
const noSessionDenied = [];
for (const [name, path, options] of outsiderAttempts(party.id)) {
  const res = await staffCall(null, path, options);
  if (res.status !== 401 || res.body !== meNoCookie.body) {
    noSessionDenied.push(`${name}: ${String(res.status)}`);
  }
}
const cardPageNoSession = await request(eventPage(party.id));
check(
  "events: without a session every event route → the identical 401 and the card page → 303 to /logowanie",
  noSessionDenied.length === 0 && redirectsTo(cardPageNoSession, "/logowanie"),
  `${noSessionDenied.join("; ")} ${cardPageNoSession.status} ${cardPageNoSession.location}`,
);

// Origin: a mutation without the page's own Origin → 403, nothing changes.
const originRefused = [];
for (const [name, path, options] of outsiderAttempts(party.id).filter(([, , options]) => options.method)) {
  for (const variant of [{ noOrigin: true }, { extraHeaders: { Origin: "https://evil.example" } }]) {
    const res = await staffCall(sessionOwner, path, { ...options, ...variant });
    if (res.status !== 403) {
      originRefused.push(`${name} ${variant.noOrigin ? "no Origin" : "foreign"}: ${String(res.status)}`);
    }
  }
}
const partyAfterOrigin = await staffCall(sessionOwner, eventApi(party.id));
const listAfterOrigin = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
check(
  "events: create, edit, archive, replace and delete without the page's Origin → 403, nothing changes",
  originRefused.length === 0 &&
    JSON.stringify(partyAfterOrigin.data?.event) === JSON.stringify(party) &&
    JSON.stringify(listAfterOrigin.data) === JSON.stringify(listBeforeOutsiders.data),
  originRefused.join("; "),
);

// Delete (owner): the event goes with its guest, and every link of it (client, TV, tablet, the guest's) dies at once.
// Event A and event B read the same as before.
const aGuestsBeforeDelete = (await request(`/api/o/${organizerKey}/guests`)).body;
const bBeforeDelete = await readB();
const createdDoomed = await createIn(sessionOwner, { name: `Do usunięcia smoke ${RUN_TAG}`, date: futureDate });
const doomed = createdDoomed.data?.event;
const doomedKey = keyOfPath(doomed?.links?.organizer);
await request(`/api/o/${doomedKey}/guests`, { method: "POST", json: { text: "Gość do usunięcia" } });
await request(`/api/o/${doomedKey}/guest-links`, { method: "PATCH", json: { enabled: true } });
const doomedGuestKey = (await request(`/api/o/${doomedKey}/guest-links`)).data?.guests?.[0]?.key ?? "brak";
const doomedGuestBefore = await request(`/api/g/${doomedGuestKey}/state`);
const doomedCardBefore = await staffCall(sessionOwner, eventApi(doomed?.id ?? 0));
const eventDeleted = await staffCall(sessionOwner, eventApi(doomed?.id ?? 0), { method: "DELETE" });
const doomedCardAfter = await staffCall(sessionOwner, eventApi(doomed?.id ?? 0));
const doomedPageAfter = await staffCall(sessionOwner, eventPage(doomed?.id ?? 0));
const eventDeletedAgain = await staffCall(sessionOwner, eventApi(doomed?.id ?? 0), { method: "DELETE" });
const listAfterDelete = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const doomedLinksDead = doomed
  ? (await Promise.all(LINK_KINDS.map((kind) => linkDenied(kind, keyOfPath(doomed.links[kind]))))).every(Boolean)
  : false;
const doomedGuestAfter = await request(`/api/g/${doomedGuestKey}/state`);
const doomedGuestPage = await request(`/g/${doomedGuestKey}`);
check(
  "events: the owner deletes an event with a guest → 200; card, page and list gone; client, TV, tablet and guest links → the identical 404",
  createdDoomed.status === 201 &&
    doomedCardBefore.data?.event?.guestCount === 1 &&
    doomedGuestBefore.status === 200 &&
    eventDeleted.status === 200 &&
    eventDeleted.data?.deleted === true &&
    eventDeleted.data.restaurantId === restaurantA.id &&
    noAccessJson(doomedCardAfter) &&
    isNoAccessPage(doomedPageAfter) &&
    doomedPageAfter.body === ownerUnknownPage.body &&
    noAccessJson(eventDeletedAgain) &&
    ![...listIds(listAfterDelete, "upcoming"), ...listIds(listAfterDelete, "past")].includes(doomed?.id) &&
    doomedLinksDead &&
    noAccessJson(doomedGuestAfter) &&
    doomedGuestPage.status === 404 &&
    doomedGuestPage.body === deniedBody,
  `${createdDoomed.status} ${doomedGuestBefore.status} ${eventDeleted.status} ${doomedCardAfter.status} ${String(doomedLinksDead)} ${doomedGuestAfter.status}`,
);
const aGuestsAfterDelete = (await request(`/api/o/${organizerKey}/guests`)).body;
const bAfterDelete = await readB();
check(
  "events: deleting an event leaves event A and event B as they were",
  aGuestsAfterDelete === aGuestsBeforeDelete && JSON.stringify(bAfterDelete) === JSON.stringify(bBeforeDelete),
);

// 28. Restaurant team (restaurant-team, S-12): owners invite managers and waiters, managers invite waiters, with
// one-time links handed over by a person (no e-mail); within their scope they change roles, remove people and give a
// fresh link (an invitation without a password, else a password reset). The last owner is never demoted or removed. A
// removed person loses this restaurant at once, their other restaurants stay. A link sets the ACCOUNT's password, so
// a team never gives one to an account of another restaurant (409), and a team's unused link dies when the account
// joins a second restaurant. Outsiders get the identical 404 of an unknown restaurant, no session the identical 401, a
// foreign Origin 403. Accounts of this section are created only through the team API; uses the sessions of 25–27.
const TEAM_PASSWORD = "smoke-zespol-1";
const NEW_TEAM_PASSWORD = "smoke-zespol-nowe-2";
const HOUR_MS = 60 * 60 * 1000;
const teamApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/team`;
const memberApiOf = (accountId, restaurantId = restaurantA.id) => `${teamApiOf(restaurantId)}/${String(accountId)}`;
const teamOf = (res) => (Array.isArray(res.data?.team?.members) ? res.data.team : null);
const memberIn = (res, email) => teamOf(res)?.members.find((member) => member.email === email) ?? null;
const readTeamA = (token = sessionOwner) => staffCall(token, teamApiOf(restaurantA.id));
const inviteInto = (token, json, restaurantId = restaurantA.id, options = {}) =>
  staffCall(token, teamApiOf(restaurantId), { method: "POST", json, ...options });
const setRoleOf = (token, accountId, role, restaurantId = restaurantA.id) =>
  staffCall(token, memberApiOf(accountId, restaurantId), { method: "PATCH", json: { role } });
const removeOf = (token, accountId, restaurantId = restaurantA.id) =>
  staffCall(token, memberApiOf(accountId, restaurantId), { method: "DELETE" });
const memberLinkOf = (token, accountId, restaurantId = restaurantA.id) =>
  staffCall(token, `${memberApiOf(accountId, restaurantId)}/link`, { method: "POST" });
const linkToken = (link) => HASLO_PATH.exec(typeof link?.path === "string" ? link.path : "")?.[1] ?? "brak";
const expiresAbout = (link, ms) => {
  const left = Date.parse(typeof link?.expiresAt === "string" ? link.expiresAt : "") - Date.now();
  return Number.isFinite(left) && Math.abs(left - ms) < 10 * 60 * 1000;
};
const MEMBER_FIELDS = "accountId,displayName,email,hasPassword,role";
const managerAEmail = staffEmail("managera");

// Reading the team: owners and managers, the whole team with account ids and nothing secret.
const teamStart = await readTeamA();
const managerAId = memberIn(teamStart, managerAEmail)?.accountId ?? 2_000_000_002;
check(
  "team: owner A reads A's team (no-store) — owner A, manager A, waiter A with ids and roles, nothing secret",
  teamStart.status === 200 &&
    teamStart.cacheControl.includes("no-store") &&
    teamOf(teamStart)?.restaurantId === restaurantA.id &&
    teamOf(teamStart).you.accountId === staff.ownerA.id &&
    teamOf(teamStart).you.role === "owner" &&
    teamOf(teamStart).members.length === 3 &&
    memberIn(teamStart, staff.ownerA.email)?.role === "owner" &&
    memberIn(teamStart, staff.ownerA.email).accountId === staff.ownerA.id &&
    memberIn(teamStart, staff.waiterA.email)?.role === "waiter" &&
    memberIn(teamStart, managerAEmail)?.role === "manager" &&
    teamOf(teamStart).members.every(
      (member) => Object.keys(member).sort().join(",") === MEMBER_FIELDS && member.hasPassword === true,
    ) &&
    !/hash|token|session/i.test(teamStart.body),
  `${teamStart.status} ${teamStart.body.slice(0, 200)}`,
);
const teamByManager = await readTeamA(sessionManager);
check(
  "team: manager A reads the same team as a manager",
  teamByManager.status === 200 &&
    teamOf(teamByManager)?.you.role === "manager" &&
    teamOf(teamByManager).you.accountId === managerAId &&
    JSON.stringify(teamOf(teamByManager).members) === JSON.stringify(teamOf(teamStart)?.members),
  `${teamByManager.status} ${teamByManager.body.slice(0, 160)}`,
);
const ownerTeamPage = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id));
const managerTeamPage = await staffCall(sessionManager, restaurantPageOf(restaurantA.id));
const waiterTeamPage = await staffCall(sessionWaiter, restaurantPageOf(restaurantA.id));
check(
  "team: the restaurant page shows „Zespół” with the invitation form and the e-mails to the owner and the manager, nothing to the waiter",
  [ownerTeamPage, managerTeamPage].every(
    (page) =>
      page.status === 200 &&
      page.body.includes("data-team-section") &&
      page.body.includes("Zaproś do zespołu") &&
      page.body.includes(staff.waiterA.email) &&
      page.body.includes(managerAEmail) &&
      page.body.includes(staff.ownerA.email),
  ) &&
    waiterTeamPage.status === 200 &&
    !waiterTeamPage.body.includes("data-team-section") &&
    !waiterTeamPage.body.includes(staff.ownerA.email) &&
    !waiterTeamPage.body.includes(managerAEmail),
  `${ownerTeamPage.status} ${managerTeamPage.status} ${waiterTeamPage.status}`,
);

// Invitations: 7-day one-time links that open and set the password; the new people see A with their roles.
const mgrEmail = staffEmail("teammgr");
const w1Email = staffEmail("teamw1");
const w2Email = staffEmail("teamw2");
const pendEmail = staffEmail("teampend");
const invitedMgr = await inviteInto(sessionOwner, { email: mgrEmail, name: "  Smoke   teamMgr ", role: "manager" });
const invitedW1 = await inviteInto(sessionOwner, { email: `  ${w1Email.toUpperCase()} `, role: "waiter" });
const freshInvite = (res, email, role) =>
  res.status === 201 &&
  res.data?.invited?.email === email &&
  res.data.invited.role === role &&
  res.data.invited.created === true &&
  res.data.invited.hasPassword === false &&
  res.data.invited.link?.kind === "invite" &&
  HASLO_PATH.test(res.data.invited.link.path) &&
  expiresAbout(res.data.invited.link, 7 * 24 * HOUR_MS) &&
  memberIn(res, email)?.role === role &&
  memberIn(res, email).hasPassword === false &&
  memberIn(res, email).accountId === res.data.invited.accountId;
check(
  "team: owner A invites a manager and a waiter (e-mail normalized) → 201, each with a 7-day invitation /haslo/<token>",
  freshInvite(invitedMgr, mgrEmail, "manager") &&
    memberIn(invitedMgr, mgrEmail)?.displayName === "Smoke teamMgr" &&
    freshInvite(invitedW1, w1Email, "waiter") &&
    memberIn(invitedW1, w1Email)?.displayName === null,
  `${invitedMgr.status} ${invitedW1.status} ${invitedW1.body.slice(0, 200)}`.replace(
    /\/haslo\/[A-Za-z0-9_-]+/g,
    "/haslo/<token>",
  ),
);
const mgrId = invitedMgr.data?.invited?.accountId ?? 2_000_000_003;
const w1Id = invitedW1.data?.invited?.accountId ?? 2_000_000_004;
const mgrInvitePage = await request(`/haslo/${linkToken(invitedMgr.data?.invited?.link)}`);
const redeemedMgr = await redeem(linkToken(invitedMgr.data?.invited?.link), TEAM_PASSWORD);
const redeemedW1 = await redeem(linkToken(invitedW1.data?.invited?.link), TEAM_PASSWORD);
const sessionMgr = sessionOf(redeemedMgr);
const sessionW1 = sessionOf(redeemedW1);
const mgrReadsA = await panelGet(sessionMgr, `/restaurants/${String(restaurantA.id)}`);
const w1ReadsA = await panelGet(sessionW1, `/restaurants/${String(restaurantA.id)}`);
const w1ReadsTeam = await readTeamA(sessionW1);
check(
  "team: the invitations open with the e-mail and set the password; the manager opens A as a manager, the waiter as a waiter without the team",
  mgrInvitePage.status === 200 &&
    mgrInvitePage.body.includes(mgrEmail) &&
    redirectsTo(redeemedMgr, "/panel") &&
    redirectsTo(redeemedW1, "/panel") &&
    mgrReadsA.status === 200 &&
    mgrReadsA.data?.role === "manager" &&
    w1ReadsA.status === 200 &&
    w1ReadsA.data?.role === "waiter" &&
    noAccessJson(w1ReadsTeam),
  `${mgrInvitePage.status} ${redeemedMgr.status} ${mgrReadsA.status} ${w1ReadsA.status} ${w1ReadsTeam.status}`,
);

// A manager invites waiters only; anything else is the identical 404 and nothing joins.
const invitedW2 = await inviteInto(sessionManager, { email: w2Email, role: "waiter" });
const teamBeforeRefusals = await readTeamA();
const scopeRefused = [];
for (const [who, token, role] of [
  ["manager A as a manager", sessionManager, "manager"],
  ["manager A as an owner", sessionManager, "owner"],
  ["owner A as an owner", sessionOwner, "owner"],
]) {
  const res = await inviteInto(token, { email: staffEmail("poza-zakresem"), role });
  if (!noAccessJson(res)) {
    scopeRefused.push(`${who}: ${String(res.status)} ${res.body.slice(0, 60)}`);
  }
}
const teamAfterRefusals = await readTeamA();
check(
  "team: manager A invites a waiter (201, invitation); inviting a manager or an owner (also owner A an owner) → the identical 404, nobody joins",
  freshInvite(invitedW2, w2Email, "waiter") &&
    invitedW2.data.team?.you.role === "manager" &&
    scopeRefused.length === 0 &&
    JSON.stringify(teamOf(teamAfterRefusals)?.members) === JSON.stringify(teamOf(teamBeforeRefusals)?.members),
  scopeRefused.join("; "),
);
const w2Id = invitedW2.data?.invited?.accountId ?? 2_000_000_005;
const teamInvalid = [];
for (const [name, json] of [
  ["bad e-mail", { email: "nie-email", role: "waiter" }],
  ["81-character name", { email: staffEmail("walidacja-zespolu"), name: "x".repeat(81), role: "waiter" }],
  ["unknown role", { email: staffEmail("walidacja-zespolu"), role: "szef" }],
  ["no role", { email: staffEmail("walidacja-zespolu") }],
  ["extra field", { email: staffEmail("walidacja-zespolu"), role: "waiter", restaurantId: restaurantB.id }],
]) {
  const res = await inviteInto(sessionOwner, json);
  if (res.status !== 400 || typeof res.data?.error !== "string") {
    teamInvalid.push(`${name}: ${String(res.status)}`);
  }
}
const roleInvalid = await staffCall(sessionOwner, memberApiOf(w1Id), { method: "PATCH", json: { role: "szef" } });
const roleExtra = await staffCall(sessionOwner, memberApiOf(w1Id), {
  method: "PATCH",
  json: { role: "waiter", restaurantId: restaurantB.id },
});
const alreadyIn = await inviteInto(sessionOwner, { email: w1Email, role: "manager" });
check(
  "team: a bad e-mail, an 81-character name, an unknown or missing role, an extra field → 400; a member again → 409",
  teamInvalid.length === 0 &&
    roleInvalid.status === 400 &&
    roleExtra.status === 400 &&
    alreadyIn.status === 409 &&
    alreadyIn.data?.error === "Ta osoba już jest w zespole. Jej rolę zmienisz na liście.",
  `${teamInvalid.join("; ")} ${roleInvalid.status} ${roleExtra.status} ${alreadyIn.status}`,
);

// Role changes by the owner, also making someone an owner; a promoted owner may step down while another owner stays.
const w1ToManager = await setRoleOf(sessionOwner, w1Id, "manager");
const w1ToWaiter = await setRoleOf(sessionOwner, w1Id, "waiter");
const w1Same = await setRoleOf(sessionOwner, w1Id, "waiter");
const mgrToOwner = await setRoleOf(sessionOwner, mgrId, "owner");
const mgrStepsDown = await setRoleOf(sessionMgr, mgrId, "manager");
check(
  "team: owner A makes the waiter a manager and back, the manager an owner; the new owner steps down to manager (their team as a manager)",
  w1ToManager.status === 200 &&
    memberIn(w1ToManager, w1Email)?.role === "manager" &&
    w1ToWaiter.status === 200 &&
    memberIn(w1ToWaiter, w1Email)?.role === "waiter" &&
    w1Same.status === 200 &&
    mgrToOwner.status === 200 &&
    memberIn(mgrToOwner, mgrEmail)?.role === "owner" &&
    teamOf(mgrToOwner).members.filter((member) => member.role === "owner").length === 2 &&
    mgrStepsDown.status === 200 &&
    teamOf(mgrStepsDown)?.you.role === "manager" &&
    memberIn(mgrStepsDown, mgrEmail)?.role === "manager",
  [w1ToManager, w1ToWaiter, w1Same, mgrToOwner, mgrStepsDown].map((res) => res.status).join(" "),
);
const lastOwnerDemote = await setRoleOf(sessionOwner, staff.ownerA.id, "manager");
const lastOwnerRemove = await removeOf(sessionOwner, staff.ownerA.id);
const ownerStill = await readTeamA();
check(
  "team: the only owner demoting or removing themself → 409 with the message, still the owner",
  lastOwnerDemote.status === 409 &&
    lastOwnerDemote.data?.error ===
      "Restauracja musi mieć co najmniej jednego właściciela. Najpierw nadaj rolę właściciela komuś innemu." &&
    lastOwnerRemove.status === 409 &&
    lastOwnerRemove.body === lastOwnerDemote.body &&
    teamOf(ownerStill)?.you.role === "owner" &&
    memberIn(ownerStill, staff.ownerA.email)?.role === "owner",
  `${lastOwnerDemote.status} ${lastOwnerRemove.status} ${lastOwnerDemote.body}`,
);

// A manager's scope: waiters only. Managers, owners and themself are the identical 404.
const managerScope = [];
for (const [whom, accountId] of [
  ["the new manager", mgrId],
  ["owner A", staff.ownerA.id],
  ["themself", managerAId],
]) {
  for (const [what, call] of [
    ["role", () => setRoleOf(sessionManager, accountId, "waiter")],
    ["remove", () => removeOf(sessionManager, accountId)],
    ["link", () => memberLinkOf(sessionManager, accountId)],
  ]) {
    const res = await call();
    if (!noAccessJson(res)) {
      managerScope.push(`${whom} ${what}: ${String(res.status)}`);
    }
  }
}
const managerPromotes = await setRoleOf(sessionManager, w1Id, "manager");
const teamAfterManagerScope = await readTeamA();
check(
  "team: manager A on a manager, on owner A, on themself (role, remove, link) and making a waiter a manager → the identical 404, nothing changed",
  managerScope.length === 0 &&
    noAccessJson(managerPromotes) &&
    JSON.stringify(teamOf(teamAfterManagerScope)?.members) === JSON.stringify(teamOf(mgrStepsDown)?.members),
  managerScope.join("; "),
);
const managerResetW1 = await memberLinkOf(sessionManager, w1Id);
const managerRemovesW2 = await removeOf(sessionManager, w2Id);
const w2InvitePage = await request(`/haslo/${linkToken(invitedW2.data?.invited?.link)}`);
check(
  "team: manager A gives a waiter with a password a 24-hour reset link, removes a waiter who never set one → their invitation is the invalid-link page",
  managerResetW1.status === 200 &&
    managerResetW1.data?.link?.kind === "reset" &&
    expiresAbout(managerResetW1.data.link, 24 * HOUR_MS) &&
    managerRemovesW2.status === 200 &&
    memberIn(managerRemovesW2, w2Email) === null &&
    w2InvitePage.status === 404 &&
    w2InvitePage.body === linkUnknown.body,
  `${managerResetW1.status} ${managerResetW1.data?.link?.kind} ${managerRemovesW2.status} ${w2InvitePage.status}`,
);

// Another restaurant: an account that has a password joins without a link and A's team's unused link for it dies; an
// account of another restaurant without a password is refused (it keeps its invitation there).
const w1IntoB = await inviteInto(sessionB, { email: w1Email, role: "waiter" }, restaurantB.id);
const w1ResetPage = await request(`/haslo/${linkToken(managerResetW1.data?.link)}`);
const invitedPend = await inviteInto(sessionOwner, { email: pendEmail, role: "waiter" });
const pendIntoB = await inviteInto(sessionB, { email: pendEmail, role: "waiter" }, restaurantB.id);
const pendInvitePage = await request(`/haslo/${linkToken(invitedPend.data?.invited?.link)}`);
check(
  "team: owner B adds A's waiter (password) to B → no link, and manager A's unused reset link for them is the invalid-link page",
  w1IntoB.status === 201 &&
    w1IntoB.data?.invited?.created === false &&
    w1IntoB.data.invited.hasPassword === true &&
    w1IntoB.data.invited.link === null &&
    w1ResetPage.status === 404 &&
    w1ResetPage.body === linkUnknown.body,
  `${w1IntoB.status} ${w1IntoB.body.slice(0, 160)} ${w1ResetPage.status}`,
);
check(
  "team: owner B inviting A's invitee who has not set a password → 409 with the message, their invitation from A still opens",
  freshInvite(invitedPend, pendEmail, "waiter") &&
    pendIntoB.status === 409 &&
    pendIntoB.data?.error ===
      "Ta osoba ma już konto w innej restauracji, ale nie ustawiła jeszcze hasła. Zaproś ją ponownie, gdy ustawi hasło z linku, który tam dostała." &&
    pendInvitePage.status === 200 &&
    pendInvitePage.body.includes(pendEmail),
  `${invitedPend.status} ${pendIntoB.status} ${pendInvitePage.status}`,
);

// A link sets the ACCOUNT's password: none for a member who also works elsewhere (owner A is an owner of B too).
const linkForShared = await memberLinkOf(sessionOwner, w1Id);
const linkForSelf = await memberLinkOf(sessionOwner, staff.ownerA.id);
const ELSEWHERE_PREFIX = "Ta osoba ma dostęp także do innej restauracji";
check(
  "team: „Nowy link” for a waiter who is also in B and for owner A (also an owner of B) → 409, no link",
  linkForShared.status === 409 &&
    String(linkForShared.data?.error).startsWith(ELSEWHERE_PREFIX) &&
    linkForShared.data.link === undefined &&
    linkForSelf.status === 409 &&
    linkForSelf.body === linkForShared.body,
  `${linkForShared.status} ${linkForSelf.status}`,
);

// Removal: A closes to the person at once (API, page, hub), their other restaurant stays.
const removedW1 = await removeOf(sessionOwner, w1Id);
const w1AfterA = await panelGet(sessionW1, `/restaurants/${String(restaurantA.id)}`);
const w1AfterPage = await staffCall(sessionW1, restaurantPageOf(restaurantA.id));
const w1AfterB = await panelGet(sessionW1, `/restaurants/${String(restaurantB.id)}`);
const w1Hub = await request("/panel", { cookie: asStaff(sessionW1) });
const w1Me = await me(sessionW1);
check(
  "team: owner A removes the waiter → their session gets the identical 404 for A (API and page), still opens B, /panel lists B only",
  removedW1.status === 200 &&
    memberIn(removedW1, w1Email) === null &&
    noAccessJson(w1AfterA) &&
    isNoAccessPage(w1AfterPage) &&
    w1AfterPage.body === cPageUnknown.body &&
    w1AfterB.status === 200 &&
    w1AfterB.data?.role === "waiter" &&
    w1Hub.status === 200 &&
    hubEntry(w1Hub, restaurantB.id) !== "" &&
    hubEntry(w1Hub, restaurantA.id) === "" &&
    w1Me.status === 200 &&
    w1Me.data?.restaurants?.length === 1 &&
    w1Me.data.restaurants[0].id === restaurantB.id,
  `${removedW1.status} ${w1AfterA.status} ${w1AfterPage.status} ${w1AfterB.status} ${w1Me.body.slice(0, 120)}`,
);
const removedAgain = await removeOf(sessionOwner, w1Id);
check("team: removing someone who is no longer in the team → the identical 404", noAccessJson(removedAgain));

// A forgotten password: the owner's reset link for the manager ends the manager's sessions once used.
const resetMgr = await memberLinkOf(sessionOwner, mgrId);
const redeemedResetMgr = await redeem(linkToken(resetMgr.data?.link), NEW_TEAM_PASSWORD);
const mgrOldSession = await me(sessionMgr);
const mgrOldPassword = await logIn(mgrEmail, TEAM_PASSWORD);
const mgrNewPassword = await logIn(mgrEmail, NEW_TEAM_PASSWORD);
check(
  "team: owner A's „Nowy link” for the manager is a 24-hour reset; setting the new password ends the old session, only the new password logs in",
  resetMgr.status === 200 &&
    resetMgr.data?.link?.kind === "reset" &&
    expiresAbout(resetMgr.data.link, 24 * HOUR_MS) &&
    redirectsTo(redeemedResetMgr, "/panel") &&
    mgrOldSession.status === 401 &&
    redirectsTo(mgrOldPassword, "/logowanie?blad=dane") &&
    redirectsTo(mgrNewPassword, "/panel"),
  `${resetMgr.status} ${resetMgr.data?.link?.kind} ${redeemedResetMgr.status} ${mgrOldSession.status}`,
);

// Outsiders: the identical 404 of an unknown restaurant on every team route; nothing changes.
const teamBeforeOutsiders = await readTeamA();
const unknownTeam = await staffCall(sessionOwner, teamApiOf(2_000_000_000));
const teamAttempts = (restaurantId, accountId) => [
  ["read", teamApiOf(restaurantId), {}],
  [
    "invite",
    teamApiOf(restaurantId),
    { method: "POST", json: { email: staffEmail("intruz-zespolu"), role: "waiter" } },
  ],
  ["role", memberApiOf(accountId, restaurantId), { method: "PATCH", json: { role: "manager" } }],
  ["remove", memberApiOf(accountId, restaurantId), { method: "DELETE" }],
  ["link", `${memberApiOf(accountId, restaurantId)}/link`, { method: "POST" }],
];
const teamOutsiders = [];
for (const [who, token] of [
  ["waiter A", sessionWaiter],
  ["owner B", sessionB],
  ["the admin", sessionAdmin],
  ["the removed waiter", sessionW1],
]) {
  for (const [name, path, options] of teamAttempts(restaurantA.id, staff.waiterA.id)) {
    const res = await staffCall(token, path, options);
    if (!noAccessJson(res) || res.body !== unknownTeam.body) {
      teamOutsiders.push(`${who} ${name}: ${String(res.status)}`);
    }
  }
}
for (const [name, path, options] of teamAttempts(restaurantB.id, staff.waiterA.id).slice(2)) {
  const res = await staffCall(sessionB, path, options);
  if (!noAccessJson(res)) {
    teamOutsiders.push(`owner B on A's waiter through B, ${name}: ${String(res.status)}`);
  }
}
for (const accountId of ["2000000000", "abc", "99999999999", "-1", "1.5"]) {
  for (const [name, path, options] of teamAttempts(restaurantA.id, accountId).slice(2)) {
    const res = await staffCall(sessionOwner, path, options);
    if (!noAccessJson(res)) {
      teamOutsiders.push(`owner A, account ${accountId}, ${name}: ${String(res.status)}`);
    }
  }
}
for (const restaurantId of ["abc", "99999999999", "-1"]) {
  const res = await staffCall(sessionOwner, teamApiOf(restaurantId));
  if (!noAccessJson(res)) {
    teamOutsiders.push(`owner A, restaurant ${restaurantId}: ${String(res.status)}`);
  }
}
const teamAfterOutsiders = await readTeamA();
check(
  "team: waiter A, owner B, the admin and the removed waiter → the identical 404 on every team route of A; foreign, unknown and malformed ids too; nothing changed",
  noAccessJson(unknownTeam) &&
    teamOutsiders.length === 0 &&
    JSON.stringify(teamAfterOutsiders.data) === JSON.stringify(teamBeforeOutsiders.data),
  teamOutsiders.join("; "),
);
const teamNoSession = [];
for (const [name, path, options] of teamAttempts(restaurantA.id, staff.waiterA.id)) {
  const res = await staffCall(null, path, options);
  if (res.status !== 401 || res.body !== meNoCookie.body) {
    teamNoSession.push(`${name}: ${String(res.status)}`);
  }
}
const teamOrigin = [];
for (const [name, path, options] of teamAttempts(restaurantA.id, staff.waiterA.id).slice(1)) {
  for (const variant of [{ noOrigin: true }, { extraHeaders: FOREIGN }]) {
    const res = await staffCall(sessionOwner, path, { ...options, ...variant });
    if (res.status !== 403) {
      teamOrigin.push(`${name} ${variant.noOrigin ? "no Origin" : "foreign"}: ${String(res.status)}`);
    }
  }
}
const teamAfterOrigin = await readTeamA();
check(
  "team: without a session every team route → the identical 401; mutations without the page's Origin → 403, nothing changed",
  teamNoSession.length === 0 &&
    teamOrigin.length === 0 &&
    JSON.stringify(teamAfterOrigin.data) === JSON.stringify(teamBeforeOutsiders.data),
  `${teamNoSession.join("; ")} ${teamOrigin.join("; ")}`,
);

// 29. Platform admin's support access (admin-support-log, S-13): the admin opens a restaurant's data only after
// „Wejdź jako wsparcie” with a reason (3–300 characters), read-only, for 60 minutes, bound to that login session.
// Every entry, every read and every exit lands in an append-only log that only the restaurant's owners read. Outside
// support mode — and for every mutation inside it — the admin gets the identical 404 of an unknown restaurant; the
// event's links (keys) never reach support mode. Restaurant C's switch is restored. Uses the sessions of 25–28.
const supportApiOf = (restaurantId) => `${PLATFORM_API}/${String(restaurantId)}/support`;
const supportLogApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/support-log`;
const restaurantApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}`;
const logOf = (res) => (Array.isArray(res.data?.entries) ? res.data.entries : []);
const SUPPORT_REASON = `Smoke: prośba właściciela ${RUN_TAG}`;
const enterSupport = (token, restaurantId, json = { reason: SUPPORT_REASON }, options = {}) =>
  staffCall(token, supportApiOf(restaurantId), { method: "POST", json, ...options });
const endSupportOf = (token, restaurantId, options = {}) =>
  staffCall(token, supportApiOf(restaurantId), { method: "DELETE", ...options });
const readLogA = (token = sessionOwner) => staffCall(token, supportLogApiOf(restaurantA.id));
// Every read support mode opens (API), in this order; and the two pages.
const supportReads = (restaurantId, eventId) => [
  ["restaurant", restaurantApiOf(restaurantId)],
  ["events", eventsApiOf(restaurantId)],
  ["team", teamApiOf(restaurantId)],
  ["log", supportLogApiOf(restaurantId)],
  ["event", eventApi(eventId)],
];
const supportPages = (restaurantId, eventId) => [restaurantPageOf(restaurantId), eventPage(eventId)];

// Event A's keys as its owner sees them (links) plus its guests' keys: none may appear in support mode.
const ownerCardA = await staffCall(sessionOwner, eventApi(eventA.id));
const aLinkKeys = LINK_KINDS.map((kind) => keyOfPath(ownerCardA.data?.event?.links?.[kind]));
const aGuestKeys = ((await request(`/api/o/${aLinkKeys[0]}/guest-links`)).data?.guests ?? []).map((guest) => guest.key);
const aKeys = [...aLinkKeys, ...aGuestKeys].filter((key) => typeof key === "string" && key.length === 24);
const leaksAKey = (body) => aKeys.some((key) => body.includes(key)) || new RegExp(`/(o|tv|r|g)/${KEY}`).test(body);
const adminUnknownPage = await staffCall(sessionAdmin, restaurantPageOf(2_000_000_000));
const adminUnknownEventPage = await staffCall(sessionAdmin, eventPage(2_000_000_000));
const ownerPageA = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id));
check(
  "support: event A's three link keys are known to its owner, the owner's page carries the writing islands",
  ownerCardA.status === 200 &&
    aLinkKeys.every((key) => key.length === 24) &&
    ownerPageA.status === 200 &&
    ownerPageA.body.includes("NewEventForm") &&
    ownerPageA.body.includes("TeamManager"),
  `${ownerCardA.status} ${aKeys.length} ${ownerPageA.status}`,
);

// Before entering: the identical 404 everywhere, nothing logged.
const logBeforeSupport = await readLogA();
const deniedBefore = [];
for (const [name, path] of supportReads(restaurantA.id, eventA.id)) {
  const res = await staffCall(sessionAdmin, path);
  if (!noAccessJson(res)) {
    deniedBefore.push(`${name}: ${String(res.status)}`);
  }
}
const [pageABefore, eventPageABefore] = await Promise.all(
  supportPages(restaurantA.id, eventA.id).map((path) => staffCall(sessionAdmin, path)),
);
const logStillEmpty = await readLogA();
check(
  "support: before entering, the admin gets the identical 404 on A's routes and pages; the owner's log is empty and stays so",
  deniedBefore.length === 0 &&
    isNoAccessPage(pageABefore) &&
    pageABefore.body === adminUnknownPage.body &&
    isNoAccessPage(eventPageABefore) &&
    eventPageABefore.body === adminUnknownEventPage.body &&
    logBeforeSupport.status === 200 &&
    logOf(logBeforeSupport).length === 0 &&
    logBeforeSupport.data?.truncated === false &&
    logOf(logStillEmpty).length === 0,
  `${deniedBefore.join("; ")} ${pageABefore.status} ${eventPageABefore.status} ${logBeforeSupport.status} ${logBeforeSupport.body.slice(0, 120)}`,
);

// Entering: Origin, platform admin, known id, a reason of 3–300 characters; nothing is logged for a refusal.
const enterRefusals = [];
for (const [label, options] of [
  ["no Origin", { noOrigin: true }],
  ["foreign Origin", { extraHeaders: FOREIGN }],
]) {
  const res = await enterSupport(sessionAdmin, restaurantA.id, undefined, options);
  if (res.status !== 403) {
    enterRefusals.push(`${label}: ${String(res.status)}`);
  }
}
for (const [who, token] of [
  ["owner A", sessionOwner],
  ["manager A", sessionManager],
  ["waiter A", sessionWaiter],
  ["owner B", sessionB],
]) {
  const res = await enterSupport(token, restaurantA.id);
  if (!noAccessJson(res)) {
    enterRefusals.push(`${who}: ${String(res.status)}`);
  }
}
for (const id of ["2000000000", "abc", "99999999999", "-1", "1.5"]) {
  const res = await staffCall(sessionAdmin, `${PLATFORM_API}/${id}/support`, {
    method: "POST",
    json: { reason: SUPPORT_REASON },
  });
  if (!noAccessJson(res)) {
    enterRefusals.push(`id ${id}: ${String(res.status)}`);
  }
}
for (const [label, json] of [
  ["empty", { reason: "" }],
  ["two characters", { reason: "  a​b " }],
  ["301 characters", { reason: "x".repeat(301) }],
  ["an extra field", { reason: SUPPORT_REASON, minutes: 600 }],
  ["no reason", {}],
]) {
  const res = await enterSupport(sessionAdmin, restaurantA.id, json);
  if (res.status !== 400) {
    enterRefusals.push(`${label}: ${String(res.status)}`);
  }
}
const shortReason = await enterSupport(sessionAdmin, restaurantA.id, { reason: "ab" });
const enterNoSession = await enterSupport(null, restaurantA.id);
const stillDeniedAfterRefusals = await staffCall(sessionAdmin, restaurantApiOf(restaurantA.id));
const logAfterRefusals = await readLogA();
check(
  "support: entering needs the page's Origin (403), a platform admin (owner, manager and waiter of A, owner B → the identical 404), a known id (404) and a reason of 3–300 characters (400); no session → 401; nothing opens, nothing is logged",
  enterRefusals.length === 0 &&
    shortReason.status === 400 &&
    shortReason.data?.error === "Wpisz powód wejścia (co najmniej 3 znaki)." &&
    enterNoSession.status === 401 &&
    enterNoSession.body === meNoCookie.body &&
    noAccessJson(stillDeniedAfterRefusals) &&
    logOf(logAfterRefusals).length === 0,
  `${enterRefusals.join("; ")} ${shortReason.status} ${enterNoSession.status} ${logOf(logAfterRefusals).length}`,
);

const enteredAt = Date.now();
const enteredA = await enterSupport(sessionAdmin, restaurantA.id);
const grantA = enteredA.data?.support;
const grantMinutes = (Date.parse(grantA?.expiresAt ?? "") - enteredAt) / 60_000;
const platformPageInSupport = await staffCall(sessionAdmin, "/panel/platforma");
check(
  "support: the admin enters A with a reason → 201 with the restaurants and where support starts, for 60 minutes; the platform page shows it as active",
  enteredA.status === 201 &&
    Array.isArray(enteredA.data?.restaurants) &&
    grantA?.restaurantId === restaurantA.id &&
    grantA.path === restaurantPageOf(restaurantA.id) &&
    grantMinutes > 58 &&
    grantMinutes < 62 &&
    !leaksAKey(enteredA.body) &&
    platformPageInSupport.status === 200 &&
    platformPageInSupport.body.includes(`data-support-active="${String(restaurantA.id)}"`) &&
    platformPageInSupport.body.includes("Wsparcie aktywne do"),
  `${enteredA.status} ${JSON.stringify(grantA)} ${grantMinutes.toFixed(1)} ${platformPageInSupport.status}`,
);

// In support mode: the owner's view, read-only, without keys; B stays closed.
const supportAnswers = {};
for (const [name, path] of supportReads(restaurantA.id, eventA.id)) {
  supportAnswers[name] = await staffCall(sessionAdmin, path);
}
const [pageAInSupport, eventPageAInSupport] = [
  await staffCall(sessionAdmin, restaurantPageOf(restaurantA.id)),
  await staffCall(sessionAdmin, eventPage(eventA.id)),
];
const supportInfo = supportAnswers.restaurant.data?.support;
const allListedIds = ["upcoming", "past", "archived"].flatMap((list) => listIds(supportAnswers.events, list));
check(
  "support: in support mode the admin reads A as its owner (restaurant, events, team, log, event) — the event WITHOUT its links and no key anywhere",
  Object.values(supportAnswers).every((res) => res.status === 200) &&
    supportAnswers.restaurant.data?.role === "owner" &&
    supportInfo?.restaurantId === restaurantA.id &&
    supportInfo.reason === SUPPORT_REASON &&
    supportInfo.restaurantDisabled === false &&
    Object.keys(supportInfo).sort().join(",") ===
      "expiresAt,reason,restaurantDisabled,restaurantId,restaurantName,startedAt" &&
    allListedIds.includes(eventA.id) &&
    memberIn(supportAnswers.team, staff.ownerA.email)?.role === "owner" &&
    supportAnswers.event.data?.event?.id === eventA.id &&
    supportAnswers.event.data.event.name === EVENT_NAME &&
    supportAnswers.event.data.event.links === undefined &&
    supportAnswers.event.data.support?.restaurantId === restaurantA.id &&
    Object.values(supportAnswers).every((res) => !leaksAKey(res.body)),
  Object.entries(supportAnswers)
    .map(([name, res]) => `${name} ${String(res.status)}`)
    .join(", "),
);
check(
  "support: A's page shows the banner with the reason, the events, the team as a list and the log — no writing island; the event card page is a summary without links",
  pageAInSupport.status === 200 &&
    pageAInSupport.body.includes("data-support-banner") &&
    pageAInSupport.body.includes(SUPPORT_REASON) &&
    pageAInSupport.body.includes(`data-event-id="${String(eventA.id)}"`) &&
    pageAInSupport.body.includes("data-support-team") &&
    pageAInSupport.body.includes(staff.ownerA.email) &&
    pageAInSupport.body.includes("data-support-log") &&
    pageAInSupport.body.includes('data-support-entry="enter"') &&
    !pageAInSupport.body.includes("NewEventForm") &&
    !pageAInSupport.body.includes("TeamManager") &&
    !leaksAKey(pageAInSupport.body) &&
    eventPageAInSupport.status === 200 &&
    eventPageAInSupport.body.includes(`data-support-event="${String(eventA.id)}"`) &&
    eventPageAInSupport.body.includes("data-support-banner") &&
    eventPageAInSupport.body.includes(escapeHtml(EVENT_NAME)) &&
    !eventPageAInSupport.body.includes("EventCard") &&
    !leaksAKey(eventPageAInSupport.body),
  `${pageAInSupport.status} ${eventPageAInSupport.status}`,
);
const deniedB = [];
for (const [name, path] of supportReads(restaurantB.id, eventB.id)) {
  const res = await staffCall(sessionAdmin, path);
  if (!noAccessJson(res)) {
    deniedB.push(`${name}: ${String(res.status)}`);
  }
}
for (const path of supportPages(restaurantB.id, eventB.id)) {
  const res = await staffCall(sessionAdmin, path);
  if (!isNoAccessPage(res)) {
    deniedB.push(`${path}: ${String(res.status)}`);
  }
}
check("support: support mode in A opens nothing of B (the identical 404)", deniedB.length === 0, deniedB.join("; "));

// Read-only: every mutation of the admin on A's routes is the identical 404 and changes nothing, logs nothing.
const eventsBeforeWrites = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const cardBeforeWrites = await staffCall(sessionOwner, eventApi(eventA.id));
const teamBeforeWrites = await readTeamA();
const logBeforeWrites = await readLogA();
const supportWrites = [
  [
    "create event",
    eventsApiOf(restaurantA.id),
    { method: "POST", json: { name: "Wsparcie pisze", date: "2030-01-01" } },
  ],
  ["edit event", eventApi(eventA.id), { method: "PATCH", json: { name: "Zmienione przez wsparcie" } }],
  ["archive event", eventApi(eventA.id), { method: "PATCH", json: { archived: true } }],
  ["delete event", eventApi(eventA.id), { method: "DELETE" }],
  ["replace link", `${eventApi(eventA.id)}/links/organizer`, { method: "POST" }],
  ["invite", teamApiOf(restaurantA.id), { method: "POST", json: { email: staffEmail("wsparcie"), role: "waiter" } }],
  ["role", memberApiOf(staff.waiterA.id), { method: "PATCH", json: { role: "manager" } }],
  ["remove", memberApiOf(staff.waiterA.id), { method: "DELETE" }],
  ["member link", `${memberApiOf(staff.waiterA.id)}/link`, { method: "POST" }],
];
const writesLetThrough = [];
for (const [name, path, options] of supportWrites) {
  const res = await staffCall(sessionAdmin, path, options);
  if (!noAccessJson(res)) {
    writesLetThrough.push(`${name}: ${String(res.status)}`);
  }
}
for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
  const res = await staffCall(sessionAdmin, supportLogApiOf(restaurantA.id), { method, json: { entries: [] } });
  const ownerRes = await staffCall(sessionOwner, supportLogApiOf(restaurantA.id), { method, json: { entries: [] } });
  if (![404, 405].includes(res.status) || ![404, 405].includes(ownerRes.status)) {
    writesLetThrough.push(`log ${method}: ${String(res.status)} / owner ${String(ownerRes.status)}`);
  }
}
const eventsAfterWrites = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const cardAfterWrites = await staffCall(sessionOwner, eventApi(eventA.id));
const teamAfterWrites = await readTeamA();
const logAfterWrites = await readLogA();
check(
  "support: every write in support mode (events, links, team, the log itself) → the identical 404 (the log has no write method at all); A's events, card, team and log are unchanged",
  writesLetThrough.length === 0 &&
    eventsAfterWrites.body === eventsBeforeWrites.body &&
    cardAfterWrites.body === cardBeforeWrites.body &&
    JSON.stringify(teamAfterWrites.data) === JSON.stringify(teamBeforeWrites.data) &&
    logAfterWrites.body === logBeforeWrites.body,
  writesLetThrough.join("; "),
);

// The owner's log: the entry with the reason, every read (method, path, the event's name), nothing denied.
const expectedAccess = [
  ...supportReads(restaurantA.id, eventA.id).map(([, path]) => path),
  ...supportPages(restaurantA.id, eventA.id),
];
const oldestFirst = [...logOf(logAfterWrites)].reverse();
const [enterEntry, ...accessEntries] = oldestFirst;
const eventPaths = new Set([eventApi(eventA.id), eventPage(eventA.id)]);
check(
  "support: owner A's log lists, newest first, the entry (reason, the admin's e-mail, until when) and one GET per read in support mode (the event's with its name) — nothing for refusals and writes",
  logAfterWrites.status === 200 &&
    oldestFirst.length === 1 + expectedAccess.length &&
    logOf(logAfterWrites).every((entry, index, all) => index === 0 || all[index - 1].id > entry.id) &&
    enterEntry?.kind === "enter" &&
    enterEntry.reason === SUPPORT_REASON &&
    enterEntry.admin?.email === staff.admin.email &&
    enterEntry.expiresAt === grantA?.expiresAt &&
    accessEntries.every(
      (entry, index) =>
        entry.kind === "access" &&
        entry.method === "GET" &&
        entry.path === expectedAccess[index] &&
        entry.admin?.email === staff.admin.email &&
        (eventPaths.has(entry.path)
          ? entry.event?.id === eventA.id && entry.event.name === EVENT_NAME
          : entry.event === null),
    ),
  oldestFirst.map((entry) => `${entry.kind} ${entry.method ?? ""} ${entry.path ?? ""}`).join(" | "),
);
const ownerPageWithLog = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id));
const managerLog = await readLogA(sessionManager);
const waiterLog = await readLogA(sessionWaiter);
const ownerBLog = await readLogA(sessionB);
const noSessionLog = await readLogA(null);
const managerPageA = await staffCall(sessionManager, restaurantPageOf(restaurantA.id));
const waiterPage = await staffCall(sessionWaiter, restaurantPageOf(restaurantA.id));
const oddLogIds = [];
for (const id of ["2000000000", "abc", "99999999999", "-1"]) {
  const res = await staffCall(sessionOwner, supportLogApiOf(id));
  if (!noAccessJson(res)) {
    oddLogIds.push(`${id}: ${String(res.status)}`);
  }
}
check(
  "support: the owner's page shows „Dziennik wejść administratora” with the reason; manager A, waiter A, owner B → the identical 404 on the log and no section; unknown ids 404, no session 401",
  ownerPageWithLog.status === 200 &&
    ownerPageWithLog.body.includes("data-support-log") &&
    ownerPageWithLog.body.includes("Dziennik wejść administratora") &&
    ownerPageWithLog.body.includes(SUPPORT_REASON) &&
    ownerPageWithLog.body.includes(staff.admin.email) &&
    !ownerPageWithLog.body.includes("data-support-banner") &&
    noAccessJson(managerLog) &&
    noAccessJson(waiterLog) &&
    noAccessJson(ownerBLog) &&
    noSessionLog.status === 401 &&
    managerPageA.status === 200 &&
    !managerPageA.body.includes("data-support-log") &&
    waiterPage.status === 200 &&
    !waiterPage.body.includes("data-support-log") &&
    oddLogIds.length === 0,
  `${ownerPageWithLog.status} ${managerLog.status} ${waiterLog.status} ${ownerBLog.status} ${noSessionLog.status} ${oddLogIds.join("; ")}`,
);

// client-restaurant-split (S-14) in support mode: the client's work reads through the dispatcher and the preview pages
// render without islands; the guests' links (keys) stay closed; every write (dispatcher, prices, reset) is the
// identical 404; the event page shows „Koszty AI” but no reset, the orders preview no price editor.
const supportKlient = (path, options) => staffCall(sessionAdmin, `${eventApi(eventA.id)}/klient/${path}`, options);
const supportClientGuests = await supportKlient("guests");
const supportClientQuestions = await supportKlient("questions");
const supportClientLinks = await supportKlient("guest-links");
const supportPreview = await staffCall(sessionAdmin, `${eventPage(eventA.id)}/goscie`);
const supportPreviewLinks = await staffCall(sessionAdmin, `${eventPage(eventA.id)}/linki`);
const supportPreviewOrders = await staffCall(sessionAdmin, `${eventPage(eventA.id)}/zamowienia`);
const supportPrices = await staffCall(sessionAdmin, `${eventApi(eventA.id)}/prices`);
const supportAi = await staffCall(sessionAdmin, `${eventApi(eventA.id)}/ai-topics`);
const supportS14Writes = [];
for (const [label, path, options] of [
  ["add guests", `${eventApi(eventA.id)}/klient/guests`, { method: "POST", json: { text: "Wsparcie Gość" } }],
  ["set a price", `${eventApi(eventA.id)}/prices`, { method: "PUT", json: { kind: "dish", name: "X", price: "1" } }],
  ["reset", `${eventApi(eventA.id)}/reset`, { method: "POST", json: { parts: ["guesses"] } }],
  ["switch", eventApi(eventA.id), { method: "PATCH", json: { venueLeads: true } }],
]) {
  const res = await staffCall(sessionAdmin, path, options);
  if (!noAccessJson(res)) supportS14Writes.push(`${label}: ${String(res.status)}`);
}
check(
  "support (S-14): the client's work reads (dispatcher, previews without islands, prices, AI costs), the guests' links stay closed, every write is the identical 404",
  supportClientGuests.status === 200 &&
    Array.isArray(supportClientGuests.data?.guests) &&
    supportClientQuestions.status === 200 &&
    noAccessJson(supportClientLinks) &&
    supportPreview.status === 200 &&
    supportPreview.body.includes('data-client-preview="goscie"') &&
    supportPreview.body.includes('data-lead-banner="support"') &&
    // Rendered, not hydrated (the support banner's exit button is the page's only island).
    supportPreview.body.includes("Dodaj gości") &&
    !supportPreview.body.includes('component-export="GuestManager"') &&
    !leaksAKey(supportPreview.body) &&
    isNoAccessPage(supportPreviewLinks) &&
    supportPreviewOrders.status === 200 &&
    !supportPreviewOrders.body.includes("data-price-list") &&
    !leaksAKey(supportPreviewOrders.body) &&
    supportPrices.status === 200 &&
    Array.isArray(supportPrices.data?.rows) &&
    supportAi.status === 200 &&
    keysOf(supportAi.data) === "provider,usage" &&
    eventPageAInSupport.body.includes("data-ai-costs") &&
    !eventPageAInSupport.body.includes("data-event-reset") &&
    supportS14Writes.length === 0,
  `${supportClientGuests.status} ${supportClientLinks.status} ${supportPreview.status} ${supportPreviewLinks.status} ${supportPreviewOrders.status} ${supportPrices.status} ${supportAi.status} ${supportS14Writes.join("; ")}`,
);

// Support mode belongs to the login session: the admin's second login is outside it.
const secondAdminLogin = await logIn(staff.admin.email, STAFF_PASSWORD);
const secondAdmin = sessionOf(secondAdminLogin);
const secondReadsA = await staffCall(secondAdmin, restaurantApiOf(restaurantA.id));
const secondPlatformPage = await staffCall(secondAdmin, "/panel/platforma");
check(
  "support: another login of the same admin is not in support mode (the identical 404, no active support on its platform page)",
  redirectsTo(secondAdminLogin, "/panel") &&
    noAccessJson(secondReadsA) &&
    secondPlatformPage.status === 200 &&
    !secondPlatformPage.body.includes("data-support-active"),
  `${secondAdminLogin.status} ${secondReadsA.status}`,
);

// Exit: Origin required, logged once; afterwards the identical 404 again.
const logBeforeExit = await readLogA();
const exitNoOrigin = await endSupportOf(sessionAdmin, restaurantA.id, { noOrigin: true });
const exitForeign = await endSupportOf(sessionAdmin, restaurantA.id, { extraHeaders: FOREIGN });
const exitByOwner = await endSupportOf(sessionOwner, restaurantA.id);
const stillInSupport = await staffCall(sessionAdmin, restaurantApiOf(restaurantA.id));
const exitA = await endSupportOf(sessionAdmin, restaurantA.id);
const exitAgain = await endSupportOf(sessionAdmin, restaurantA.id);
const exitUnknown = await endSupportOf(sessionAdmin, 2_000_000_000);
const afterExitApi = await staffCall(sessionAdmin, restaurantApiOf(restaurantA.id));
const afterExitPage = await staffCall(sessionAdmin, restaurantPageOf(restaurantA.id));
const logAfterExit = await readLogA();
check(
  "support: „Zakończ wsparcie” needs the page's Origin (403) and the admin (404 for the owner); → ended, again → nothing to end; afterwards the identical 404; the log ends with the exit",
  exitNoOrigin.status === 403 &&
    exitForeign.status === 403 &&
    noAccessJson(exitByOwner) &&
    stillInSupport.status === 200 &&
    exitA.status === 200 &&
    exitA.data?.ended === true &&
    Array.isArray(exitA.data?.restaurants) &&
    exitAgain.status === 200 &&
    exitAgain.data?.ended === false &&
    noAccessJson(exitUnknown) &&
    noAccessJson(afterExitApi) &&
    isNoAccessPage(afterExitPage) &&
    afterExitPage.body === adminUnknownPage.body &&
    logOf(logAfterExit)[0]?.kind === "exit" &&
    logOf(logAfterExit)[0].admin?.email === staff.admin.email &&
    logOf(logAfterExit).length === logOf(logBeforeExit).length + 2,
  `${exitNoOrigin.status} ${exitForeign.status} ${exitByOwner.status} ${exitA.status} ${exitA.body.slice(-30)} ${exitAgain.body.slice(-30)} ${afterExitApi.status} ${logOf(logAfterExit).length}`,
);

// A switched-off restaurant opens in support mode too (its staff stay out); C's switch is restored.
const loginC = await logIn(emailC, RESET_STAFF_PASSWORD);
const sessionCNow = sessionOf(loginC);
const C_REASON = `Smoke: wyłączona restauracja ${RUN_TAG}`;
const disableC = await platformCall(sessionAdmin, idPath(restaurantCId), { method: "PATCH", json: { disabled: true } });
const enteredC = await enterSupport(sessionAdmin, restaurantCId, { reason: C_REASON });
const apiCInSupport = await staffCall(sessionAdmin, restaurantApiOf(restaurantCId));
const pageCInSupport = await staffCall(sessionAdmin, restaurantPageOf(restaurantCId));
const ownerCWhileOff = await staffCall(sessionCNow, restaurantApiOf(restaurantCId));
const exitC = await endSupportOf(sessionAdmin, restaurantCId);
const enableC = await platformCall(sessionAdmin, idPath(restaurantCId), { method: "PATCH", json: { disabled: false } });
const logC = await staffCall(sessionCNow, supportLogApiOf(restaurantCId));
check(
  "support: the admin enters switched-off C (its owner stays out), the banner notes it; after enabling C its owner's log shows enter, two reads and exit",
  redirectsTo(loginC, "/panel") &&
    findListed(disableC, restaurantCId)?.disabled === true &&
    enteredC.status === 201 &&
    apiCInSupport.status === 200 &&
    apiCInSupport.data?.support?.restaurantDisabled === true &&
    pageCInSupport.status === 200 &&
    pageCInSupport.body.includes("Ta restauracja jest wyłączona") &&
    pageCInSupport.body.includes(C_REASON) &&
    noAccessJson(ownerCWhileOff) &&
    exitC.data?.ended === true &&
    findListed(enableC, restaurantCId)?.disabled === false &&
    logC.status === 200 &&
    logOf(logC)
      .map((entry) => entry.kind)
      .join(",") === "exit,access,access,enter" &&
    logOf(logC)[3]?.reason === C_REASON,
  `${loginC.status} ${enteredC.status} ${apiCInSupport.status} ${pageCInSupport.status} ${ownerCWhileOff.status} ${logC.body.slice(0, 160)}`,
);

// Logging out ends support mode with the login; the entry stays in the owner's log.
const SECOND_REASON = `Smoke: drugie logowanie ${RUN_TAG}`;
const enteredSecond = await enterSupport(secondAdmin, restaurantA.id, { reason: SECOND_REASON });
const secondInSupport = await staffCall(secondAdmin, restaurantApiOf(restaurantA.id));
const firstOutside = await staffCall(sessionAdmin, restaurantApiOf(restaurantA.id));
const loggedOutSecond = await request("/api/auth/logout", { method: "POST", form: {}, cookie: asStaff(secondAdmin) });
const thirdAdmin = sessionOf(await logIn(staff.admin.email, STAFF_PASSWORD));
const thirdReadsA = await staffCall(thirdAdmin, restaurantApiOf(restaurantA.id));
const logAfterLogout = await readLogA();
check(
  "support: logging out ends support mode (a new login → the identical 404); the entry of that login stays in the owner's log",
  enteredSecond.status === 201 &&
    secondInSupport.status === 200 &&
    noAccessJson(firstOutside) &&
    loggedOutSecond.status === 303 &&
    noAccessJson(thirdReadsA) &&
    logOf(logAfterLogout).some((entry) => entry.kind === "enter" && entry.reason === SECOND_REASON),
  `${enteredSecond.status} ${secondInSupport.status} ${firstOutside.status} ${loggedOutSecond.status} ${thirdReadsA.status}`,
);

// 30. Client / venue split (client-restaurant-split, S-14; FR-026..FR-028). The switch „Lokal prowadzi” on event A:
// while OFF the client edits and the staff preview (dispatcher writes → 409 client-leads); while ON the staff edit
// through the dispatcher and the client's writes get 409 venue-leads (its reads and pages stay, with the banner);
// guests keep writing either way. Owners and managers toggle; a waiter, owner B, no session and a foreign Origin are
// refused. Prices are the venue's whichever side leads. Uses the sessions of 25–29.
const cardA30 = await staffCall(sessionOwner, eventApi(eventA.id));
const clientKey = keyOfPath(cardA30.data?.event?.links?.organizer);
const clientApi = `/api/o/${clientKey}`;
const klientApi = `${eventApi(eventA.id)}/klient`;
const leadCode = (res) => res.data?.code;
check(
  "split: event A starts client-led (the card says so) with a client link",
  cardA30.status === 200 && cardA30.data?.event?.venueLeads === false && clientKey.length === 24,
  `${cardA30.status} ${String(cardA30.data?.event?.venueLeads)}`,
);

// OFF: the client writes, the staff read through the dispatcher and are refused on writes.
const S14_GUESTS = ["Ala", "Ola", "Ela"].map((name) => `${name} S14 ${RUN_TAG}`);
const clientAdded = await request(`${clientApi}/guests`, { method: "POST", json: { text: S14_GUESTS.join("\n") } });
const staffRead = await staffCall(sessionOwner, `${klientApi}/guests`);
const clientRead = await request(`${clientApi}/guests`);
const staffWriteOff = await staffCall(sessionOwner, `${klientApi}/guests`, {
  method: "POST",
  json: { text: `Personel S14 ${RUN_TAG}` },
});
const staffUnknownSub = await staffCall(sessionOwner, `${klientApi}/nie-ma-takiej`);
const staffClientOnly = await staffCall(sessionOwner, `${klientApi}/trial-reset`);
check(
  "split OFF: the client adds guests; the staff read the same list through the dispatcher; their write → 409 client-leads; unknown and client-only sub-paths → the identical 404",
  clientAdded.status === 201 &&
    staffRead.status === 200 &&
    staffRead.body === clientRead.body &&
    S14_GUESTS.every((name) => staffRead.body.includes(name)) &&
    staffWriteOff.status === 409 &&
    leadCode(staffWriteOff) === "client-leads" &&
    typeof staffWriteOff.data?.error === "string" &&
    noAccessJson(staffUnknownSub) &&
    noAccessJson(staffClientOnly),
  `${clientAdded.status} ${staffRead.status} ${staffWriteOff.status} ${staffUnknownSub.status} ${staffClientOnly.status}`,
);
const previewOff = await staffCall(sessionOwner, `${eventPage(eventA.id)}/goscie`);
const previewUnknown = await staffCall(sessionOwner, `${eventPage(eventA.id)}/nieznana`);
const previewWaiter = await staffCall(sessionWaiter, `${eventPage(eventA.id)}/goscie`);
const eventPage30 = await staffCall(sessionOwner, eventPage(eventA.id));
check(
  "split: the event page has the switch, „Praca klienta”, „Koszty AI” and „Reset danych”; the preview is read-only under the staff-preview banner; an unknown section and a waiter → the no-access page",
  eventPage30.status === 200 &&
    eventPage30.body.includes("data-client-work") &&
    eventPage30.body.includes("data-ai-costs") &&
    eventPage30.body.includes("data-event-reset") &&
    previewOff.status === 200 &&
    previewOff.body.includes('data-lead-banner="staff-preview"') &&
    previewOff.body.includes("data-read-only") &&
    previewOff.body.includes(" inert") &&
    previewOff.body.includes(S14_GUESTS[0]) &&
    isNoAccessPage(previewUnknown) &&
    isNoAccessPage(previewWaiter),
  `${eventPage30.status} ${previewOff.status} ${previewUnknown.status} ${previewWaiter.status}`,
);

// Who may flip the switch.
const waiterToggle = await staffCall(sessionWaiter, eventApi(eventA.id), {
  method: "PATCH",
  json: { venueLeads: true },
});
const ownerBToggle = await staffCall(sessionB, eventApi(eventA.id), { method: "PATCH", json: { venueLeads: true } });
const noSessionToggle = await staffCall(null, eventApi(eventA.id), { method: "PATCH", json: { venueLeads: true } });
const foreignToggle = await staffCall(sessionOwner, eventApi(eventA.id), {
  method: "PATCH",
  json: { venueLeads: true },
  extraHeaders: FOREIGN,
});
const stillOff = await staffCall(sessionOwner, eventApi(eventA.id));
check(
  "split: a waiter and owner B → the identical 404, no session → 401, a foreign Origin → 403; the switch stays off",
  noAccessJson(waiterToggle) &&
    noAccessJson(ownerBToggle) &&
    noSessionToggle.status === 401 &&
    foreignToggle.status === 403 &&
    stillOff.data?.event?.venueLeads === false,
  `${waiterToggle.status} ${ownerBToggle.status} ${noSessionToggle.status} ${foreignToggle.status}`,
);
const ownerBReads = [];
for (const path of [
  `${klientApi}/guests`,
  `${eventApi(eventA.id)}/reset`,
  `${eventApi(eventA.id)}/ai-topics`,
  `${eventApi(eventA.id)}/prices`,
]) {
  const res = await staffCall(sessionB, path);
  if (!noAccessJson(res)) ownerBReads.push(`${path}: ${String(res.status)}`);
}
const ownerBPreview = await staffCall(sessionB, `${eventPage(eventA.id)}/goscie`);
const noSessionKlient = await staffCall(null, `${klientApi}/guests`);
check(
  "split: owner B gets the identical 404 on A's dispatcher, reset, AI costs, prices and previews; no session → 401",
  ownerBReads.length === 0 && isNoAccessPage(ownerBPreview) && noSessionKlient.status === 401,
  `${ownerBReads.join("; ")} ${ownerBPreview.status} ${noSessionKlient.status}`,
);

// ON (a manager flips it): the staff edit, the client views; guests keep writing.
const managerOn = await staffCall(sessionManager, eventApi(eventA.id), { method: "PATCH", json: { venueLeads: true } });
const staffWriteOn = await staffCall(sessionManager, `${klientApi}/guests`, {
  method: "POST",
  json: { text: `Personel S14 ${RUN_TAG}` },
});
const clientWriteOn = await request(`${clientApi}/guests`, { method: "POST", json: { text: `Klient S14 ${RUN_TAG}` } });
const clientTrialOn = await request(`${clientApi}/trial-reset`, { method: "POST", json: { parts: ["seating"] } });
const clientReadOn = await request(`${clientApi}/guests`);
const clientPageOn = await request(`/o/${clientKey}/goscie`);
const clientShellOn = await request(`/o/${clientKey}`);
const previewOn = await staffCall(sessionManager, `${eventPage(eventA.id)}/goscie`);
check(
  "split ON: a manager flips the switch; the staff add a guest through the dispatcher; the client's writes (incl. „Reset prób”) → 409 venue-leads; its reads and pages stay, read-only with the banner",
  managerOn.status === 200 &&
    managerOn.data?.event?.venueLeads === true &&
    staffWriteOn.status === 201 &&
    staffWriteOn.body.includes(`Personel S14 ${RUN_TAG}`) &&
    clientWriteOn.status === 409 &&
    leadCode(clientWriteOn) === "venue-leads" &&
    clientTrialOn.status === 409 &&
    leadCode(clientTrialOn) === "venue-leads" &&
    clientReadOn.status === 200 &&
    clientReadOn.body.includes(`Personel S14 ${RUN_TAG}`) &&
    !clientReadOn.body.includes(`Klient S14 ${RUN_TAG}`) &&
    clientPageOn.status === 200 &&
    clientPageOn.body.includes('data-lead-banner="client"') &&
    clientPageOn.body.includes(" inert") &&
    clientShellOn.status === 200 &&
    clientShellOn.body.includes('data-lead-banner="client"') &&
    previewOn.status === 200 &&
    previewOn.body.includes('data-lead-banner="staff-leads"') &&
    !previewOn.body.includes("data-read-only"),
  `${managerOn.status} ${staffWriteOn.status} ${clientWriteOn.status} ${clientTrialOn.status} ${clientPageOn.status} ${previewOn.status}`,
);
const staffLinksOn = await staffCall(sessionOwner, `${klientApi}/guest-links`, {
  method: "PATCH",
  json: { enabled: true },
});
const s14Guest = staffLinksOn.data?.guests?.find((guest) => guest.displayName === S14_GUESTS[0]);
const guestGuessOn = s14Guest
  ? await request(`/api/g/${s14Guest.key}/guess`, { method: "PUT", json: { amount: "1500" } })
  : null;
check(
  "split ON: the staff switch guest access on through the dispatcher; a guest still saves a guess (the switch never touches guests)",
  staffLinksOn.status === 200 && staffLinksOn.data?.enabled === true && guestGuessOn?.status === 200,
  `${staffLinksOn.status} ${guestGuessOn?.status}`,
);

// Prices are the venue's whichever side leads: a new dish costs 0, the price set in the panel shows on the client's
// line and prices the next line of that name.
const S14_DISH = `Pierogi S14 ${RUN_TAG}`;
const staffDish = await staffCall(sessionOwner, `${klientApi}/orders`, {
  method: "POST",
  json: { name: S14_DISH, quantity: 2 },
});
const priceSet = await staffCall(sessionManager, `${eventApi(eventA.id)}/prices`, {
  method: "PUT",
  json: { kind: "dish", name: S14_DISH.toUpperCase(), price: "36" },
});
const priceBad = await staffCall(sessionOwner, `${eventApi(eventA.id)}/prices`, {
  method: "PUT",
  json: { kind: "dish", name: S14_DISH, price: "abc" },
});
const priceUnknown = await staffCall(sessionOwner, `${eventApi(eventA.id)}/prices`, {
  method: "PUT",
  json: { kind: "drink", name: S14_DISH, price: "1" },
});
const priceWaiter = await staffCall(sessionWaiter, `${eventApi(eventA.id)}/prices`, {
  method: "PUT",
  json: { kind: "dish", name: S14_DISH, price: "1" },
});
const managerOff = await staffCall(sessionManager, eventApi(eventA.id), {
  method: "PATCH",
  json: { venueLeads: false },
});
const clientDishAgain = await request(`${clientApi}/orders`, { method: "POST", json: { name: S14_DISH, quantity: 1 } });
const clientDishWithPrice = await request(`${clientApi}/orders`, {
  method: "POST",
  json: { name: S14_DISH, quantity: 1, price: "1" },
});
const s14Lines = (clientDishAgain.data?.items ?? []).filter((item) => item.name === S14_DISH);
const priceRow = priceSet.data?.rows?.find((row) => row.name === S14_DISH);
const pricesPreview = await staffCall(sessionOwner, `${eventPage(eventA.id)}/zamowienia`);
check(
  "split prices: a new dish costs 0; the manager prices it in the panel (any letter case) → every line and the next one cost 36,00 zł; a bad price 400, an unknown name 404, a waiter 404; the client cannot send a price (400); the orders preview has „Cennik wydarzenia”",
  staffDish.status === 201 &&
    staffDish.data?.items?.find((item) => item.name === S14_DISH)?.unitPriceGrosze === 0 &&
    priceSet.status === 200 &&
    priceRow?.priceGrosze === 3600 &&
    priceRow.kind === "dish" &&
    priceRow.lines === 1 &&
    priceBad.status === 400 &&
    errorOf(priceBad) === "Wpisz kwotę w złotych, np. 1500 albo 1499,99." &&
    priceUnknown.status === 404 &&
    noAccessJson(priceWaiter) &&
    managerOff.status === 200 &&
    managerOff.data?.event?.venueLeads === false &&
    clientDishAgain.status === 201 &&
    s14Lines.length === 2 &&
    s14Lines.every((item) => item.unitPriceGrosze === 3600) &&
    clientDishWithPrice.status === 400 &&
    pricesPreview.status === 200 &&
    pricesPreview.body.includes("data-price-list") &&
    pricesPreview.body.includes("Cennik wydarzenia"),
  `${staffDish.status} ${priceSet.status} ${priceBad.status} ${priceUnknown.status} ${priceWaiter.status} ${clientDishAgain.status} ${clientDishWithPrice.status} ${pricesPreview.status}`,
);

// OFF again: the client writes; the staff are back to preview.
const clientWriteOffAgain = await request(`${clientApi}/guests`, {
  method: "POST",
  json: { text: `Klient S14 ${RUN_TAG}` },
});
const staffWriteOffAgain = await staffCall(sessionOwner, `${klientApi}/guests/${String(s14Guest?.id ?? 0)}`, {
  method: "DELETE",
});
check(
  "split OFF again: the client adds a guest; a staff delete through the dispatcher → 409 client-leads",
  clientWriteOffAgain.status === 201 &&
    staffWriteOffAgain.status === 409 &&
    leadCode(staffWriteOffAgain) === "client-leads",
  `${clientWriteOffAgain.status} ${staffWriteOffAgain.status}`,
);

// 31. Venue templates (venue-templates, S-15; FR-030, US-06, US-09). A template is an event row with is_template: the
// manager creates one from scratch and draws it with the client's editor through the template dispatcher, the owner
// saves event A's room as another, an event is created from a template with its room ready, and „Zaktualizuj z
// szablonu” first names who loses a seat and then unseats exactly them. A template never opens through any link key,
// never shows in the event lists or the platform counter, never opens through event routes (and an event never through
// template routes); a waiter, owner B, the admin outside support mode, unknown and malformed ids → the identical 404;
// no session → 401; a foreign Origin → 403; support mode reads only. Uses the sessions of 25–30.
const templatesApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/templates`;
const templateApi = (id) => `/api/panel/templates/${String(id)}`;
const templateSala = (id) => `${templateApi(id)}/sala`;
const templatePage = (id) => `/panel/szablony/${String(id)}`;
const TPL_NAME = `Sala smoke ${RUN_TAG}`;
const listedCountA = async () => findListed(await platformCall(sessionAdmin), restaurantA.id)?.eventCount ?? -1;
const eventCountBefore = await listedCountA();

const tplCreated = await staffCall(sessionManager, templatesApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `  ${TPL_NAME}  ` },
});
const tplId = tplCreated.data?.template?.id ?? 0;
const tplEmpty = await staffCall(sessionOwner, `${templateSala(tplId)}/venue`);
const tplPlan = await requestBytes(`${templateSala(tplId)}/plan`, {
  method: "PUT",
  body: TINY_PNG,
  contentType: "image/png",
  cookie: asStaff(sessionOwner),
});
const tplRoom = await staffCall(sessionManager, `${templateSala(tplId)}/rooms`, {
  method: "POST",
  json: { name: "Sala A" },
});
const tplRoomId = tplRoom.data?.rooms?.find((room) => room.name === "Sala A")?.id ?? 0;
const tplT1 = await staffCall(sessionManager, `${templateSala(tplId)}/tables`, {
  method: "POST",
  json: { roomId: tplRoomId, name: "T1", seatCount: 4, shape: "round", x: 0.3, y: 0.3 },
});
const tplT2 = await staffCall(sessionManager, `${templateSala(tplId)}/tables`, {
  method: "POST",
  json: { roomId: tplRoomId, name: "T2", seatCount: 6, shape: "rectangular", x: 0.6, y: 0.6, rotation: 90 },
});
const tplImage = await requestBytes(`${templateSala(tplId)}/plan/image?v=1`, { cookie: asStaff(sessionOwner) });
check(
  "templates: a manager creates an empty template (name normalized) → 201; the client's editor routes draw it through the template dispatcher (plan, room, two tables, the image back)",
  tplCreated.status === 201 &&
    tplCreated.data?.template?.name === TPL_NAME &&
    tplCreated.data.template.tableCount === 0 &&
    tplCreated.data.template.hasPlan === false &&
    Array.isArray(tplCreated.data.templates) &&
    tplEmpty.status === 200 &&
    tplEmpty.data?.tables?.length === 0 &&
    tplPlan.status === 200 &&
    tplRoom.status === 201 &&
    tplT1.status === 201 &&
    tplT2.status === 201 &&
    tplT2.data?.tables?.length === 2 &&
    tplImage.status === 200 &&
    sameBytes(tplImage.bytes, TINY_PNG),
  `${tplCreated.status} ${tplEmpty.status} ${tplPlan.status} ${tplRoom.status} ${tplT1.status} ${tplT2.status} ${tplImage.status}`,
);

const tplSeating = await staffCall(sessionOwner, `${templateSala(tplId)}/seating`);
const tplRefused = [];
for (const [method, sub] of [
  ["GET", "guests"],
  ["GET", "guest-links"],
  ["GET", "orders"],
  ["GET", "questions"],
  ["POST", "seating/publish"],
  ["POST", "seating"],
  ["GET", "nie-ma-takiej"],
  ["GET", "reset"],
]) {
  const res = await staffCall(sessionOwner, `${templateSala(tplId)}/${sub}`, { method });
  if (!noAccessJson(res)) tplRefused.push(`${method} ${sub}: ${String(res.status)}`);
}
check(
  "templates: the dispatcher runs only the venue routes and a read of the (empty) seating board; guests, links, orders, questions, publishing and unknown sub-paths → the identical 404",
  tplSeating.status === 200 && tplSeating.data?.guestList?.guests?.length === 0 && tplRefused.length === 0,
  `${tplSeating.status} ${tplRefused.join(", ")}`,
);

const tplList = await staffCall(sessionOwner, templatesApiOf(restaurantA.id));
const tplListed = tplList.data?.templates?.find((template) => template.id === tplId);
const eventsWithTpl = await staffCall(sessionOwner, eventsApiOf(restaurantA.id));
const restaurantPageTpl = await staffCall(sessionManager, restaurantPageOf(restaurantA.id));
const restaurantPageArchive = await staffCall(sessionOwner, restaurantPageOf(restaurantA.id, "archiwum"));
const eventCountWithTpl = await listedCountA();
const linksListed = (await listEvents(platformEnv)).some((event) => event.id === tplId);
check(
  "templates: listed with their counters for the restaurant and on its page („Szablony sal”), never in the event lists, tabs, the platform's event counter or npm run links",
  tplList.status === 200 &&
    JSON.stringify(tplListed) ===
      JSON.stringify({ id: tplId, name: TPL_NAME, roomCount: 1, tableCount: 2, seatCount: 10, hasPlan: true }) &&
    eventsWithTpl.status === 200 &&
    !["upcoming", "past", "archived"].some((list) => listIds(eventsWithTpl, list).includes(tplId)) &&
    restaurantPageTpl.status === 200 &&
    restaurantPageTpl.body.includes("data-templates-section") &&
    restaurantPageTpl.body.includes(`data-template-id="${String(tplId)}"`) &&
    eventRow(restaurantPageTpl, tplId) === "" &&
    eventRow(restaurantPageArchive, tplId) === "" &&
    eventCountBefore >= 1 &&
    eventCountWithTpl === eventCountBefore &&
    !linksListed,
  `${tplList.status} ${JSON.stringify(tplListed)} ${eventCountBefore}/${eventCountWithTpl} ${String(linksListed)}`,
);

const tplKeys = await readEventKeys(platformEnv, tplId);
const tplKeyDenied = [];
for (const kind of LINK_KINDS) {
  const key = kind === "organizer" ? tplKeys.organizerKey : kind === "tv" ? tplKeys.tvKey : tplKeys.restaurantKey;
  if (!(await linkDenied(kind, key))) tplKeyDenied.push(kind);
}
const tplKeyVenue = await request(`/api/o/${tplKeys.organizerKey}/venue`);
const tplKeyPlan = await request(`/api/tv/${tplKeys.tvKey}/plan/image`);
check(
  "templates: a template's keys (from the database) open nothing — /o/, /tv/, /r/ pages and APIs, its venue and plan image give the identical denial of an unknown key",
  tplKeys.isTemplate === true && tplKeyDenied.length === 0 && noAccessJson(tplKeyVenue) && noAccessJson(tplKeyPlan),
  `${String(tplKeys.isTemplate)} ${tplKeyDenied.join(",")} ${tplKeyVenue.status} ${tplKeyPlan.status}`,
);

const swapRefused = [];
for (const [method, path] of [
  ["GET", eventApi(tplId)],
  ["PATCH", eventApi(tplId)],
  ["DELETE", eventApi(tplId)],
  ["GET", `${eventApi(tplId)}/klient/venue`],
  ["GET", `${eventApi(tplId)}/reset`],
  ["GET", `${eventApi(tplId)}/ai-topics`],
  ["POST", `${eventApi(tplId)}/links/tv`],
  ["GET", `${eventApi(tplId)}/from-template/${String(tplId)}`],
  ["GET", templateApi(eventA.id)],
  ["DELETE", templateApi(eventA.id)],
  ["GET", `${templateSala(eventA.id)}/venue`],
  ["GET", `${eventApi(eventA.id)}/from-template/${String(eventA.id)}`],
  ["GET", templateApi("abc")],
  ["GET", templateApi(2_000_000_000)],
  ["GET", `${templateSala("abc")}/venue`],
  ["GET", `${eventApi(eventA.id)}/from-template/abc`],
]) {
  const res = await staffCall(sessionOwner, path, method === "PATCH" ? { method, json: { name: "x" } } : { method });
  if (!noAccessJson(res)) swapRefused.push(`${method} ${path}: ${String(res.status)}`);
}
const tplAsEventPage = await staffCall(sessionOwner, eventPage(tplId));
const tplAsPreview = await staffCall(sessionOwner, `${eventPage(tplId)}/sale`);
const eventAsTplPage = await staffCall(sessionOwner, templatePage(eventA.id));
check(
  "templates: a template id through every event route and page, an event id through the template routes and page, malformed and unknown ids → the identical 404 / no-access page",
  swapRefused.length === 0 &&
    isNoAccessPage(tplAsEventPage) &&
    isNoAccessPage(tplAsPreview) &&
    isNoAccessPage(eventAsTplPage),
  swapRefused.join("; "),
);

const outsiders = [];
for (const [who, token] of [
  ["waiter", sessionWaiter],
  ["owner B", sessionB],
  ["admin", sessionAdmin],
]) {
  for (const [method, path, json] of [
    ["GET", templatesApiOf(restaurantA.id)],
    ["POST", templatesApiOf(restaurantA.id), { name: "Obcy" }],
    ["GET", templateApi(tplId)],
    ["PATCH", templateApi(tplId), { name: "Obcy" }],
    ["DELETE", templateApi(tplId)],
    ["GET", `${templateSala(tplId)}/venue`],
    ["POST", `${templateSala(tplId)}/rooms`, { name: "Obca" }],
    ["GET", `${eventApi(eventA.id)}/from-template/${String(tplId)}`],
    ["POST", `${eventApi(eventA.id)}/from-template/${String(tplId)}`],
  ]) {
    const res = await staffCall(token, path, json ? { method, json } : { method });
    if (!noAccessJson(res)) outsiders.push(`${who} ${method} ${path}: ${String(res.status)}`);
  }
  const page = await staffCall(token, templatePage(tplId));
  if (!isNoAccessPage(page)) outsiders.push(`${who} page: ${String(page.status)}`);
}
const ownerBFromA = await staffCall(sessionB, templatesApiOf(restaurantB.id), {
  method: "POST",
  json: { name: "Z cudzego", sourceEventId: eventA.id },
});
const noSessionTpl = await staffCall(null, templateApi(tplId));
const noSessionSala = await staffCall(null, `${templateSala(tplId)}/venue`);
const foreignTpl = await staffCall(sessionOwner, templatesApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "Obcy Origin" },
  extraHeaders: FOREIGN,
});
const foreignSala = await staffCall(sessionOwner, `${templateSala(tplId)}/rooms`, {
  method: "POST",
  json: { name: "Obcy Origin" },
  extraHeaders: FOREIGN,
});
const badName = await staffCall(sessionOwner, templatesApiOf(restaurantA.id), { method: "POST", json: { name: "  " } });
const extraField = await staffCall(sessionOwner, templatesApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "x", guests: [] },
});
const tplUntouched = await staffCall(sessionOwner, templateApi(tplId));
check(
  "templates: a waiter, owner B and the admin outside support mode → the identical 404 on every template route and page; owner B cannot copy event A's room (404); no session → 401; a foreign Origin → 403; an empty name or an unknown field → 400; the template is unchanged",
  outsiders.length === 0 &&
    noAccessJson(ownerBFromA) &&
    noSessionTpl.status === 401 &&
    noSessionSala.status === 401 &&
    foreignTpl.status === 403 &&
    foreignSala.status === 403 &&
    badName.status === 400 &&
    errorOf(badName) === "Podaj nazwę szablonu." &&
    extraField.status === 400 &&
    tplUntouched.status === 200 &&
    tplUntouched.data?.template?.name === TPL_NAME &&
    tplUntouched.data.template.roomCount === 1,
  `${outsiders.join("; ")} | ${ownerBFromA.status} ${noSessionTpl.status} ${foreignTpl.status} ${foreignSala.status} ${badName.status} ${extraField.status}`,
);

const tplPageOwner = await staffCall(sessionOwner, templatePage(tplId));
const tplPageEn = await staffCall(sessionOwner, templatePage(tplId), {
  extraHeaders: { Cookie: `${asStaff(sessionOwner)}; kp-lang=en` },
});
check(
  "templates: the template page renders the name form and the venue editor (PL and EN)",
  tplPageOwner.status === 200 &&
    tplPageOwner.body.includes(`data-template-page="${String(tplId)}"`) &&
    tplPageOwner.body.includes("data-template-header") &&
    tplPageOwner.body.includes("Szablon sali") &&
    tplPageEn.status === 200 &&
    tplPageEn.body.includes("Venue template"),
  `${tplPageOwner.status} ${tplPageEn.status}`,
);

// Event A's room → a template (a copy: the same tables, other rows).
const venueA31 = await staffCall(sessionOwner, `${eventApi(eventA.id)}/klient/venue`);
const fromEvent = await staffCall(sessionOwner, templatesApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Sala A smoke ${RUN_TAG}`, sourceEventId: eventA.id },
});
const fromEventId = fromEvent.data?.template?.id ?? 0;
const fromEventVenue = await staffCall(sessionOwner, `${templateSala(fromEventId)}/venue`);
const tableNamesOf = (res) => (res.data?.tables ?? []).map((table) => table.name).join("|");
check(
  "templates: „Zapisz salę jako szablon” copies event A's room (same tables, own rows); the event is unchanged",
  venueA31.status === 200 &&
    fromEvent.status === 201 &&
    fromEvent.data?.template?.tableCount === venueA31.data?.tables?.length &&
    fromEventVenue.status === 200 &&
    tableNamesOf(fromEventVenue) === tableNamesOf(venueA31) &&
    !(fromEventVenue.data?.tables ?? []).some((table) => venueA31.data.tables.some((other) => other.id === table.id)) &&
    tableNamesOf(await staffCall(sessionOwner, `${eventApi(eventA.id)}/klient/venue`)) === tableNamesOf(venueA31),
  `${venueA31.status} ${fromEvent.status} ${fromEventVenue.status}`,
);

// A new event from the template: its room is ready; another restaurant's template → 404.
const tplBCreated = await staffCall(sessionB, templatesApiOf(restaurantB.id), {
  method: "POST",
  json: { name: `Sala B smoke ${RUN_TAG}` },
});
const tplBId = tplBCreated.data?.template?.id ?? 0;
const fromTemplateEvent = await staffCall(sessionManager, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Z szablonu smoke ${RUN_TAG}`, date: shiftDate(today, 40), templateId: tplId },
});
const fromForeignTemplate = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Z cudzego szablonu ${RUN_TAG}`, date: shiftDate(today, 40), templateId: tplBId },
});
const fromEventAsTemplate = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Z wydarzenia ${RUN_TAG}`, date: shiftDate(today, 40), templateId: eventA.id },
});
const nEvent = fromTemplateEvent.data?.event;
const nVenue = nEvent ? await staffCall(sessionOwner, `${eventApi(nEvent.id)}/klient/venue`) : null;
const tplVenueNow = await staffCall(sessionOwner, `${templateSala(tplId)}/venue`);
const eventCountAfter = await listedCountA();
check(
  "templates: a manager creates an event from the template — the client's link opens a copy of its room (T1, T2, own rows); another restaurant's template or an event id as the template → 404; the platform counter grows by the event only",
  tplBCreated.status === 201 &&
    fromTemplateEvent.status === 201 &&
    hasFreshLinks(nEvent) &&
    nVenue?.status === 200 &&
    tableNamesOf(nVenue) === "T1|T2" &&
    nVenue.data?.plan?.byteSize === TINY_PNG.length &&
    !(nVenue.data?.tables ?? []).some((table) => tplVenueNow.data?.tables?.some((other) => other.id === table.id)) &&
    noAccessJson(fromForeignTemplate) &&
    noAccessJson(fromEventAsTemplate) &&
    eventCountAfter === eventCountBefore + 1,
  `${tplBCreated.status} ${fromTemplateEvent.status} ${nVenue?.status} ${tableNamesOf(nVenue ?? {})} ${fromForeignTemplate.status} ${fromEventAsTemplate.status} ${eventCountBefore}→${eventCountAfter}`,
);

// „Zaktualizuj z szablonu”: two guests seated by the client; the template loses T2 and T1 shrinks to 2 seats.
const nClientApi = `/api/o/${keyOfPath(nEvent?.links?.organizer)}`;
const S15_GUESTS = [`Ula S15 ${RUN_TAG}`, `Iza S15 ${RUN_TAG}`, `Ewa S15 ${RUN_TAG}`];
const nGuests = await request(`${nClientApi}/guests`, { method: "POST", json: { text: S15_GUESTS.join("\n") } });
const guestIdOf = (name) => nGuests.data?.guests?.find((guest) => guest.displayName === name)?.id ?? 0;
const nTableId = (name) => nVenue?.data?.tables?.find((table) => table.name === name)?.id ?? 0;
const seatsN = [];
for (const [guest, table, seat] of [
  [S15_GUESTS[0], "T1", 3],
  [S15_GUESTS[1], "T2", 5],
  [S15_GUESTS[2], "T1", 1],
]) {
  const res = await request(`${nClientApi}/seating/guests/${String(guestIdOf(guest))}`, {
    method: "PUT",
    json: { tableId: nTableId(table), seat },
  });
  seatsN.push(res.status);
}
const tplT2Id = tplVenueNow.data?.tables?.find((table) => table.name === "T2")?.id ?? 0;
const tplT1Id = tplVenueNow.data?.tables?.find((table) => table.name === "T1")?.id ?? 0;
const tplDropT2 = await staffCall(sessionOwner, `${templateSala(tplId)}/tables/${String(tplT2Id)}`, {
  method: "DELETE",
});
const tplShrinkT1 = await staffCall(sessionOwner, `${templateSala(tplId)}/tables/${String(tplT1Id)}`, {
  method: "PATCH",
  json: { seatCount: 2 },
});
const nVenueUnchanged = await staffCall(sessionOwner, `${eventApi(nEvent?.id ?? 0)}/klient/venue`);
check(
  "templates: changing the template (delete T2, shrink T1) never touches the event created from it",
  nGuests.status === 201 &&
    seatsN.every((status) => status === 200) &&
    tplDropT2.status === 200 &&
    tplShrinkT1.status === 200 &&
    tableNamesOf(nVenueUnchanged) === "T1|T2" &&
    nVenueUnchanged.data?.tables?.find((table) => table.name === "T1")?.seatCount === 4,
  `${nGuests.status} ${seatsN.join(",")} ${tplDropT2.status} ${tplShrinkT1.status}`,
);

const updateApi = `${eventApi(nEvent?.id ?? 0)}/from-template/${String(tplId)}`;
const preview31 = await staffCall(sessionManager, updateApi);
const lost31 = (preview31.data?.preview?.lost ?? []).map(
  (seat) => `${seat.guestName}@${seat.table}:${String(seat.seat)}`,
);
const foreignApply = await staffCall(sessionManager, updateApi, { method: "POST", extraHeaders: FOREIGN });
const applied31 = await staffCall(sessionManager, updateApi, { method: "POST" });
const boardN = await request(`${nClientApi}/seating`);
const seatedNames = (boardN.data?.assignments ?? []).map(
  (row) => boardN.data.guestList.guests.find((guest) => guest.id === row.guestId)?.displayName,
);
const nVenueUpdated = await staffCall(sessionOwner, `${eventApi(nEvent?.id ?? 0)}/klient/venue`);
check(
  "templates: „Zaktualizuj z szablonu” previews who loses a seat (the guests at T2 and above T1's new size), a foreign Origin → 403, then the manager's apply unseats exactly them, keeps the rest and the room becomes the template's",
  preview31.status === 200 &&
    JSON.stringify(lost31) === JSON.stringify([`${S15_GUESTS[0]}@T1:3`, `${S15_GUESTS[1]}@T2:5`]) &&
    JSON.stringify(preview31.data.preview.tablesRemoved) === JSON.stringify(["T2"]) &&
    JSON.stringify(preview31.data.preview.tablesResized) === JSON.stringify(["T1"]) &&
    foreignApply.status === 403 &&
    applied31.status === 200 &&
    applied31.data?.result?.seatsBefore === 3 &&
    applied31.data.result.seatsAfter === 1 &&
    applied31.data.result.tablesRemoved === 1 &&
    applied31.data.preview?.lost?.length === 0 &&
    JSON.stringify(seatedNames) === JSON.stringify([S15_GUESTS[2]]) &&
    tableNamesOf(nVenueUpdated) === "T1" &&
    nVenueUpdated.data?.tables?.[0]?.seatCount === 2,
  `${preview31.status} ${JSON.stringify(lost31)} ${foreignApply.status} ${applied31.status} ${JSON.stringify(applied31.data?.result)} ${JSON.stringify(seatedNames)}`,
);

// The admin in support mode reads templates, never writes; then leaves.
const enter31 = await enterSupport(sessionAdmin, restaurantA.id);
const supportTplApi = await staffCall(sessionAdmin, templateApi(tplId));
const supportTplList = await staffCall(sessionAdmin, templatesApiOf(restaurantA.id));
const supportTplVenue = await staffCall(sessionAdmin, `${templateSala(tplId)}/venue`);
const supportTplPage = await staffCall(sessionAdmin, templatePage(tplId));
const supportTplWrites = [];
for (const [method, path, json] of [
  ["PATCH", templateApi(tplId), { name: "Wsparcie" }],
  ["DELETE", templateApi(tplId)],
  ["POST", `${templateSala(tplId)}/rooms`, { name: "Wsparcie" }],
  ["POST", templatesApiOf(restaurantA.id), { name: "Wsparcie" }],
  ["POST", updateApi],
]) {
  const res = await staffCall(sessionAdmin, path, json ? { method, json } : { method });
  if (!noAccessJson(res)) supportTplWrites.push(`${method} ${path}: ${String(res.status)}`);
}
const exit31 = await endSupportOf(sessionAdmin, restaurantA.id);
check(
  "templates: the admin in support mode reads the templates, their room and the page (static, read-only, no name form); every write → the identical 404",
  enter31.status === 201 &&
    supportTplApi.status === 200 &&
    supportTplList.status === 200 &&
    supportTplVenue.status === 200 &&
    supportTplPage.status === 200 &&
    supportTplPage.body.includes("data-read-only") &&
    !supportTplPage.body.includes("data-template-header") &&
    supportTplWrites.length === 0 &&
    exit31.status === 200,
  `${enter31.status} ${supportTplApi.status} ${supportTplVenue.status} ${supportTplPage.status} ${supportTplWrites.join("; ")} ${exit31.status}`,
);

// Rename and delete: the events created from it keep their own rooms.
const renamed31 = await staffCall(sessionManager, templateApi(tplId), {
  method: "PATCH",
  json: { name: `${TPL_NAME} 2` },
});
const deleted31 = await staffCall(sessionManager, templateApi(tplId), { method: "DELETE" });
const goneTpl = await staffCall(sessionOwner, templateApi(tplId));
const goneTplSala = await staffCall(sessionOwner, `${templateSala(tplId)}/venue`);
const nAfterDelete = await staffCall(sessionOwner, `${eventApi(nEvent?.id ?? 0)}/klient/venue`);
const fromEventDeleted = await staffCall(sessionOwner, templateApi(fromEventId), { method: "DELETE" });
const tplBDeleted = await staffCall(sessionB, templateApi(tplBId), { method: "DELETE" });
check(
  "templates: the manager renames and deletes the template; afterwards it is the identical 404 and the event made from it keeps its room",
  renamed31.status === 200 &&
    renamed31.data?.template?.name === `${TPL_NAME} 2` &&
    deleted31.status === 200 &&
    deleted31.data?.deleted === true &&
    deleted31.data.restaurantId === restaurantA.id &&
    noAccessJson(goneTpl) &&
    noAccessJson(goneTplSala) &&
    tableNamesOf(nAfterDelete) === "T1" &&
    fromEventDeleted.status === 200 &&
    tplBDeleted.status === 200,
  `${renamed31.status} ${deleted31.status} ${goneTpl.status} ${nAfterDelete.status} ${fromEventDeleted.status} ${tplBDeleted.status}`,
);

// 32. Menu catalog with courses (menu-catalog-courses, S-16; FR-037, FR-027, US-07). The manager keeps restaurant A's
// catalog (five courses, prices), an event of A created here gets a reduced menu, the client orders only from it (free
// text → 400 while the menu is active, lines take the menu's spelling, course and the event's price), a catalog price
// change never moves an ordered line, the tablet lists the kitchen's prep by course without prices, and switching the
// menu off brings free text back. A waiter, owner B and the admin outside support mode → the identical 404 on every
// menu route; owner B cannot put its own item on A's event; no session → 401; a foreign Origin → 403; support mode
// reads only. Uses the sessions of 25–31. Runs last: restaurant A has a catalog afterwards.
const menuApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/menu`;
const menuItemApi = (restaurantId, itemId) => `${menuApiOf(restaurantId)}/${String(itemId)}`;
const eventMenuApi = (id) => `${eventApi(id)}/menu`;
const menuPageOf = (restaurantId) => `/panel/restauracje/${String(restaurantId)}/menu`;

const e32 = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Menu smoke ${RUN_TAG}`, date: futureDate },
});
const e32Id = e32.data?.event?.id ?? 0;
const e32Key = keyOfPath(e32.data?.event?.links?.organizer);
const e32Tablet = keyOfPath(e32.data?.event?.links?.restaurant);
const e32Api = `/api/o/${e32Key}`;
const before32 = await request(`${e32Api}/orders`);
const legacy32 = await request(`${e32Api}/orders`, { method: "POST", json: { name: "Barszcz", quantity: 1 } });
check(
  "menu: a new event of a restaurant without a catalog takes free text as before (menu inactive)",
  e32.status === 201 &&
    before32.status === 200 &&
    before32.data?.menu?.active === false &&
    legacy32.status === 201 &&
    legacy32.data?.items?.[0]?.course === null,
  `${e32.status} ${before32.status} ${JSON.stringify(before32.data?.menu)} ${legacy32.status}`,
);

const MENU32 = [
  ["Tatar", "starter", "32"],
  ["Rosół", "soup", "18,50"],
  ["Schabowy", "main", "45"],
  ["Pierogi", "main", "29"],
  ["Sernik", "dessert", "16"],
  ["Lemoniada", "drinks", "12"],
];
const added32 = [];
for (const [name, course, price] of MENU32) {
  added32.push(
    await staffCall(sessionManager, menuApiOf(restaurantA.id), { method: "POST", json: { name, course, price } }),
  );
}
const catalog32 = added32.at(-1)?.data;
const itemId32 = (name) => catalog32?.items?.find((item) => item.name === name)?.id ?? 0;
check(
  "menu: the manager adds dishes and drinks in all five courses → 201, the catalog by course (starters, soups, mains, desserts, drinks) with prices in grosze",
  added32.every((res) => res.status === 201) &&
    JSON.stringify(catalog32?.items?.map((item) => [item.name, item.course, item.priceGrosze])) ===
      JSON.stringify([
        ["Tatar", "starter", 3200],
        ["Rosół", "soup", 1850],
        ["Pierogi", "main", 2900],
        ["Schabowy", "main", 4500],
        ["Sernik", "dessert", 1600],
        ["Lemoniada", "drinks", 1200],
      ]),
  added32.map((res) => res.status).join(" "),
);

const badName32 = await staffCall(sessionManager, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "  ", course: "main", price: "1" },
});
const badCourse32 = await staffCall(sessionManager, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "Śniadanie", course: "breakfast", price: "1" },
});
const badPrice32 = await staffCall(sessionManager, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "Śniadanie", course: "main", price: "abc" },
});
const extra32 = await staffCall(sessionManager, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "Śniadanie", course: "main", price: "1", id: 5 },
});
const dup32 = await staffCall(sessionManager, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "rosół", course: "main", price: "1" },
});
const patched32 = await staffCall(sessionManager, menuItemApi(restaurantA.id, itemId32("Sernik")), {
  method: "PATCH",
  json: { price: "17" },
});
check(
  "menu: an empty name, an unknown course, a bad price and an unknown field → 400; the same name in another letter case → 409; a price change → 200",
  badName32.status === 400 &&
    badCourse32.status === 400 &&
    badCourse32.data?.error === "Wybierz kurs." &&
    badPrice32.status === 400 &&
    extra32.status === 400 &&
    dup32.status === 409 &&
    patched32.status === 200 &&
    patched32.data?.items?.find((item) => item.name === "Sernik")?.priceGrosze === 1700,
  `${badName32.status} ${badCourse32.status} ${badPrice32.status} ${extra32.status} ${dup32.status} ${patched32.status}`,
);

const itemB32 = await staffCall(sessionB, menuApiOf(restaurantB.id), {
  method: "POST",
  json: { name: "Danie B", course: "main", price: "10" },
});
const itemB32Id = itemB32.data?.items?.[0]?.id ?? 0;
const outsiders32 = [];
for (const [who, token] of [
  ["waiter", sessionWaiter],
  ["owner B", sessionB],
  ["admin", sessionAdmin],
]) {
  for (const [method, path, json] of [
    ["GET", menuApiOf(restaurantA.id)],
    ["POST", menuApiOf(restaurantA.id), { name: "Obce", course: "main", price: "1" }],
    ["PATCH", menuItemApi(restaurantA.id, itemId32("Tatar")), { price: "1" }],
    ["DELETE", menuItemApi(restaurantA.id, itemId32("Tatar"))],
    ["GET", eventMenuApi(e32Id)],
    ["PUT", eventMenuApi(e32Id), { mode: "off" }],
  ]) {
    const res = await staffCall(token, path, json ? { method, json } : { method });
    if (!noAccessJson(res)) outsiders32.push(`${who} ${method} ${path}: ${String(res.status)}`);
  }
  const page = await staffCall(token, menuPageOf(restaurantA.id));
  if (!isNoAccessPage(page)) outsiders32.push(`${who} page: ${String(page.status)}`);
}
const foreignIds32 = [];
for (const [method, path, json] of [
  ["PATCH", menuItemApi(restaurantA.id, itemB32Id), { price: "1" }],
  ["DELETE", menuItemApi(restaurantA.id, itemB32Id)],
  ["PATCH", menuItemApi(restaurantA.id, "abc"), { price: "1" }],
  ["DELETE", menuItemApi(restaurantA.id, 2_000_000_000)],
  ["PUT", eventMenuApi(e32Id), { mode: "reduced", itemIds: [itemId32("Tatar"), itemB32Id] }],
  // (owner A also belongs to B by now — section 28 — so B's event is checked through owner B's session above)
  ["GET", eventMenuApi(2_000_000_000)],
  ["GET", eventMenuApi("abc")],
]) {
  const res = await staffCall(sessionOwner, path, json ? { method, json } : { method });
  if (!noAccessJson(res)) foreignIds32.push(`${method} ${path}: ${String(res.status)}`);
}
const ownerBOwn = await staffCall(sessionB, menuApiOf(restaurantB.id));
const noSession32 = await staffCall(null, menuApiOf(restaurantA.id));
const noSessionEvent32 = await staffCall(null, eventMenuApi(e32Id));
const foreign32 = await staffCall(sessionOwner, menuApiOf(restaurantA.id), {
  method: "POST",
  json: { name: "Obcy Origin", course: "main", price: "1" },
  extraHeaders: FOREIGN,
});
const foreignEvent32 = await staffCall(sessionOwner, eventMenuApi(e32Id), {
  method: "PUT",
  json: { mode: "off" },
  extraHeaders: FOREIGN,
});
const stillFull32 = await staffCall(sessionOwner, eventMenuApi(e32Id));
check(
  "menu: a waiter, owner B and the admin outside support mode → the identical 404 on every menu route and page; B's item on A's catalog or A's event, unknown and malformed ids → the same 404, nothing changed; no session → 401; a foreign Origin → 403",
  itemB32.status === 201 &&
    outsiders32.length === 0 &&
    foreignIds32.length === 0 &&
    ownerBOwn.status === 200 &&
    ownerBOwn.data?.items?.length === 1 &&
    noSession32.status === 401 &&
    noSessionEvent32.status === 401 &&
    foreign32.status === 403 &&
    foreignEvent32.status === 403 &&
    stillFull32.status === 200 &&
    stillFull32.data?.mode === "full" &&
    stillFull32.data.items.every((item) => item.available),
  `${outsiders32.join("; ")} | ${foreignIds32.join("; ")} | ${noSession32.status} ${foreign32.status} ${foreignEvent32.status} ${stillFull32.data?.mode}`,
);

const reduced32 = await staffCall(sessionManager, eventMenuApi(e32Id), {
  method: "PUT",
  json: { mode: "reduced", itemIds: ["Tatar", "Rosół", "Schabowy", "Lemoniada"].map(itemId32) },
});
const board32 = await request(`${e32Api}/orders`);
check(
  "menu: the manager sets a reduced menu; the client's board shows exactly those items by course with prices, without catalog ids",
  reduced32.status === 200 &&
    reduced32.data?.mode === "reduced" &&
    reduced32.data.items.filter((item) => item.available).length === 4 &&
    board32.status === 200 &&
    board32.data?.menu?.active === true &&
    JSON.stringify(board32.data.menu.items) ===
      JSON.stringify([
        { name: "Tatar", course: "starter", priceGrosze: 3200 },
        { name: "Rosół", course: "soup", priceGrosze: 1850 },
        { name: "Schabowy", course: "main", priceGrosze: 4500 },
        { name: "Lemoniada", course: "drinks", priceGrosze: 1200 },
      ]),
  `${reduced32.status} ${board32.status} ${JSON.stringify(board32.data?.menu)}`,
);

const freeText32 = await request(`${e32Api}/orders`, { method: "POST", json: { name: "Kebab", quantity: 1 } });
const offMenu32 = await request(`${e32Api}/orders`, { method: "POST", json: { name: "Sernik", quantity: 1 } });
const withPrice32 = await request(`${e32Api}/orders`, {
  method: "POST",
  json: { name: "Rosół", quantity: 1, price: "1" },
});
const fromMenu32 = await request(`${e32Api}/orders`, { method: "POST", json: { name: "rosół", quantity: 2 } });
const rosolLine = fromMenu32.data?.items?.find((item) => item.course === "soup");
const legacyLine = fromMenu32.data?.items?.find((item) => item.name === "Barszcz");
const legacyEdit32 = await request(`${e32Api}/orders/${String(legacyLine?.id ?? 0)}`, {
  method: "PATCH",
  json: { quantity: 3 },
});
const renameOff32 = await request(`${e32Api}/orders/${String(rosolLine?.id ?? 0)}`, {
  method: "PATCH",
  json: { name: "Kebab" },
});
check(
  "menu: the client's free text and an item outside the reduced menu → 400; a price in the body → 400; a menu item in any letter case → 201 with the menu's spelling, course and price; a line from before the menu still edits; a rename off the menu → 400",
  freeText32.status === 400 &&
    freeText32.data?.error === "Tej pozycji nie ma w menu wydarzenia. Wybierz z listy." &&
    offMenu32.status === 400 &&
    withPrice32.status === 400 &&
    fromMenu32.status === 201 &&
    rosolLine?.name === "Rosół" &&
    rosolLine.unitPriceGrosze === 1850 &&
    rosolLine.quantity === 2 &&
    legacyEdit32.status === 200 &&
    renameOff32.status === 400,
  `${freeText32.status} ${offMenu32.status} ${withPrice32.status} ${fromMenu32.status} ${JSON.stringify(rosolLine)} ${legacyEdit32.status} ${renameOff32.status}`,
);

const repriced32 = await staffCall(sessionManager, menuItemApi(restaurantA.id, itemId32("Rosół")), {
  method: "PATCH",
  json: { price: "25" },
});
const afterPrice32 = await request(`${e32Api}/orders`);
const tablet32 = await request(`/api/r/${e32Tablet}/orders`);
check(
  "menu: a catalog price change keeps the ordered line's price and the event's price of that name (the bill does not move); the tablet's prep is grouped by course (soup before the free-text line), without prices",
  repriced32.status === 200 &&
    repriced32.data?.items?.find((item) => item.name === "Rosół")?.priceGrosze === 2500 &&
    afterPrice32.data?.items?.find((item) => item.course === "soup")?.unitPriceGrosze === 1850 &&
    afterPrice32.data?.menu?.items?.find((item) => item.name === "Rosół")?.priceGrosze === 1850 &&
    tablet32.status === 200 &&
    JSON.stringify(tablet32.data?.prep?.map((line) => [line.course, line.name, line.quantity])) ===
      JSON.stringify([
        ["soup", "Rosół", 2],
        [null, "Barszcz", 3],
      ]) &&
    !/Grosze|price/i.test(tablet32.body),
  `${repriced32.status} ${JSON.stringify(afterPrice32.data?.items?.map((item) => [item.name, item.unitPriceGrosze]))} ${tablet32.status} ${JSON.stringify(tablet32.data?.prep)}`,
);

const catalogPage32 = await staffCall(sessionManager, menuPageOf(restaurantA.id));
const catalogPageEn32 = await staffCall(sessionManager, menuPageOf(restaurantA.id), {
  extraHeaders: { Cookie: `${asStaff(sessionManager)}; kp-lang=en` },
});
const restaurantPage32 = await staffCall(sessionManager, restaurantPageOf(restaurantA.id));
const eventPage32 = await staffCall(sessionManager, eventPage(e32Id));
const clientPage32 = await request(`/o/${e32Key}/zamowienia`);
check(
  "menu: the catalog page (PL and EN), the restaurant page's „Menu lokalu” section, the event card's „Menu wydarzenia” and the client's order page with the menu list render",
  catalogPage32.status === 200 &&
    catalogPage32.body.includes(`data-menu-page="${String(restaurantA.id)}"`) &&
    catalogPage32.body.includes("data-menu-catalog") &&
    catalogPage32.body.includes("Dania główne") &&
    catalogPageEn32.status === 200 &&
    catalogPageEn32.body.includes("Restaurant menu") &&
    restaurantPage32.body.includes("data-menu-section") &&
    eventPage32.status === 200 &&
    eventPage32.body.includes('data-event-menu="reduced"') &&
    clientPage32.status === 200 &&
    clientPage32.body.includes("data-menu-select") &&
    clientPage32.body.includes("Przystawki"),
  `${catalogPage32.status} ${catalogPageEn32.status} ${restaurantPage32.status} ${eventPage32.status} ${clientPage32.status}`,
);

const enter32 = await enterSupport(sessionAdmin, restaurantA.id);
const supportCatalog32 = await staffCall(sessionAdmin, menuApiOf(restaurantA.id));
const supportEventMenu32 = await staffCall(sessionAdmin, eventMenuApi(e32Id));
const supportPage32 = await staffCall(sessionAdmin, menuPageOf(restaurantA.id));
const supportWrites32 = [];
for (const [method, path, json] of [
  ["POST", menuApiOf(restaurantA.id), { name: "Wsparcie", course: "main", price: "1" }],
  ["PATCH", menuItemApi(restaurantA.id, itemId32("Tatar")), { price: "1" }],
  ["DELETE", menuItemApi(restaurantA.id, itemId32("Tatar"))],
  ["PUT", eventMenuApi(e32Id), { mode: "off" }],
]) {
  const res = await staffCall(sessionAdmin, path, json ? { method, json } : { method });
  if (!noAccessJson(res)) supportWrites32.push(`${method} ${path}: ${String(res.status)}`);
}
const exit32 = await endSupportOf(sessionAdmin, restaurantA.id);
check(
  "menu: the admin in support mode reads the catalog, the event menu and a static catalog page (no forms); every write → the identical 404",
  enter32.status === 201 &&
    supportCatalog32.status === 200 &&
    supportCatalog32.data?.items?.length === MENU32.length &&
    supportEventMenu32.status === 200 &&
    supportPage32.status === 200 &&
    supportPage32.body.includes("data-menu-item") &&
    !supportPage32.body.includes("data-menu-catalog") &&
    supportWrites32.length === 0 &&
    exit32.status === 200,
  `${enter32.status} ${supportCatalog32.status} ${supportEventMenu32.status} ${supportPage32.status} ${supportWrites32.join("; ")} ${exit32.status}`,
);

const off32 = await staffCall(sessionOwner, eventMenuApi(e32Id), { method: "PUT", json: { mode: "off" } });
const freeAgain32 = await request(`${e32Api}/orders`, { method: "POST", json: { name: "Kebab", quantity: 1 } });
const removed32 = await staffCall(sessionOwner, menuItemApi(restaurantA.id, itemId32("Rosół")), { method: "DELETE" });
const afterRemove32 = await request(`${e32Api}/orders`);
const deleted32 = await staffCall(sessionOwner, eventApi(e32Id), { method: "DELETE" });
check(
  "menu: switching the event's menu off brings free text back; deleting a catalog item keeps the line ordered from it (name, course, price); the event is deleted",
  off32.status === 200 &&
    off32.data?.mode === "off" &&
    off32.data.items.every((item) => !item.available) &&
    freeAgain32.status === 201 &&
    removed32.status === 200 &&
    afterRemove32.data?.menu?.active === false &&
    JSON.stringify(
      afterRemove32.data?.items
        ?.filter((item) => item.course === "soup")
        .map((item) => [item.name, item.unitPriceGrosze]),
    ) === JSON.stringify([["Rosół", 1850]]) &&
    deleted32.status === 200,
  `${off32.status} ${freeAgain32.status} ${removed32.status} ${deleted32.status}`,
);

// 33. Event modules (event-modules, S-17; FR-031, US-07, NFR-023). A new event of A (panel) has AI topics and the
// guessing game off and the paid AI topics locked. Each module switched off by the client → its organizer routes 409
// `module-off` (link and the staff dispatcher alike), its guest routes the identical 404 of a wrong key, the guest
// token and the TV token change, its data survives → on again → the data is back. The venue (owner, manager) offers
// or withdraws a module (never lead-gated), the client switches only offered ones (lead rule: staff through the
// dispatcher while „Lokal prowadzi”), a paid module waits for the platform administrator's unlock, which works only
// inside a support visit and lands in the owner's log. A waiter, owner B and unknown or malformed ids → the identical
// 404; no session → 401; a foreign Origin → 403. Events A/B (created with every module) keep every v1 module on.
const modulesApi = (id) => `${eventApi(id)}/modules`;
const unlockApi = (id, module) => `/api/panel/platform/events/${String(id)}/modules/${module}`;
const activeOf = (res) =>
  Object.fromEntries((Array.isArray(res.data?.modules) ? res.data.modules : []).map((m) => [m.key, m.active]));
const isModuleOff = (res, module) =>
  res.status === 409 && res.data?.code === "module-off" && res.data?.module === module;

const modulesA = await request(`/api/o/${eventA.organizerKey}/modules`);
check(
  "modules: events A/B (every module) keep questions, AI topics, the game, the draw and the TV screen on",
  modulesA.status === 200 &&
    ["questions", "aiTopics", "guessing", "seatingDraw", "tvSpotlight"].every(
      (key) => activeOf(modulesA)[key] === true,
    ),
  `${modulesA.status} ${JSON.stringify(activeOf(modulesA))}`,
);

const e33 = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Moduły smoke ${RUN_TAG}`, date: futureDate },
});
const e33Id = e33.data?.event?.id ?? 0;
const e33Key = keyOfPath(e33.data?.event?.links?.organizer);
const e33Tv = keyOfPath(e33.data?.event?.links?.tv);
const e33Api = `/api/o/${e33Key}`;
const defaults33 = await request(`${e33Api}/modules`);
const guessesOff33 = await request(`${e33Api}/guesses`);
const aiOff33 = await request(`${e33Api}/ai-topics`, { method: "POST", json: { category: null } });
const aiEntry33 = defaults33.data?.modules?.find((m) => m.key === "aiTopics");
check(
  "modules: a new event has questions, the draw and the TV screen on, AI topics and the game off (AI paid and locked); the game's and AI's organizer routes → 409 module-off",
  e33.status === 201 &&
    defaults33.status === 200 &&
    JSON.stringify(activeOf(defaults33)) ===
      JSON.stringify({
        questions: true,
        aiTopics: false,
        guessing: false,
        seatingDraw: true,
        tvSpotlight: true,
        pubQuiz: false,
      }) &&
    aiEntry33?.paid === true &&
    aiEntry33.unlocked === false &&
    isModuleOff(guessesOff33, "guessing") &&
    isModuleOff(aiOff33, "aiTopics"),
  `${e33.status} ${defaults33.status} ${JSON.stringify(activeOf(defaults33))} ${guessesOff33.status} ${aiOff33.status}`,
);

// A guest with access, for the phone side.
await request(`${e33Api}/guests`, { method: "POST", json: { text: "Ala Moduł\nOla Moduł" } });
await request(`${e33Api}/guest-links`, { method: "PATCH", json: { enabled: true } });
const links33 = await request(`${e33Api}/guest-links`);
const g33 = links33.data?.guests?.[0]?.key ?? "";
const gApi33 = `/api/g/${g33}`;
const badGuess33 = await request(`/api/g/${"A".repeat(24)}/guess`, { method: "PUT", json: { amount: "100" } });
const guessOffGuest33 = await request(`${gApi33}/guess`, { method: "PUT", json: { amount: "100" } });
const stateOff33 = await request(`${gApi33}/state`);
check(
  "modules: with the game off the guest's guess route gives the identical denial of a wrong key and the phone state says the game is off",
  g33.length === 24 &&
    noAccessJson(badGuess33) &&
    guessOffGuest33.status === 404 &&
    guessOffGuest33.body === badGuess33.body &&
    stateOff33.status === 200 &&
    stateOff33.data?.modules?.guessing === false &&
    stateOff33.data?.modules?.questions === true,
  `${g33.length} ${guessOffGuest33.status} ${guessOffGuest33.body} ${JSON.stringify(stateOff33.data?.modules)}`,
);

const enable = (module, enabled, api = e33Api) =>
  request(`${api}/modules`, { method: "PUT", json: { module, enabled } });
const gameOn33 = await enable("guessing", true);
const saved33 = await request(`${gApi33}/guess`, { method: "PUT", json: { amount: "1500" } });
const stateOn33 = await request(`${gApi33}/state`);
const board33 = await request(`${e33Api}/guesses`);
const gameOff33 = await enable("guessing", false);
const boardOff33 = await request(`${e33Api}/guesses`);
const panelOff33 = await staffCall(sessionOwner, `${eventApi(e33Id)}/klient/guesses`);
const stateOff33b = await request(`${gApi33}/state?since=${encodeURIComponent(stateOn33.data?.version ?? "")}`);
const shellOff33 = await request(`/o/${e33Key}`);
const pageOff33 = await request(`/o/${e33Key}/strzaly`);
const guestPage33 = await request(`/g/${g33}`);
const gameBack33 = await enable("guessing", true);
const boardBack33 = await request(`${e33Api}/guesses`);
check(
  "modules: the game on → a guess is saved; off → the board 409 (link and dispatcher), the phone's next poll drops it (new token), the shell card is gone, the page says it is off; on again → the same guess is back",
  gameOn33.status === 200 &&
    saved33.status === 200 &&
    stateOn33.data?.modules?.guessing === true &&
    board33.status === 200 &&
    board33.data?.guests?.filter((g) => g.amountGrosze === 150000).length === 1 &&
    gameOff33.status === 200 &&
    isModuleOff(boardOff33, "guessing") &&
    isModuleOff(panelOff33, "guessing") &&
    stateOff33b.status === 200 &&
    stateOff33b.data?.modules?.guessing === false &&
    stateOff33b.data.version !== stateOn33.data?.version &&
    shellOff33.status === 200 &&
    shellOff33.body.includes("data-event-modules") &&
    !shellOff33.body.includes(`/o/${e33Key}/strzaly`) &&
    pageOff33.body.includes('data-module-off="guessing"') &&
    /<div hidden=""[^>]*data-guest-module="guessing"/.test(guestPage33.body) &&
    !/<div hidden=""[^>]*data-guest-module="questions"/.test(guestPage33.body) &&
    gameBack33.status === 200 &&
    boardBack33.status === 200 &&
    boardBack33.data?.guests?.filter((g) => g.amountGrosze === 150000).length === 1,
  `${gameOn33.status} ${saved33.status} ${board33.status} ${boardOff33.status} ${panelOff33.status} ${stateOff33b.status} ${pageOff33.status} ${boardBack33.status}`,
);

await request(`${e33Api}/questions`, {
  method: "POST",
  json: { category: "generyczne", text: "Pytanie modułu smoke?" },
});
const questions33 = await request(`${e33Api}/questions`);
const qOff33 = await enable("questions", false);
const qOrganizer33 = await request(`${e33Api}/questions`);
const qGuest33 = await request(`${gApi33}/questions/draw`, { method: "POST", json: { category: null } });
const qState33 = await request(`${gApi33}/state`);
const qOn33 = await enable("questions", true);
const qBack33 = await request(`${e33Api}/questions`);
const qGuestBack33 = await request(`${gApi33}/questions/draw`, { method: "POST", json: { category: null } });
check(
  "modules: questions off → the base 409, the guest's draw the identical 404, the phone hides the section; on → the same base and the draw work",
  questions33.status === 200 &&
    qOff33.status === 200 &&
    isModuleOff(qOrganizer33, "questions") &&
    qGuest33.status === 404 &&
    qGuest33.body === badGuess33.body &&
    qState33.data?.modules?.questions === false &&
    qOn33.status === 200 &&
    qBack33.status === 200 &&
    qBack33.data?.questions?.length === questions33.data?.questions?.length &&
    qGuestBack33.status === 200,
  `${questions33.status} ${qOrganizer33.status} ${qGuest33.status} ${qBack33.status} ${qGuestBack33.status}`,
);

const shown33 = await request(`${e33Api}/tv-spotlight`, {
  method: "PUT",
  json: { kind: "question", text: "Moduł na TV smoke?" },
});
const tvOn33 = await request(`/api/tv/${e33Tv}/seating`);
const tvOff33 = await enable("tvSpotlight", false);
const spotOff33 = await request(`${e33Api}/tv-spotlight`);
const tvPollOff33 = await request(`/api/tv/${e33Tv}/seating?since=${encodeURIComponent(tvOn33.data?.version ?? "")}`);
const tvBack33 = await enable("tvSpotlight", true);
const tvPollBack33 = await request(`/api/tv/${e33Tv}/seating`);
check(
  "modules: „Pokaż na TV” off → its routes 409 and the TV's next poll drops the spotlight (new token); on → the same spotlight is back",
  shown33.status === 200 &&
    tvOn33.data?.spotlight?.text === "Moduł na TV smoke?" &&
    tvOff33.status === 200 &&
    isModuleOff(spotOff33, "tvSpotlight") &&
    tvPollOff33.status === 200 &&
    tvPollOff33.data?.spotlight === null &&
    tvPollOff33.data.version !== tvOn33.data?.version &&
    tvBack33.status === 200 &&
    tvPollBack33.data?.spotlight?.text === "Moduł na TV smoke?",
  `${shown33.status} ${spotOff33.status} ${tvPollOff33.status} ${JSON.stringify(tvPollOff33.data?.spotlight)} ${JSON.stringify(tvPollBack33.data?.spotlight)}`,
);

const drawOff33 = await enable("seatingDraw", false);
const draftOff33 = await request(`${e33Api}/seating/draft`, { method: "POST", json: { seats: [] } });
const historyOff33 = await request(`${e33Api}/seating/history`);
const drawPage33 = await request(`/o/${e33Key}/rozsadzenie`);
const drawOn33 = await enable("seatingDraw", true);
check(
  "modules: the seating draw off → its draft route 409 and no draw button; the history stays readable; on again",
  drawOff33.status === 200 &&
    isModuleOff(draftOff33, "seatingDraw") &&
    historyOff33.status === 200 &&
    drawPage33.status === 200 &&
    !drawPage33.body.includes("data-draw-button") &&
    drawOn33.status === 200,
  `${draftOff33.status} ${historyOff33.status} ${drawPage33.status}`,
);

const withdraw33 = await staffCall(sessionOwner, modulesApi(e33Id), {
  method: "PUT",
  json: { module: "questions", available: false },
});
const clientView33 = await request(`${e33Api}/modules`);
const clientTry33 = await enable("questions", true);
const offer33 = await staffCall(sessionManager, modulesApi(e33Id), {
  method: "PUT",
  json: { module: "questions", available: true },
});
const lockedTry33 = await enable("aiTopics", true);
check(
  "modules: the owner withdraws questions (the client sees it unavailable and cannot switch it on: 409 module-unavailable), the manager offers it again (the client's switch kept); a locked paid module → 409 module-locked",
  withdraw33.status === 200 &&
    activeOf(withdraw33).questions === false &&
    clientView33.data?.modules?.find((m) => m.key === "questions")?.available === false &&
    clientTry33.status === 409 &&
    clientTry33.data?.code === "module-unavailable" &&
    offer33.status === 200 &&
    activeOf(offer33).questions === true &&
    lockedTry33.status === 409 &&
    lockedTry33.data?.code === "module-locked",
  `${withdraw33.status} ${clientTry33.status} ${offer33.status} ${lockedTry33.status}`,
);

const leadOn33 = await staffCall(sessionOwner, eventApi(e33Id), { method: "PATCH", json: { venueLeads: true } });
const clientLed33 = await enable("guessing", false);
const staffLed33 = await staffCall(sessionOwner, `${eventApi(e33Id)}/klient/modules`, {
  method: "PUT",
  json: { module: "guessing", enabled: false },
});
const staffOffer33 = await staffCall(sessionOwner, modulesApi(e33Id), {
  method: "PUT",
  json: { module: "pubQuiz", available: false },
});
const leadOff33 = await staffCall(sessionOwner, eventApi(e33Id), { method: "PATCH", json: { venueLeads: false } });
const staffNotLed33 = await staffCall(sessionOwner, `${eventApi(e33Id)}/klient/modules`, {
  method: "PUT",
  json: { module: "guessing", enabled: true },
});
const clientAgain33 = await enable("guessing", true);
check(
  "modules: while the venue leads the client's switch → 409 venue-leads and the staff switch through the dispatcher; the venue's offer works whoever leads; the client leads again → the staff's switch 409 client-leads",
  leadOn33.status === 200 &&
    clientLed33.status === 409 &&
    clientLed33.data?.code === "venue-leads" &&
    staffLed33.status === 200 &&
    activeOf(staffLed33).guessing === false &&
    staffOffer33.status === 200 &&
    leadOff33.status === 200 &&
    staffNotLed33.status === 409 &&
    staffNotLed33.data?.code === "client-leads" &&
    clientAgain33.status === 200,
  `${leadOn33.status} ${clientLed33.status} ${staffLed33.status} ${staffOffer33.status} ${leadOff33.status} ${staffNotLed33.status} ${clientAgain33.status}`,
);

const outsiders33 = [];
for (const [who, token] of [
  ["waiter", sessionWaiter],
  ["owner B", sessionB],
]) {
  for (const [method, json] of [["GET"], ["PUT", { module: "questions", available: false }]]) {
    const res = await staffCall(token, modulesApi(e33Id), json ? { method, json } : { method });
    if (!noAccessJson(res)) outsiders33.push(`${who} ${method}: ${String(res.status)}`);
  }
  const unlock = await staffCall(token, unlockApi(e33Id, "aiTopics"), { method: "PUT", json: { unlocked: true } });
  if (!noAccessJson(unlock)) outsiders33.push(`${who} unlock: ${String(unlock.status)}`);
}
// (Owner A is also an owner of B since section 28, so B's side is checked with owner B's session above.)
for (const path of [modulesApi(999999999), modulesApi("abc")]) {
  const res = await staffCall(sessionOwner, path);
  if (!noAccessJson(res)) outsiders33.push(`owner ${path}: ${String(res.status)}`);
}
const ownerUnlock33 = await staffCall(sessionOwner, unlockApi(e33Id, "aiTopics"), {
  method: "PUT",
  json: { unlocked: true },
});
const noSession33 = await request(modulesApi(e33Id));
const foreign33 = await staffCall(sessionOwner, modulesApi(e33Id), {
  method: "PUT",
  json: { module: "questions", available: true },
  extraHeaders: { Origin: "https://evil.example" },
});
check(
  "modules: a waiter, owner B, unknown and malformed event ids and a non-admin unlock → the identical 404; no session → 401; a foreign Origin → 403",
  outsiders33.length === 0 && noAccessJson(ownerUnlock33) && noSession33.status === 401 && foreign33.status === 403,
  `${outsiders33.join("; ")} ${ownerUnlock33.status} ${noSession33.status} ${foreign33.status}`,
);

const adminOutside33 = await staffCall(sessionAdmin, unlockApi(e33Id, "aiTopics"), {
  method: "PUT",
  json: { unlocked: true },
});
const enter33 = await enterSupport(sessionAdmin, restaurantA.id);
const adminRead33 = await staffCall(sessionAdmin, modulesApi(e33Id));
const adminVenue33 = await staffCall(sessionAdmin, modulesApi(e33Id), {
  method: "PUT",
  json: { module: "questions", available: false },
});
const adminForeign33 = await staffCall(sessionAdmin, unlockApi(e33Id, "aiTopics"), {
  method: "PUT",
  json: { unlocked: true },
  extraHeaders: { Origin: "https://evil.example" },
});
const adminFree33 = await staffCall(sessionAdmin, unlockApi(e33Id, "guessing"), {
  method: "PUT",
  json: { unlocked: true },
});
const adminUnknown33 = [
  await staffCall(sessionAdmin, unlockApi(999999999, "aiTopics"), { method: "PUT", json: { unlocked: true } }),
  await staffCall(sessionAdmin, unlockApi("abc", "aiTopics"), { method: "PUT", json: { unlocked: true } }),
  await staffCall(sessionAdmin, unlockApi(e33Id, "bogus"), { method: "PUT", json: { unlocked: true } }),
  await staffCall(sessionAdmin, unlockApi(eventB.id, "aiTopics"), { method: "PUT", json: { unlocked: true } }),
];
const adminPage33 = await staffCall(sessionAdmin, eventPage(e33Id));
const unlocked33 = await staffCall(sessionAdmin, unlockApi(e33Id, "aiTopics"), {
  method: "PUT",
  json: { unlocked: true },
});
const exit33 = await endSupportOf(sessionAdmin, restaurantA.id);
const log33 = await readLogA();
const unlockEntry33 = logOf(log33).find((entry) => entry.kind === "unlock" && entry.event?.id === e33Id);
const aiOn33 = await enable("aiTopics", true);
const aiGuest33 = await request(`${gApi33}/state`);
check(
  "modules: the admin unlocks a paid module only inside a support visit (outside → 404; venue writes 404; free module 400; unknown ids, another restaurant's event and modules 404; foreign Origin 403), the owner's log names it, then the client switches AI topics on",
  noAccessJson(adminOutside33) &&
    enter33.status === 201 &&
    adminRead33.status === 200 &&
    noAccessJson(adminVenue33) &&
    adminForeign33.status === 403 &&
    adminFree33.status === 400 &&
    adminUnknown33.every(noAccessJson) &&
    adminPage33.status === 200 &&
    adminPage33.body.includes("data-event-modules-section") &&
    unlocked33.status === 200 &&
    unlocked33.data?.modules?.find((m) => m.key === "aiTopics")?.unlocked === true &&
    exit33.status === 200 &&
    unlockEntry33?.module === "aiTopics" &&
    aiOn33.status === 200 &&
    activeOf(aiOn33).aiTopics === true &&
    aiGuest33.data?.modules?.aiTopics === true,
  `${adminOutside33.status} ${enter33.status} ${adminRead33.status} ${adminVenue33.status} ${adminForeign33.status} ${adminFree33.status} ${adminUnknown33.map((r) => r.status).join(",")} ${adminPage33.status} ${unlocked33.status} ${exit33.status} ${JSON.stringify(unlockEntry33)} ${aiOn33.status}`,
);

const deleted33 = await staffCall(sessionOwner, eventApi(e33Id), { method: "DELETE" });
check("modules: the smoke's event is deleted", deleted33.status === 200, String(deleted33.status));

// 34. Branding (event-branding, S-18; FR-032). A new event of A (panel). The client names its company and uploads a
// logo (PNG only through magic bytes: SVG → 415, > 512 KiB → 413, an extra field → 400); the logo comes back with
// `nosniff` and the same bytes through the client, guest, TV and tablet keys, and an unknown kind is the `logoMissing`
// 404. Event B's logo never shows through A's keys (and A's restaurant logo never through B's). The owner sets the
// restaurant's colour (normalised, with its readable text colour), name and logo; the manager reads but cannot write;
// a waiter, owner B and unknown or malformed ids → the identical 404; no session → 401; a foreign Origin → 403. The
// lead rule: while „Lokal prowadzi” is on the client's PATCH → 409 venue-leads and the staff write through the
// dispatcher. The pages carry the brand and never the platform's name; support mode reads only.
const brandApiOf = (restaurantId) => `/api/panel/restaurants/${String(restaurantId)}/branding`;
// „Brak logo.” — or „No logo.” on the tablet's area, which defaults to English.
const LOGO_MISSING = [JSON.stringify({ error: "Brak logo." }), JSON.stringify({ error: "No logo." })];
const isLogoMissing = (res) => res.status === 404 && LOGO_MISSING.includes(new TextDecoder().decode(res.bytes));
const e34 = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Marka smoke ${RUN_TAG}`, date: futureDate },
});
const e34Id = e34.data?.event?.id ?? 0;
const e34Key = keyOfPath(e34.data?.event?.links?.organizer);
const e34Tv = keyOfPath(e34.data?.event?.links?.tv);
const e34Tablet = keyOfPath(e34.data?.event?.links?.restaurant);
const e34Api = `/api/o/${e34Key}`;
await request(`${e34Api}/guests`, { method: "POST", json: { text: "Ala Marka" } });
await request(`${e34Api}/guest-links`, { method: "PATCH", json: { enabled: true } });
const g34 = (await request(`${e34Api}/guest-links`)).data?.guests?.[0]?.key ?? "";
const areas34 = [`/api/o/${e34Key}`, `/api/g/${g34}`, `/api/tv/${e34Tv}`, `/api/r/${e34Tablet}`];

const unbranded34 = await request(`${e34Api}/branding`);
const bLogo34 = await requestBytes(`/api/o/${eventB.organizerKey}/branding/logo`, {
  method: "PUT",
  body: TINY_PNG,
  contentType: "image/png",
});
const aNone34 = await Promise.all(areas34.map((base) => requestBytes(`${base}/branding/logo?kind=event`)));
const bServed34 = await requestBytes(`/api/g/${"A".repeat(24)}/branding/logo?kind=event`);
check(
  "branding: a new event starts unbranded (the restaurant's name only); event B's logo never shows through A's client, guest, TV or tablet key (404 „Brak logo.”), an unknown key → the identical no-access 404",
  e34.status === 201 &&
    g34.length === 24 &&
    unbranded34.status === 200 &&
    unbranded34.data?.client?.name === null &&
    unbranded34.data?.client?.logo === null &&
    unbranded34.data?.restaurant?.logo === null &&
    bLogo34.status === 200 &&
    aNone34.every(isLogoMissing) &&
    bServed34.status === 404 &&
    new TextDecoder().decode(bServed34.bytes) === JSON.stringify({ error: "Brak dostępu" }),
  `${e34.status} ${g34.length} ${unbranded34.status} ${bLogo34.status} ${aNone34.map((r) => r.status).join(",")} ${bServed34.status}`,
);

const named34 = await request(`${e34Api}/branding`, { method: "PATCH", json: { name: "  Acme   Smoke " } });
const tooLong34 = await request(`${e34Api}/branding`, { method: "PATCH", json: { name: "x".repeat(81) } });
const extra34 = await request(`${e34Api}/branding`, { method: "PATCH", json: { name: "Acme", color: "#000000" } });
const svg34 = await requestBytes(`${e34Api}/branding/logo`, {
  method: "PUT",
  body: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  contentType: "image/svg+xml",
});
const big34 = await requestBytes(`${e34Api}/branding/logo`, {
  method: "PUT",
  body: new Uint8Array(512 * 1024 + 1),
  contentType: "image/png",
});
const logo34 = await requestBytes(`${e34Api}/branding/logo`, {
  method: "PUT",
  body: TINY_PNG,
  contentType: "image/png",
});
const served34 = await Promise.all(
  areas34.map((base) =>
    requestBytes(`${base}/branding/logo?kind=event&v=${String(logo34.data?.client?.logo?.version)}`),
  ),
);
const oddKind34 = await requestBytes(`/api/g/${g34}/branding/logo?kind=platform`);
const bOwn34 = await requestBytes(`/api/tv/${eventB.tvKey}/branding/logo?kind=event`);
check(
  "branding: the client names its company (normalised), 81 characters and an extra field → 400, SVG → 415, > 512 KiB → 413; the PNG logo comes back through the client, guest, TV and tablet keys with nosniff and the same bytes, an unknown kind → „Brak logo.”, event B still has its own",
  named34.status === 200 &&
    named34.data?.client?.name === "Acme Smoke" &&
    tooLong34.status === 400 &&
    extra34.status === 400 &&
    svg34.status === 415 &&
    big34.status === 413 &&
    logo34.status === 200 &&
    logo34.data?.client?.logo?.mimeType === "image/png" &&
    served34.every(
      (res) =>
        res.status === 200 &&
        res.contentType === "image/png" &&
        res.nosniff === "nosniff" &&
        res.cacheControl.includes("no-store") &&
        sameBytes(res.bytes, TINY_PNG),
    ) &&
    isLogoMissing(oddKind34) &&
    bOwn34.status === 200 &&
    sameBytes(bOwn34.bytes, TINY_PNG),
  `${named34.status} ${JSON.stringify(named34.data?.client)} ${tooLong34.status} ${extra34.status} ${svg34.status} ${big34.status} ${logo34.status} ${served34.map((r) => `${String(r.status)}/${r.nosniff}`).join(",")} ${oddKind34.status} ${bOwn34.status}`,
);

const before34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id));
const ownerBrand34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { color: "#1E3A8A", name: `Lokal marki ${RUN_TAG}` },
});
const badColor34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { color: "url(x)" },
});
const emptyName34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), { method: "PATCH", json: { name: " " } });
const nothing34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), { method: "PATCH", json: {} });
const rLogo34 = await requestBytes(`${brandApiOf(restaurantA.id)}/logo`, {
  method: "PUT",
  body: TINY_PNG,
  contentType: "image/png",
  cookie: asStaff(sessionOwner),
});
const rSvg34 = await requestBytes(`${brandApiOf(restaurantA.id)}/logo`, {
  method: "PUT",
  body: new TextEncoder().encode("<svg/>"),
  contentType: "image/png",
  cookie: asStaff(sessionOwner),
});
const rServed34 = await Promise.all(areas34.map((base) => requestBytes(`${base}/branding/logo?kind=restaurant`)));
const rPanel34 = await requestBytes(`${brandApiOf(restaurantA.id)}/logo`, { cookie: asStaff(sessionOwner) });
const bRestaurant34 = await requestBytes(`/api/g/${"A".repeat(24)}/branding/logo?kind=restaurant`);
const bRestaurantKey34 = await requestBytes(`/api/o/${eventB.organizerKey}/branding/logo?kind=restaurant`);
const guestBrand34 = await request(`${e34Api}/branding`);
check(
  "branding: the owner sets the colour (#1E3A8A → #1e3a8a with white text), renames the restaurant and uploads its logo; a bad colour, an empty name, an empty body and SVG bytes are refused; the logo shows through every key of A's event and the panel, never through event B (restaurant B has none)",
  before34.status === 200 &&
    ownerBrand34.status === 200 &&
    ownerBrand34.data?.color === "#1e3a8a" &&
    ownerBrand34.data?.textColor === "#ffffff" &&
    ownerBrand34.data?.name === `Lokal marki ${RUN_TAG}` &&
    badColor34.status === 400 &&
    emptyName34.status === 400 &&
    nothing34.status === 400 &&
    rLogo34.status === 200 &&
    rLogo34.data?.logo?.mimeType === "image/png" &&
    rSvg34.status === 415 &&
    rServed34.every((res) => res.status === 200 && res.nosniff === "nosniff" && sameBytes(res.bytes, TINY_PNG)) &&
    rPanel34.status === 200 &&
    rPanel34.nosniff === "nosniff" &&
    sameBytes(rPanel34.bytes, TINY_PNG) &&
    bRestaurant34.status === 404 &&
    isLogoMissing(bRestaurantKey34) &&
    guestBrand34.data?.restaurant?.color === "#1e3a8a" &&
    guestBrand34.data?.restaurant?.name === `Lokal marki ${RUN_TAG}`,
  `${before34.status} ${ownerBrand34.status} ${JSON.stringify(ownerBrand34.data)} ${badColor34.status} ${emptyName34.status} ${nothing34.status} ${rLogo34.status} ${rSvg34.status} ${rServed34.map((r) => r.status).join(",")} ${rPanel34.status} ${bRestaurantKey34.status}`,
);

const managerRead34 = await staffCall(sessionManager, brandApiOf(restaurantA.id));
const managerWrite34 = await staffCall(sessionManager, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { color: "#000000" },
});
const managerLogo34 = await requestBytes(`${brandApiOf(restaurantA.id)}/logo`, {
  method: "PUT",
  body: TINY_PNG,
  contentType: "image/png",
  cookie: asStaff(sessionManager),
});
const outsiders34 = [];
for (const [who, token] of [
  ["waiter", sessionWaiter],
  ["owner B", sessionB],
]) {
  for (const [path, options] of [
    [brandApiOf(restaurantA.id), {}],
    [brandApiOf(restaurantA.id), { method: "PATCH", json: { color: "#000000" } }],
    [`${brandApiOf(restaurantA.id)}/logo`, {}],
    [`${brandApiOf(restaurantA.id)}/logo`, { method: "DELETE" }],
  ]) {
    const res = await staffCall(token, path, options);
    if (!noAccessJson(res)) outsiders34.push(`${who} ${options.method ?? "GET"} ${path}: ${String(res.status)}`);
  }
}
for (const path of [brandApiOf(999999999), brandApiOf("abc"), `${brandApiOf(999999999)}/logo`]) {
  const res = await staffCall(sessionOwner, path);
  if (!noAccessJson(res)) outsiders34.push(`owner ${path}: ${String(res.status)}`);
}
const noSession34 = await request(brandApiOf(restaurantA.id));
const foreign34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { color: "#000000" },
  extraHeaders: FOREIGN,
});
const stillBlue34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id));
check(
  "branding: the manager reads the restaurant's brand but cannot change it (identical 404); a waiter, owner B and unknown or malformed ids → the identical 404; no session → 401; a foreign Origin → 403; nothing changed",
  managerRead34.status === 200 &&
    managerRead34.data?.color === "#1e3a8a" &&
    noAccessJson(managerWrite34) &&
    managerLogo34.status === 404 &&
    managerLogo34.data?.error === "Brak dostępu" &&
    outsiders34.length === 0 &&
    noSession34.status === 401 &&
    foreign34.status === 403 &&
    stillBlue34.data?.color === "#1e3a8a",
  `${managerRead34.status} ${managerWrite34.status} ${managerLogo34.status} ${outsiders34.join("; ")} ${noSession34.status} ${foreign34.status}`,
);

const leadOn34 = await staffCall(sessionOwner, eventApi(e34Id), { method: "PATCH", json: { venueLeads: true } });
const clientLed34 = await request(`${e34Api}/branding`, { method: "PATCH", json: { name: "Klient" } });
const clientLogoLed34 = await requestBytes(`${e34Api}/branding/logo`, { method: "DELETE" });
const staffLed34 = await staffCall(sessionOwner, `${eventApi(e34Id)}/klient/branding`, {
  method: "PATCH",
  json: { name: "Firma personelu" },
});
const staffLogo34 = await requestBytes(`${eventApi(e34Id)}/klient/branding/logo?kind=event`, {
  cookie: asStaff(sessionOwner),
});
const leadOff34 = await staffCall(sessionOwner, eventApi(e34Id), { method: "PATCH", json: { venueLeads: false } });
const staffNotLed34 = await staffCall(sessionOwner, `${eventApi(e34Id)}/klient/branding`, {
  method: "PATCH",
  json: { name: "Znowu personel" },
});
check(
  "branding: while the venue leads the client's brand writes → 409 venue-leads and the staff write through the dispatcher (and read the logo there); the client leads again → the staff's write 409 client-leads",
  leadOn34.status === 200 &&
    clientLed34.status === 409 &&
    clientLed34.data?.code === "venue-leads" &&
    clientLogoLed34.status === 409 &&
    staffLed34.status === 200 &&
    staffLed34.data?.client?.name === "Firma personelu" &&
    staffLogo34.status === 200 &&
    sameBytes(staffLogo34.bytes, TINY_PNG) &&
    leadOff34.status === 200 &&
    staffNotLed34.status === 409 &&
    staffNotLed34.data?.code === "client-leads",
  `${leadOn34.status} ${clientLed34.status} ${clientLogoLed34.status} ${staffLed34.status} ${staffLogo34.status} ${leadOff34.status} ${staffNotLed34.status}`,
);

const guestPage34 = await request(`/g/${g34}`);
const tvPage34 = await request(`/tv/${e34Tv}`);
const tabletPage34 = await request(`/r/${e34Tablet}`);
const cards34 = await request(`/o/${e34Key}/karteczki`);
const shell34 = await request(`/o/${e34Key}`);
const ownerPage34 = await staffCall(sessionOwner, `/panel/restauracje/${String(restaurantA.id)}`);
const managerPage34 = await staffCall(sessionManager, `/panel/restauracje/${String(restaurantA.id)}`);
const eventPage34 = await staffCall(sessionOwner, `/panel/wydarzenia/${String(e34Id)}`);
const home34 = await request("/");
const whiteLabel = (res) =>
  res.status === 200 &&
  !res.body.includes("Kolacja podwyżkowa") &&
  !res.body.includes("Raise dinner") &&
  !res.body.includes("<title>Stolik</title>");
const pageChecks34 = [
  ["white-label", [guestPage34, tvPage34, tabletPage34, cards34].every(whiteLabel)],
  ["guest header", guestPage34.body.includes('data-brand-header="page"')],
  ["guest colour", guestPage34.body.includes("background-color: #1e3a8a; color: #ffffff;")],
  ["guest restaurant name", guestPage34.body.includes(`Lokal marki ${RUN_TAG}`)],
  ["guest client name", guestPage34.body.includes("Firma personelu")],
  ["guest restaurant logo", guestPage34.body.includes(`/api/g/${g34}/branding/logo?kind=restaurant`)],
  ["guest client logo", guestPage34.body.includes(`/api/g/${g34}/branding/logo?kind=event`)],
  ["tv badge", tvPage34.body.includes('data-brand-header="tv"')],
  ["tv logo", tvPage34.body.includes(`/api/tv/${e34Tv}/branding/logo?kind=restaurant`)],
  ["tablet header", tabletPage34.body.includes('data-brand-header="page"')],
  ["tablet logo", tabletPage34.body.includes(`/api/r/${e34Tablet}/branding/logo?kind=event`)],
  ["cards brand", cards34.body.includes("data-card-brand")],
  ["cards stripe", cards34.body.includes("border-top: 2.5mm solid #1e3a8a;")],
  ["cards logo", cards34.body.includes(`/api/o/${e34Key}/branding/logo?kind=event`)],
  ["shell section", shell34.body.includes("data-event-branding")],
  ["shell editor", shell34.body.includes("data-event-branding-editor")],
  ["owner section", ownerPage34.body.includes("data-restaurant-branding")],
  ["owner editor", ownerPage34.body.includes("data-restaurant-branding-editor")],
  ["manager read-only", managerPage34.body.includes("data-brand-read-only")],
  ["manager no editor", !managerPage34.body.includes("data-restaurant-branding-editor")],
  ["event card section", eventPage34.body.includes("data-event-branding-section")],
  ["home product name", home34.body.includes("Stolik")],
];
check(
  "branding: the guest's phone, the TV, the tablet and the QR cards show the restaurant's colour, name and logo and the client's name and logo, never the platform's name; the client shell, the owner's (editor) and the manager's (read-only) restaurant page and the event card carry their sections; the home page is the product's",
  pageChecks34.every(([, ok]) => ok),
  pageChecks34
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
    .join(", "),
);

const enter34 = await enterSupport(sessionAdmin, restaurantA.id);
const adminRead34 = await staffCall(sessionAdmin, brandApiOf(restaurantA.id));
const adminWrite34 = await staffCall(sessionAdmin, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { color: "#000000" },
});
const adminPage34 = await staffCall(sessionAdmin, `/panel/restauracje/${String(restaurantA.id)}`);
const exit34 = await endSupportOf(sessionAdmin, restaurantA.id);
check(
  "branding: in support mode the admin reads the restaurant's brand (the page read-only, without loading the logo) and cannot change it",
  enter34.status === 201 &&
    adminRead34.status === 200 &&
    adminRead34.data?.color === "#1e3a8a" &&
    noAccessJson(adminWrite34) &&
    adminPage34.status === 200 &&
    adminPage34.body.includes("data-brand-read-only") &&
    !adminPage34.body.includes("/branding/logo?v=") &&
    exit34.status === 200,
  `${enter34.status} ${adminRead34.status} ${adminWrite34.status} ${adminPage34.status} ${exit34.status}`,
);

const restored34 = await staffCall(sessionOwner, brandApiOf(restaurantA.id), {
  method: "PATCH",
  json: { name: before34.data?.name ?? `Restauracja smoke A ${RUN_TAG}` },
});
const deleted34 = await staffCall(sessionOwner, eventApi(e34Id), { method: "DELETE" });
check(
  "branding: restaurant A gets its name back and the smoke's event is deleted",
  restored34.status === 200 && deleted34.status === 200,
  `${restored34.status} ${deleted34.status}`,
);

// 35. Scale (scale-150, S-19; FR-033, NFR-011). A new event of A (panel) filled through the organizer API to the new
// limits: 150 guests (the 151st → 400), 3 rooms, 60 tables — 4 rectangular of 30 seats, the rest round of 4 — (a
// 31-seat table and the 61st table → 400), every guest seated through one draft, published; the TV poll and a guest
// poll at full size answer 200 with 60 tables and 150 names, then 204 with their own version. The answers' sizes and
// times are printed (the load estimate in CLAUDE.md is built from `npm run load:local`). The event is deleted.
const e35 = await staffCall(sessionOwner, eventsApiOf(restaurantA.id), {
  method: "POST",
  json: { name: `Skala smoke ${RUN_TAG}`, date: futureDate },
});
const e35Id = e35.data?.event?.id ?? 0;
const e35Key = keyOfPath(e35.data?.event?.links?.organizer);
const e35Tv = keyOfPath(e35.data?.event?.links?.tv);
const e35Api = `/api/o/${e35Key}`;
const names35 = Array.from({ length: 150 }, (_, index) => `Gość skali ${String(index + 1)}`);
const guests35 = await request(`${e35Api}/guests`, { method: "POST", json: { text: names35.join("\n") } });
const extraGuest35 = await request(`${e35Api}/guests`, { method: "POST", json: { text: "Gość skali 151" } });
const rooms35 = [];
for (const name of ["Sala A", "Sala B", "Sala C"]) {
  const added = await request(`${e35Api}/rooms`, { method: "POST", json: { name } });
  rooms35.push(added.data?.rooms?.find((room) => room.name === name)?.id ?? 0);
}
const tableStatuses35 = [];
for (let index = 0; index < 60; index++) {
  const long = index < 4;
  const added = await request(`${e35Api}/tables`, {
    method: "POST",
    json: {
      roomId: rooms35[index % 3],
      name: `T${String(index + 1)}`,
      seatCount: long ? 30 : 4,
      shape: long ? "rectangular" : "round",
      x: Math.round((0.05 + (index % 10) * 0.1) * 1000) / 1000,
      y: Math.round((0.08 + Math.floor(index / 10) * 0.16) * 1000) / 1000,
    },
  });
  tableStatuses35.push(added.status);
}
const tooBig35 = await request(`${e35Api}/tables`, {
  method: "POST",
  json: { roomId: rooms35[0], name: "Za duży", seatCount: 31, shape: "round", x: 0.5, y: 0.95 },
});
const extraTable35 = await request(`${e35Api}/tables`, {
  method: "POST",
  json: { roomId: rooms35[0], name: "T61", seatCount: 4, shape: "round", x: 0.5, y: 0.95 },
});
check(
  "scale: an event takes 150 guests and 60 tables with 30-seat ones; the 151st guest, a 31-seat table and the 61st table → 400",
  e35.status === 201 &&
    guests35.status === 201 &&
    (guests35.data?.guests?.length ?? 0) === 150 &&
    extraGuest35.status === 400 &&
    rooms35.every((id) => id > 0) &&
    tableStatuses35.every((status) => status === 201) &&
    tooBig35.status === 400 &&
    extraTable35.status === 400,
  `${e35.status} ${guests35.status}/${String(guests35.data?.guests?.length)} ${extraGuest35.status} ${tableStatuses35.filter((status) => status !== 201).join(",")} ${tooBig35.status} ${extraTable35.status}`,
);

const venue35 = await request(`${e35Api}/venue`);
const seats35 = [];
const ids35 = (guests35.data?.guests ?? []).map((guest) => guest.id);
// The 30-seat tables first, so they are full.
for (const table of [...(venue35.data?.tables ?? [])].sort((a, b) => b.seatCount - a.seatCount)) {
  for (let seat = 1; seat <= table.seatCount && seats35.length < ids35.length; seat++) {
    seats35.push({ guestId: ids35[seats35.length], tableId: table.id, seat });
  }
}
const draft35 = await request(`${e35Api}/seating/draft`, { method: "POST", json: { seats: seats35 } });
const publishStarted35 = performance.now();
const publish35 = await request(`${e35Api}/seating/publish`, { method: "POST" });
const publishMs35 = Math.round(performance.now() - publishStarted35);
const tvStarted35 = performance.now();
const tv35 = await request(`/api/tv/${e35Tv}/seating`);
const tvMs35 = Math.round(performance.now() - tvStarted35);
const tvNames35 = (tv35.data?.tables ?? []).reduce((sum, table) => sum + (table.seats?.length ?? 0), 0);
const tvSame35 = await request(`/api/tv/${e35Tv}/seating?since=${encodeURIComponent(tv35.data?.version ?? "")}`);
check(
  "scale: one draft seats all 150 (30-seat tables full), publish 201; the TV poll answers 200 with 60 tables and 150 names, then 204 with its version",
  venue35.status === 200 &&
    (venue35.data?.tables?.length ?? 0) === 60 &&
    seats35.length === 150 &&
    draft35.status === 200 &&
    publish35.status === 201 &&
    tv35.status === 200 &&
    (tv35.data?.tables?.length ?? 0) === 60 &&
    tvNames35 === 150 &&
    (tv35.data?.tables ?? []).filter((table) => table.seatCount === 30 && table.seats?.length === 30).length === 4 &&
    tvSame35.status === 204,
  `${draft35.status} ${publish35.status} (${String(publishMs35)} ms) tv ${tv35.status} ${String(Buffer.byteLength(tv35.body))} B ${String(tvMs35)} ms, ${String(tv35.data?.tables?.length)} tables ${String(tvNames35)} names, again ${tvSame35.status}`,
);

const links35 = await request(`${e35Api}/guest-links`, { method: "PATCH", json: { enabled: true } });
const g35 = links35.data?.guests?.[0]?.key ?? "";
const stateStarted35 = performance.now();
const state35 = await request(`/api/g/${g35}/state`);
const stateMs35 = Math.round(performance.now() - stateStarted35);
const drawingNames35 = (state35.data?.drawing?.tables ?? []).reduce(
  (sum, table) => sum + (table.seats?.length ?? 0),
  0,
);
const stateSame35 = await request(`/api/g/${g35}/state?since=${encodeURIComponent(state35.data?.version ?? "")}`);
const stateBytes35 = Buffer.byteLength(state35.body);
check(
  "scale: a guest poll at full size answers 200 with the seat, 30 tablemates' table and the whole drawing (60 tables, 150 names) under 100 KB, then 204 with its version",
  links35.status === 200 &&
    g35.length === 24 &&
    state35.status === 200 &&
    state35.data?.status === "seated" &&
    (state35.data?.seat?.tablemates?.length ?? 0) === 29 &&
    (state35.data?.drawing?.tables?.length ?? 0) === 60 &&
    drawingNames35 === 150 &&
    stateBytes35 < 100_000 &&
    (state35.data?.version?.length ?? 99) <= 64 &&
    stateSame35.status === 204,
  `${links35.status} ${state35.status} ${String(stateBytes35)} B ${String(stateMs35)} ms, version ${String(state35.data?.version?.length)} chars, ${String(state35.data?.drawing?.tables?.length)} tables ${String(drawingNames35)} names, again ${stateSame35.status}`,
);

const deleted35 = await staffCall(sessionOwner, eventApi(e35Id), { method: "DELETE" });
check("scale: the smoke's full-size event is deleted", deleted35.status === 200, String(deleted35.status));

finish();
