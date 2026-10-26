// HTTP smoke test of the link-key access matrix against a running server (dev or production preview).
// Needs a FRESH database (no event yet): it creates the event through the home page form endpoint.
// Zero dependencies on purpose. Usage: BASE_URL=http://localhost:4321 npm run smoke

import { randomBytes } from "node:crypto";

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

finish();
