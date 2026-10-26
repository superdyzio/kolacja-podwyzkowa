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

async function request(path, { method = "GET" } = {}) {
  const response = await fetch(BASE_URL + path, { method, redirect: "manual", headers: { Origin: BASE_URL } });
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    referrerPolicy: response.headers.get("referrer-policy") ?? "",
    body: await response.text(),
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

finish();
