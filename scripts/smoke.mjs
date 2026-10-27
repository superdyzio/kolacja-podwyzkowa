// HTTP smoke test of the link-key access matrix against a running server (dev or production preview).
// Needs a FRESH database (no event yet): it creates the event through the home page form endpoint.
// Zero dependencies on purpose. Usage: BASE_URL=http://localhost:4321 npm run smoke

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const NO_ACCESS_TEXT = "Ta strona jest dostępna tylko przez link od organizatora.";
const EVENT_NAME = "Kolacja podwyżkowa";
const KEY = "[A-Za-z0-9_-]{24}";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
  if (!ok) failed++;
}

// `json` sends a JSON body; `rawBody` sends the string as is (with a JSON content type); `extraHeaders` are added.
async function request(path, { method = "GET", json, rawBody, extraHeaders = {} } = {}) {
  const headers = { Origin: BASE_URL, ...extraHeaders };
  let body;
  if (json !== undefined || rawBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = rawBody ?? JSON.stringify(json);
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
    body: text,
    data,
  };
}

// Raw bytes in and out (plan image upload and download).
async function requestBytes(path, { method = "GET", body, contentType } = {}) {
  const headers = { Origin: BASE_URL };
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

// 1. Fresh home page offers one-time creation.
const home = await request("/");
check("home renders", home.status === 200, String(home.status));
if (!home.body.includes("Utwórz wydarzenie")) {
  check("home offers event creation (the smoke test needs a database without an event)", false);
  finish();
}

// 2. Creating the event redirects to the organizer view.
const created = await request("/api/event", { method: "POST" });
const organizerKey = new RegExp(`^/o/(${KEY})$`).exec(created.location)?.[1];
check(
  "event creation redirects to the organizer view",
  created.status === 303 && Boolean(organizerKey),
  `${created.status} ${organizerKey ? "/o/<organizer>" : created.location}`,
);
if (!organizerKey) finish();

// 3. Organizer view opens with private headers and shows the TV link.
const organizer = await request(`/o/${organizerKey}`);
const tvKey = new RegExp(`/tv/(${KEY})`).exec(organizer.body)?.[1];
check("organizer view renders", organizer.status === 200, String(organizer.status));
check("organizer view is not cacheable", organizer.cacheControl.includes("no-store"), organizer.cacheControl);
check("organizer view sends no referrer", organizer.referrerPolicy === "no-referrer", organizer.referrerPolicy);
check("organizer view shows the TV link", Boolean(tvKey) && tvKey !== organizerKey);
if (!tvKey) finish();

// 4. TV view opens and never contains the organizer key.
const tv = await request(`/tv/${tvKey}`);
check("TV view renders", tv.status === 200, String(tv.status));
check("TV view does not contain the organizer key", !tv.body.includes(organizerKey));

// 5. A second creation reveals nothing.
const again = await request("/api/event", { method: "POST" });
check(
  "second creation redirects home without a key",
  again.status === 303 && again.location === "/" && again.body === "",
  `${again.status} ${again.location}`,
);

// 6. Home now shows only the no-access message.
const homeAfter = await request("/");
check("home no longer offers creation", homeAfter.status === 200 && !homeAfter.body.includes("Utwórz wydarzenie"));
check("home says access is by link only", homeAfter.body.includes("Dostęp tylko przez link od organizatora"));

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
const MAX_PLAN_BYTES = 5 * 1024 * 1024;
const ROOM_NAME = "Sala Główna Smoke";
const TABLE_NAME = "Okno Smoke";
const tableNamed = (res, name) => res.data?.tables?.find((table) => table.name === name);
const roomNamed = (res, name) => res.data?.rooms?.find((room) => room.name === name);

const emptyVenue = await request(`${api}/venue`);
check(
  "venue starts empty",
  emptyVenue.status === 200 && emptyVenue.body === JSON.stringify({ plan: null, rooms: [], tables: [] }),
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
  "a plan over 5 MB is refused",
  tooLarge.status === 413 && tooLarge.data?.error === "Plik jest za duży — najwyżej 5 MB.",
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
  json: { roomId: gardenId, name: "Taras Smoke", seatCount: 21, shape: "round", x: 0.5, y: 0.5 },
});
check(
  "21 seats are refused",
  tooManySeats.status === 400 && errorOf(tooManySeats) === "Stolik ma od 2 do 20 miejsc.",
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
  json: { roomId: gardenId, name: "Kominek Smoke", seatCount: 10, shape: "rectangular", x: 0.8, y: 0.8 },
});
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
const tvFirstSame = await tvSince(tvFirst.data?.version);
check("TV seating is 204 until the next publish", tvFirstSame.status === 204, String(tvFirstSame.status));

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
check(
  "guest state leaks no keys, ids or other guests",
  leaksFromGuest(aniaState.body, aniaKey).length === 0 && !aniaState.body.includes(GUEST_NAMES[2]),
  leaksFromGuest(aniaState.body, aniaKey).join(" "),
);
const olaState = await request(guestStateApi(olaKey));
check(
  "another guest sees only her own seat",
  olaState.status === 200 &&
    olaState.data?.name === GUEST_NAMES[2] &&
    olaState.data.seat?.seat === 1 &&
    !olaState.body.includes(GUEST_NAMES[0]),
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
  GUEST_NAMES[2],
  "guestId",
  "tableId",
  "snapshotId",
  "access_key",
  "isAbsent",
  "&quot;id&quot;",
  '"id"',
].filter((secret) => phonePage.body.includes(secret));
check("guest page leaks no keys, ids or other guests", phonePageLeaks.length === 0, phonePageLeaks.join(" "));
const olaPage = await request(`/g/${olaKey}`);
check(
  "another guest's page shows only her own name",
  olaPage.status === 200 && olaPage.body.includes(GUEST_NAMES[2]) && !olaPage.body.includes(GUEST_NAMES[0]),
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
const SECRET_WORDS = ["ranking", "correctAmount", '"place"', "distance", "missing"];

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
    Object.keys(aniaGuess0.data.guess).length === 2,
  aniaGuess0.body,
);
const aniaSaved = await request(guessApi(aniaNewKey), { method: "PUT", json: { amount: "1 234,56 zł" } });
check(
  "guest saves her own guess in a Polish format and gets her new state",
  aniaSaved.status === 200 &&
    aniaSaved.data?.guess?.amountGrosze === ANIA_GUESS &&
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

const olaProxy = await request(`${guessesApi}/${ola.id}`, { method: "PUT", json: { amount: "7777,77" } });
check(
  "organizer enters a guess for another guest",
  olaProxy.status === 200 &&
    boardGuest(olaProxy, ola.id)?.amountGrosze === OLA_GUESS &&
    boardGuest(olaProxy, ola.id)?.enteredBy === "organizer" &&
    !isMissingGuess(olaProxy, ola.id),
  `${olaProxy.status} ${olaProxy.body}`,
);
const olaGuessState = await request(guestStateApi(olaKey));
const aniaAfterOla = await guestSince(aniaNewKey, aniaSaved.data?.version);
check(
  "the proxy guess reaches only that guest's phone",
  olaGuessState.data?.guess?.amountGrosze === OLA_GUESS && aniaAfterOla.status === 204,
  `${olaGuessState.body} ${aniaAfterOla.status}`,
);
const aniaStateNow = await request(guestStateApi(aniaNewKey));
const aniaLeaks = leaksIn(withoutVersions(aniaStateNow.data), [OLA_GUESS, CORRECT], [...SECRET_WORDS, GUEST_NAMES[2]]);
const olaLeaks = leaksIn(withoutVersions(olaGuessState.data), [ANIA_GUESS], [...SECRET_WORDS, GUEST_NAMES[0]]);
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
    rankOf(correctSet, ania.id)?.tied === false,
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
    rankOf(aniaTie, ola.id)?.tied === true,
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
    [...SECRET_WORDS, "guess", "amount"],
  ),
  ...leaksIn(tvPageWithGuesses.body, [], ["7 777,77", "7777,77", "5 000,00", "2 222,23", "amountGrosze", "guess"]),
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
  [
    `7${NBSP}777,77`,
    "7 777,77",
    "7777,77",
    `5${NBSP}000,00`,
    "5 000,00",
    "correctAmount",
    "ranking",
    "distanceGrosze",
    GUEST_NAMES[2],
  ],
);
check(
  "guest page shows her own guess in the guess section",
  phoneWithGuess.status === 200 &&
    phoneWithGuess.body.includes("Twój strzał") &&
    phoneWithGuess.body.includes(`2${NBSP}222,23${NBSP}zł`) &&
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
    !olaPhone.body.includes(`2${NBSP}222,23`) &&
    !olaPhone.body.includes(GUEST_NAMES[0]),
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
// reports another provider, every generate check is skipped and one check fails. A guest gets at most 5 topics; a
// failed attempt (header x-ai-mock: fail, honoured only by the mock) does not count; the organizer has no personal
// limit; nothing is stored, so no page shows a topic; the TV gets nothing. Guest access is on here.
const aiApi = `${api}/ai-topics`;
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
  quota.limit === 5 &&
  quota.remaining === remaining &&
  quota.used === 5 - remaining &&
  quota.eventExhausted === false;
const usageText = (used, failed) => JSON.stringify({ used, limit: 300, failed, guestLimit: 5 });
const generatedTopics = [];
const topicLeaks = (body) => generatedTopics.filter((text) => body.includes(text) || body.includes(escapeHtml(text)));

const aiBoard = await request(aiApi);
check(
  "AI board: usage starts at zero, with the limits and the provider (never a key)",
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
    olaPageBeforeAi.body.includes("Zostało 5 z 5") &&
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
  // Ania: one topic per category and one from all; every answer carries her quota.
  let aniaRemaining = 5;
  for (const category of [...QUESTION_CATEGORIES, null]) {
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
    "the failed attempt left the fifth topic available",
    aniaFifth.status === 200 && isTopic(aniaFifth.data?.topic, "refleksyjne") && isQuota(aniaFifth.data.quota, 0),
    aniaFifth.body.slice(0, 200),
  );
  if (typeof aniaFifth.data?.topic?.text === "string") generatedTopics.push(aniaFifth.data.topic.text);
  const aniaSixth = await request(guestAiApi(aniaNewKey), { method: "POST", json: { category: null } });
  check(
    "the sixth topic is refused with a clear Polish message",
    aniaSixth.status === 429 &&
      keysOf(aniaSixth.data) === "error,quota" &&
      aniaSixth.data.error.includes("5 z 5") &&
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
    aniaSixthFailing.status === 429 && aniaSixthFailing.data?.error?.includes("5 z 5"),
    aniaSixthFailing.body,
  );

  // Ola has her own 5.
  const olaTopic = await request(guestAiApi(olaKey), { method: "POST", json: { category: "kontrowersyjne" } });
  check(
    "another guest has her own limit",
    olaTopic.status === 200 && isTopic(olaTopic.data?.topic, "kontrowersyjne") && isQuota(olaTopic.data.quota, 4),
    olaTopic.body.slice(0, 200),
  );
  if (typeof olaTopic.data?.topic?.text === "string") generatedTopics.push(olaTopic.data.topic.text);

  // The organizer: no personal limit; a failure carries a hint about the cause.
  let organizerTopics = 0;
  let organizerUsage = null;
  for (let index = 0; index < 6; index++) {
    const category = index % 2 === 0 ? "refleksyjne" : null;
    const res = await request(aiApi, { method: "POST", json: { category } });
    if (res.status === 200 && keysOf(res.data) === "topic,usage" && isTopic(res.data.topic, category)) {
      organizerTopics++;
      generatedTopics.push(res.data.topic.text);
    }
    organizerUsage = res.data?.usage;
  }
  check(
    "the organizer generates more than 5 topics",
    organizerTopics === 6 && JSON.stringify(organizerUsage) === usageText(12, 1),
    `${organizerTopics} ${JSON.stringify(organizerUsage)}`,
  );
  const organizerFail = await request(aiApi, { method: "POST", json: { category: null }, extraHeaders: AI_FAIL });
  check(
    "a failed organizer attempt: 503 with the reason for the organizer",
    organizerFail.status === 503 &&
      keysOf(organizerFail.data) === "error,hint,usage" &&
      organizerFail.data.error.includes("nie zmniejszyła limitu") &&
      typeof organizerFail.data.hint === "string" &&
      organizerFail.data.hint.length > 0 &&
      JSON.stringify(organizerFail.data.usage) === usageText(12, 2),
    organizerFail.body,
  );
  const organizerExtra = await request(aiApi, { method: "POST", json: { category: null, guestId: ola.id } });
  check("organizer AI topic with an extra key: 400", organizerExtra.status === 400, String(organizerExtra.status));
  const aiBoardAfter = await request(aiApi);
  check(
    "AI board counts every success and every failure",
    aiBoardAfter.status === 200 && JSON.stringify(aiBoardAfter.data?.usage) === usageText(12, 2),
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
      res.status === 200 && generatedTopics.length === 12 && topicLeaks(res.body).length === 0,
      `${res.status} ${topicLeaks(res.body).join(" | ")}`,
    );
  }
  const aniaPageAfterAi = await request(`/g/${aniaNewKey}`);
  check(
    "the guest page renders the used-up quota",
    aniaPageAfterAi.status === 200 &&
      aniaPageAfterAi.body.includes("Zostało 0 z 5") &&
      aniaPageAfterAi.body.includes("5 z 5") &&
      topicLeaks(aniaPageAfterAi.body).length === 0,
    String(aniaPageAfterAi.status),
  );

  // The organizer's AI panel on the questions page and the shell card (no „Wkrótce” card is left).
  const aiPage = await request(`/o/${organizerKey}/pytania`);
  check(
    "questions page has the organizer's AI panel with usage and provider",
    aiPage.status === 200 &&
      aiPage.body.includes('id="tematy-ai"') &&
      aiPage.body.includes("Temat od AI") &&
      aiPage.body.includes("Wygeneruj temat z AI") &&
      aiPage.body.includes("Wykorzystano 12 z 300 · nieudane: 2") &&
      aiPage.body.includes("atrapa AI") &&
      topicLeaks(aiPage.body).length === 0,
    String(aiPage.status),
  );
  const shellWithAi = await request(`/o/${organizerKey}`);
  check(
    "organizer shell links to the AI panel with its summary",
    shellWithAi.status === 200 &&
      shellWithAi.body.includes(`/o/${organizerKey}/pytania#tematy-ai`) &&
      shellWithAi.body.includes("Tematy AI: 12 z 300 · atrapa AI") &&
      countOf(shellWithAi.body, "Wkrótce") === 0,
    String(shellWithAi.status),
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

finish();
