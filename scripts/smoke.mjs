// HTTP smoke test of the link-key access matrix against a running server (dev or production preview).
// Needs a FRESH database (no event yet): it creates the event through the home page form endpoint.
// Zero dependencies on purpose. Usage: BASE_URL=http://localhost:4321 npm run smoke

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
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

// `json` sends a JSON body; `rawBody` sends the string as is (with a JSON content type).
async function request(path, { method = "GET", json, rawBody } = {}) {
  const headers = { Origin: BASE_URL };
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

finish();
