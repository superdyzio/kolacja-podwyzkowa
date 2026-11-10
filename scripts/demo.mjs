// Prepares the LOCAL app's demo restaurant (demo-restaurant, S-29; PRD v2 FR-042) for walking flow 1–7 live
// (docs/scenariusz-pokazu.md). ONE stable „Restauracja demo”, found by its owner wlasciciel@demo.stolik, prepared through
// the HTTP API of a running server in the PRD's order, like people would in the app:
//   1. the platform admin (admin@demo.stolik — the only account written straight to the database) creates the
//      restaurant with its owner's invitation (or finds it and switches it on again);
//   2. the owner sets the demo password and brings the team: a manager and a waiter (fixed e-mails and passwords),
//      and sets the restaurant's guest data term (30 days) and brand (colour, logo);
//   3. the manager enters the restaurant's menu and the venue template „Cały lokal (szablon demo)” (plan, rooms with
//      outlines, tables) — from scripts/demo-data/ (menu.csv, sala.json, a generated plan) or the files given with
//      --menu / --venue / --plan;
//   4. the manager creates the events from the template: the sample company party „Impreza firmowa Acme (demo)” today
//      with 80 guests, „Wigilia firmowa (demo)” (+32 days, run by the venue), „Rocznica firmy (demo)” (+20),
//      „Urodziny Ani (demo)” (−10) and „Komunia Zosi (demo)” (−60, archived, its guests' data purged);
//   5–6. the client prepares the party on its link (30 guests pasted, 50 imported from a CSV with diets, groups, an
//      absent and a pinned guest, a published seating, 30 guesses, 9 order lines from the menu, RSVPs with a dish
//      choice), the waiter works the floor (a refill), a per-event waiter is added; the readouts and prints are
//      checked;
//   then the admin's logged support visit unlocks the paid modules (AI topics, pub quiz), the client runs two pub quiz
//   questions, brands the party, and the exports are checked.
// Every run REFRESHES it: the owner deletes every event (and every other template) and the events are created again
// from the template. The template and the menu are KEPT when they exist (a real plan arranged or a real menu typed in
// the app survives) and rebuilt only with --plan / --venue / --menu / --reset. A real venue too small for the 79
// present guests stops the demo with a message before anything is deleted.
// Local database only (refused for any other SUPABASE_URL); no hosted mode: fixed demo passwords must never exist on a
// public platform (the scenario describes preparing a hosted demo by hand).
// Usage: AI_PROVIDER=mock npm run build && AI_PROVIDER=mock npm run preview, then
//   npm run demo -- [--name "<restaurant name>"] [--plan <image>] [--venue <json>] [--menu <csv>] [--reset]
// (BASE_URL, default http://localhost:4321). Zero dependencies; the pure parts live in scripts/lib/demo-data.mjs.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { URL, URLSearchParams } from "node:url";
import {
  DemoDataError,
  MAX_PLAN_BYTES,
  logoPng,
  normalizeText,
  parseDemoArgs,
  parseMenuCsv,
  parseVenue,
  pickMenuItem,
  planPng,
  seatGuests,
  sniffImageType,
} from "./lib/demo-data.mjs";
import {
  ABSENT,
  DIET_LABELS,
  GROUPS,
  GUEST_DIETS,
  GUESTS,
  IMPORTED_GUESTS,
  PASTED_GUESTS,
  PATCHED_DIETS,
  PINNED,
} from "./lib/demo-guests.mjs";
import { ensureStaffAccount, issueStaffLink, PlatformError, readDbEnv } from "./lib/platform.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const RESTAURANT_NAME = "Restauracja demo";
const TEMPLATE_NAME = "Cały lokal (szablon demo)";
const SCENARIO = "docs/scenariusz-pokazu.md";

// The demo accounts (local demo data only; fixed e-mails and passwords, so every run and the scenario name the same).
const ADMIN = { email: "admin@demo.stolik", name: "Administrator demo", password: "demo-admin-1" };
const OWNER = { email: "wlasciciel@demo.stolik", name: "Właściciel demo", password: "demo-wlasciciel-1" };
const MANAGER = { email: "menedzer@demo.stolik", name: "Menedżer demo", role: "manager", password: "demo-menedzer-1" };
const WAITER = { email: "kelner@demo.stolik", name: "Kelner demo", role: "waiter", password: "demo-kelner-1" };

// The events made from the template every run: days from today, the expected guest count.
const MAIN_EVENT = "Impreza firmowa Acme (demo)";
const VENUE_LED_EVENT = "Wigilia firmowa (demo)";
const TEMPLATE_EVENT = "Rocznica firmy (demo)";
const PAST_EVENT = "Urodziny Ani (demo)";
const PURGED_EVENT = "Komunia Zosi (demo)";
const EVENTS = [
  { name: MAIN_EVENT, days: 0, expectedGuests: 80 },
  { name: VENUE_LED_EVENT, days: 32, expectedGuests: 80 },
  { name: TEMPLATE_EVENT, days: 20, expectedGuests: 60 },
  { name: PAST_EVENT, days: -10, expectedGuests: 30 },
  { name: PURGED_EVENT, days: -60, expectedGuests: null },
];
// client-restaurant-split: the venue-led party's first guests, added by the owner through the panel.
const VENUE_LED_GUESTS = ["Dyrektor Nowak", "Pani Kowalska", "Pan Wiśniewski", "Ola z księgowości"];

// Guesses entered by the organizer, typed in the formats guests use, some with a place prediction (guess-place).
// Bartek and Marta tie exactly (same amount in two spellings); the absent guest has a guess. With the correct amount
// 1500 the ranking shows the podium (Ania, Monika, Maciek) and the hits: Ania 1, Maciek 3, Gosia Kowalska 4 and
// Natalia 5 (a tie at 4 spans 4–5), Paweł 7, Marta 12 (a tie at 10 spans 10–12).
const GUESSES = [
  ["Ania", "1500", "1"],
  ["Bartek", "1 250"],
  ["Kasia", "2000"],
  ["Tomek", "1 800 zł", "5"],
  ["Magda", "999,99"],
  ["Piotrek", "1750"],
  ["Marcin", "3000"],
  ["Zosia", "1 100"],
  ["Michał", "2 499,99 zł"],
  ["Basia", "800"],
  ["Grzesiek", "1650", "2"],
  ["Paweł", "1 337", "7"],
  ["Joasia", "2200"],
  ["Krzysiek", "1900 PLN"],
  ["Monika", "1450,50", "3"],
  ["Łukasz", "2750"],
  ["Wojtek", "1200"],
  ["Natalia", "1 600 zł", "5"],
  ["Iwona", "950"],
  ["Rafał", "2100"],
  ["Marta", "1250 zł", "12"],
  ["Ela", "1 300", "10"],
  ["Darek", "4000", "30"],
  ["Maciek", "1550", "3"],
  ["Karolina", "1 700,-"],
  ["Gosia Kowalska", "1400", "4"],
  ["Gosia Wiśniewska", "2300"],
  ["Staszek „Szef”", "500"],
  ["Pani Halinka", "1850", "15"],
  ["Weronika", "1 999"],
];
// Order lines chosen from the event's menu, whatever the real menu holds: [courses (the first one that has dishes),
// which dish of that course (modulo), quantity, note, for whom]. `for` is a guest, `{ group: i }` (the table of
// GROUPS[i], „na środek stołu”) or null (unassigned). The first line is marked delivered.
const ORDERS = [
  [["soup", "starter"], 0, 1, null, "Ania"],
  [["main"], 1, 1, null, "Bartek"],
  [["main"], 1, 1, "bez kapusty", "Kasia"],
  [["main"], 0, 1, null, "Tomek"],
  [["starter", "soup"], 1, 1, "bez orzechów", "Magda"],
  [["main"], 0, 1, null, PINNED],
  [["starter", "dessert"], 0, 1, null, { group: 1 }],
  [["drinks"], 0, 2, null, { group: 0 }],
  [["dessert", "main"], 1, 1, "na deser, ze świeczką", null],
];
// guest-rsvp-menu (S-25): three guests answer on their links, the client enters ten more and the absent guest's „no”.
const RSVP_BY_GUESTS = ["Ania", "Bartek", "Kasia"];
const RSVP_BY_CLIENT = ["Tomek", "Magda", "Piotrek", "Ola", "Kuba", "Ewa", "Marcin", "Zosia", "Michał", "Basia"];
// pub-quiz (S-28): three questions, two asked; who answers what (option index) per asked question.
const QUIZ = [
  { text: "W którym roku Polska wstąpiła do Unii Europejskiej?", options: ["1999", "2004", "2007"], correct: 1 },
  { text: "Nad jaką rzeką leży Gdańsk?", options: ["Motława", "Warta", "Odra", "Wisłok"], correct: 0 },
  { text: "Ile minut trwa mecz piłki nożnej bez doliczonego czasu?", options: ["80", "90", "100"], correct: 1 },
];
const QUIZ_ANSWERS = [
  { Ania: 1, Bartek: 1, Kasia: 1, Tomek: 0 },
  { Ania: 0, Bartek: 0, Kasia: 2, Tomek: 3 },
];
const QUIZ_RESULTS = [
  ["Ania", 1, 2],
  ["Bartek", 1, 2],
  ["Kasia", 3, 1],
  ["Tomek", 4, 0],
];
const SUPPORT_REASON = "Pokaz trybu wsparcia: przygotowanie restauracji demo";
const BRAND_COLOR = "#7c2d12";
const CLIENT_BRAND = "Acme Polska sp. z o.o.";
const RETENTION_DAYS = 30;
const EVENT_WAITER = "Kuba (na imprezę)";

const HELP = `Restauracja demo do pokazu (scenariusz: ${SCENARIO}).

Użycie (najpierw AI_PROVIDER=mock npm run build i AI_PROVIDER=mock npm run preview):
  npm run demo -- [opcje]

Opcje:
  --name "<nazwa>"  nazwa restauracji demo (domyślnie „${RESTAURANT_NAME}”; zmienia też istniejącą)
  --plan <obraz>    plan lokalu (PNG, JPEG lub WebP, do 4 MB) zamiast wygenerowanego; buduje szablon od nowa
  --venue <json>    sale i stoliki zamiast scripts/demo-data/sala.json; buduje szablon od nowa
  --menu <csv>      menu lokalu zamiast scripts/demo-data/menu.csv (Nazwa;Kurs;Cena;W menu imprezy); buduje menu od nowa
  --reset           buduje od nowa szablon i menu z plików
  --help            ta pomoc

Każde uruchomienie odświeża wydarzenia restauracji demo; szablon „${TEMPLATE_NAME}” i menu lokalu
zostają, jeśli istnieją (np. poprawione w aplikacji). Tylko lokalna baza.`;

// --- Helpers ---------------------------------------------------------------------------------------------------

function fail(message) {
  console.error(message);
  process.exit(1);
}

let dataWritten = false;

async function request(path, { method = "GET", json, form, bytes, contentType, cookie } = {}) {
  const headers = { Origin: BASE_URL, ...(cookie ? { Cookie: cookie } : {}) };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (bytes !== undefined) {
    headers["Content-Type"] = contentType;
    body = bytes;
  }
  let response;
  try {
    response = await fetch(new URL(path, BASE_URL), { method, redirect: "manual", headers, body });
  } catch (error) {
    fail(`Serwer nie odpowiada pod ${BASE_URL} (${error.cause?.code ?? error.message}). Uruchom npm run preview.`);
  }
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookie: response.headers.get("set-cookie") ?? "",
    headers: response.headers,
    text,
    data,
  };
}

// One API step that must answer with `expected`; anything else stops the script and says what is left behind.
async function step(name, path, options, expected = 200) {
  const res = await request(path, options);
  if (res.status !== expected) {
    const detail = res.data?.error ?? res.text.slice(0, 300);
    const problems = res.data?.problems ? ` ${res.data.problems.join(" ")}` : "";
    fail(
      `Krok „${name}” nie powiódł się (HTTP ${res.status}): ${detail}${problems}` +
        (dataWritten
          ? "\nRestauracja demo jest przygotowana tylko częściowo. Uruchom npm run demo ponownie: odświeży wydarzenia" +
            " (z --reset, jeśli przerwała się budowa szablonu albo menu)."
          : ""),
    );
  }
  dataWritten = dataWritten || (options?.method ?? "GET") !== "GET";
  return res.data;
}

const SESSION_COOKIE = /(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/;
// The session cookie of an answer that logged the person in (303 to /panel), else null.
function panelCookieOf(res) {
  const token = SESSION_COOKIE.exec(res.setCookie)?.[1];
  return res.status === 303 && new URL(res.location, BASE_URL).pathname === "/panel" && token
    ? `kp-session=${token}`
    : null;
}
// Sets the password through a one-time link (`/haslo/<token>`), like a person in the browser; the answer logs them in.
async function redeem(path, password) {
  const token = /^\/haslo\/([A-Za-z0-9_-]{43})$/.exec(path ?? "")?.[1];
  if (!token) {
    return null;
  }
  return panelCookieOf(
    await request("/api/auth/password-link", { method: "POST", form: { token, password, repeat: password } }),
  );
}
async function login(email, password) {
  return panelCookieOf(await request("/api/auth/login", { method: "POST", form: { email, password } }));
}
// A demo account's session: its fresh one-time link when there is one, else its demo password, else a new link from
// `issueLink` (the admin's „Nowy link” for the owner, the owner's for the team) that sets the demo password again —
// an account whose password someone changed comes back through the app, never through the database.
async function sessionFor(account, link, issueLink, hint = "") {
  const viaLink = link ? await redeem(link, account.password) : null;
  if (viaLink) {
    return viaLink;
  }
  const viaLogin = await login(account.email, account.password);
  if (viaLogin) {
    return viaLogin;
  }
  const viaNewLink = await redeem(await issueLink(), account.password);
  if (!viaNewLink) {
    fail(`Nie udało się zalogować konta demo ${account.email} (ani hasłem demo, ani nowym linkiem)${hint}.`);
  }
  return viaNewLink;
}

const shiftDate = (date, days) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const href = (path) => new URL(path, BASE_URL).href;
const sameName = (a, b) => normalizeText(a).toLocaleLowerCase("pl") === normalizeText(b).toLocaleLowerCase("pl");

// A file named on the command line: relative to where `npm run demo` was started (npm runs scripts in the package).
const argPath = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
// UTF-8, else Windows-1250 (a Polish Excel's CSV).
function readText(path) {
  const bytes = readFileSync(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250").decode(bytes);
  }
}

// --- 0. Options and data files (nothing is written before they are read and checked) ----------------------------

let options;
let venueFile;
let menuFile;
let planBytes;
let planType;
try {
  options = parseDemoArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }
  const venuePath = options.venue ? argPath(options.venue) : new URL("./demo-data/sala.json", import.meta.url);
  const menuPath = options.menu ? argPath(options.menu) : new URL("./demo-data/menu.csv", import.meta.url);
  let venueJson;
  try {
    venueJson = JSON.parse(readText(venuePath));
  } catch (error) {
    throw new DemoDataError(`Plik sali ${String(venuePath)} nie jest poprawnym JSON-em (${error.message}).`);
  }
  venueFile = parseVenue(venueJson);
  menuFile = parseMenuCsv(readText(menuPath));
  planBytes = options.plan ? readFileSync(argPath(options.plan)) : planPng(venueFile);
  planType = sniffImageType(planBytes);
  if (planType === null) {
    throw new DemoDataError(`Plan ${options.plan ?? ""} nie jest obrazem PNG, JPEG ani WebP.`);
  }
  if (planBytes.length > MAX_PLAN_BYTES) {
    throw new DemoDataError(`Plan ma ${String(planBytes.length)} B, a aplikacja przyjmuje najwyżej 4 MB.`);
  }
} catch (error) {
  fail(
    error instanceof DemoDataError
      ? error.message
      : `Nie udało się odczytać plików demo: ${error instanceof Error ? error.message : String(error)}`,
  );
}
const presentGuests = GUESTS.filter((name) => name !== ABSENT).length;

// --- 1. The platform admin (the ONE account written to the database) creates or finds the restaurant ----------------

let env;
let adminAccount;
try {
  env = readDbEnv({ requireLocal: true });
  console.log(`Baza ${env.host}, serwer ${BASE_URL}.`);
  adminAccount = await ensureStaffAccount(env, { email: ADMIN.email, displayName: ADMIN.name, isPlatformAdmin: true });
} catch (error) {
  fail(error instanceof PlatformError ? error.message : String(error));
}
const adminLink = async (kind) => {
  try {
    return `/haslo/${(await issueStaffLink(env, adminAccount.id, kind, BASE_URL)).token}`;
  } catch (error) {
    fail(error instanceof PlatformError ? error.message : String(error));
  }
};
const adminCookie = await sessionFor(
  ADMIN,
  adminAccount.hasPassword ? null : await adminLink("invite"),
  () => adminLink("reset"),
  " — serwer i .env wskazują różne bazy?",
);

const PLATFORM_API = "/api/panel/platform/restaurants";
const platform = await step("lista restauracji platformy", PLATFORM_API, { cookie: adminCookie });
let restaurant =
  platform.restaurants
    .filter((candidate) => candidate.owners.some((person) => person.email === OWNER.email))
    .sort((a, b) => a.id - b.id)[0] ?? null;
let ownerLink = null;
const restaurantCreated = restaurant === null;
if (restaurantCreated) {
  const created = await step(
    "nowa restauracja demo (administrator)",
    PLATFORM_API,
    {
      method: "POST",
      json: { name: options.name ?? RESTAURANT_NAME, ownerEmail: OWNER.email, ownerName: OWNER.name },
      cookie: adminCookie,
    },
    201,
  );
  restaurant = created.restaurants.find((candidate) => candidate.id === created.restaurantId);
  ownerLink = created.owner.link?.path ?? null;
}
const restaurantId = restaurant.id;
const restaurantPath = `/panel/restauracje/${String(restaurantId)}`;
if (restaurant.disabled) {
  await step("włączenie restauracji demo (administrator)", `${PLATFORM_API}/${String(restaurantId)}`, {
    method: "PATCH",
    json: { disabled: false },
    cookie: adminCookie,
  });
}
const ownerAccountId = restaurant.owners.find((person) => person.email === OWNER.email).accountId;

// --- 2. The owner sets the password and brings the team; the restaurant's settings --------------------------------

const ownerCookie = await sessionFor(OWNER, ownerLink, async () => {
  const answer = await step(
    "nowy link właściciela (administrator)",
    `${PLATFORM_API}/${String(restaurantId)}/owners/${String(ownerAccountId)}/link`,
    { method: "POST", cookie: adminCookie },
  );
  return answer.link.path;
});

const restaurantApi = `/api/panel/restaurants/${String(restaurantId)}`;
let restaurantName = restaurant.name;
if (options.name !== null && options.name !== restaurant.name) {
  const renamed = await step(`nazwa restauracji „${options.name}”`, `${restaurantApi}/branding`, {
    method: "PATCH",
    json: { name: options.name },
    cookie: ownerCookie,
  });
  restaurantName = renamed.name;
}

const teamApi = `${restaurantApi}/team`;
let team = (await step("zespół lokalu", teamApi, { cookie: ownerCookie })).team;
for (const person of [MANAGER, WAITER]) {
  let member = team.members.find((candidate) => candidate.email === person.email);
  let link = null;
  if (!member) {
    const answer = await step(
      `zaproszenie ${person.email}`,
      teamApi,
      { method: "POST", json: { email: person.email, name: person.name, role: person.role }, cookie: ownerCookie },
      201,
    );
    team = answer.team;
    link = answer.invited.link?.path ?? null;
    member = team.members.find((candidate) => candidate.email === person.email);
  } else if (member.role !== person.role) {
    team = (
      await step(`rola ${person.email}`, `${teamApi}/${String(member.accountId)}`, {
        method: "PATCH",
        json: { role: person.role },
        cookie: ownerCookie,
      })
    ).team;
  }
  const accountId = member.accountId;
  person.cookie = await sessionFor(person, link, async () => {
    const answer = await step(`nowy link ${person.email} (właściciel)`, `${teamApi}/${String(accountId)}/link`, {
      method: "POST",
      cookie: ownerCookie,
    });
    return answer.link.path;
  });
}
team = (await step("zespół lokalu po zaproszeniach", teamApi, { cookie: ownerCookie })).team;
for (const [person, role] of [
  [OWNER, "owner"],
  [MANAGER, "manager"],
  [WAITER, "waiter"],
]) {
  const member = team.members.find((candidate) => candidate.email === person.email);
  if (member?.role !== role || !member.hasPassword) {
    fail(`Zespół lokalu demo: ${person.email} nie ma roli ${role} albo hasła.`);
  }
}
const managerCookie = MANAGER.cookie;
const waiterCookie = WAITER.cookie;

// Settings a stable restaurant may have drifted on, set BEFORE the events: the guest data term (a shorter one would
// purge „Urodziny Ani (demo)”) and the brand (colour and logo on every guest, TV and tablet page).
const retention = await step(`retencja danych gości: ${String(RETENTION_DAYS)} dni`, `${restaurantApi}/retention`, {
  method: "PATCH",
  json: { guestRetentionDays: RETENTION_DAYS },
  cookie: ownerCookie,
});
if (retention.guestRetentionDays !== RETENTION_DAYS) {
  fail(`Retencja danych gości lokalu demo nie jest ${String(RETENTION_DAYS)} dni.`);
}
await step("kolor marki lokalu", `${restaurantApi}/branding`, {
  method: "PATCH",
  json: { color: BRAND_COLOR },
  cookie: ownerCookie,
});
await step("logo lokalu", `${restaurantApi}/branding/logo`, {
  method: "PUT",
  bytes: logoPng(240, 96, [124, 45, 18], [253, 230, 138]),
  contentType: "image/png",
  cookie: ownerCookie,
});

// --- Refresh: the template is kept unless rebuilt (checked BEFORE anything is deleted), every event goes -------------

const eventsApi = `${restaurantApi}/events`;
const templatesApi = `${restaurantApi}/templates`;
const rebuildTemplate = options.reset || options.plan !== null || options.venue !== null;
const { templates: oldTemplates } = await step("szablony lokalu", templatesApi, { cookie: ownerCookie });
let template = rebuildTemplate
  ? null
  : (oldTemplates.filter((candidate) => candidate.name === TEMPLATE_NAME).sort((a, b) => a.id - b.id)[0] ?? null);
const fileSeats = venueFile.tables.reduce((sum, table) => sum + table.seats, 0);
if (template && template.seatCount < presentGuests) {
  fail(
    `Szablon „${TEMPLATE_NAME}” ma ${String(template.seatCount)} miejsc, a obecnych gości demo jest ${String(presentGuests)}: ` +
      "dodaj stoliki w edytorze szablonu albo uruchom npm run demo -- --venue <plik> (lub --reset).",
  );
}
if (!template && fileSeats < presentGuests) {
  fail(
    `Plik sali ma ${String(fileSeats)} miejsc, a obecnych gości demo jest ${String(presentGuests)}: dodaj stoliki w pliku (wydarzenia, szablon i menu bez zmian).`,
  );
}
const oldEvents = await step("lista wydarzeń lokalu", eventsApi, { cookie: ownerCookie });
const today = oldEvents.today;
for (const old of [...oldEvents.upcoming, ...oldEvents.past, ...oldEvents.archived]) {
  await step(`usunięcie wydarzenia „${old.name}” (właściciel)`, `/api/panel/events/${String(old.id)}`, {
    method: "DELETE",
    cookie: ownerCookie,
  });
}
for (const old of oldTemplates.filter((candidate) => candidate.id !== template?.id)) {
  await step(`usunięcie szablonu „${old.name}”`, `/api/panel/templates/${String(old.id)}`, {
    method: "DELETE",
    cookie: ownerCookie,
  });
}

// --- 3. The manager: the restaurant's menu and the venue template --------------------------------------------------

const menuApi = `${restaurantApi}/menu`;
let catalog = await step("menu lokalu", menuApi, { cookie: managerCookie });
const rebuildMenu = options.reset || options.menu !== null || catalog.items.length === 0;
if (rebuildMenu) {
  for (const item of catalog.items) {
    catalog = await step(`usunięcie z menu: ${item.name}`, `${menuApi}/${String(item.id)}`, {
      method: "DELETE",
      cookie: managerCookie,
    });
  }
  for (const entry of menuFile) {
    catalog = await step(
      `menu: ${entry.name}`,
      menuApi,
      { method: "POST", json: { name: entry.name, course: entry.course, price: entry.price }, cookie: managerCookie },
      201,
    );
  }
}

if (!template) {
  // Built under a working name and renamed at the end, so a template left half-built by a failed run is never kept.
  const created = await step(
    "nowy szablon sali (menedżer)",
    templatesApi,
    { method: "POST", json: { name: `${TEMPLATE_NAME} — w budowie` }, cookie: managerCookie },
    201,
  );
  const sala = `/api/panel/templates/${String(created.template.id)}/sala`;
  await step("plan lokalu w szablonie", `${sala}/plan`, {
    method: "PUT",
    bytes: planBytes,
    contentType: planType,
    cookie: managerCookie,
  });
  const roomIds = new Map();
  for (const room of venueFile.rooms) {
    const venue = await step(
      `sala ${room.name}`,
      `${sala}/rooms`,
      { method: "POST", json: { name: room.name }, cookie: managerCookie },
      201,
    );
    const roomId = venue.rooms.find((candidate) => sameName(candidate.name, room.name)).id;
    roomIds.set(room.name, roomId);
    if (room.outline) {
      await step(`kontur sali ${room.name}`, `${sala}/rooms/${String(roomId)}`, {
        method: "PATCH",
        json: { outline: room.outline },
        cookie: managerCookie,
      });
    }
  }
  for (const table of venueFile.tables) {
    await step(
      `stolik ${table.name}`,
      `${sala}/tables`,
      {
        method: "POST",
        json: {
          roomId: roomIds.get(table.room),
          name: table.name,
          seatCount: table.seats,
          shape: table.shape,
          x: table.x,
          y: table.y,
          rotation: table.rotation,
        },
        cookie: managerCookie,
      },
      201,
    );
  }
  template = (
    await step("nazwa szablonu", `/api/panel/templates/${String(created.template.id)}`, {
      method: "PATCH",
      json: { name: TEMPLATE_NAME },
      cookie: managerCookie,
    })
  ).template;
  if (template.tableCount !== venueFile.tables.length || template.seatCount !== fileSeats || !template.hasPlan) {
    fail(`Szablon „${TEMPLATE_NAME}” nie ma sali z pliku (${JSON.stringify(template)}).`);
  }
}
const templateId = template.id;

// --- 4. The manager creates the events from the template ----------------------------------------------------------

const events = new Map();
for (const { name, days, expectedGuests } of EVENTS) {
  const created = await step(
    `wydarzenie z szablonu „${name}” (menedżer)`,
    eventsApi,
    {
      method: "POST",
      json: { name, date: shiftDate(today, days), expectedGuests, templateId },
      cookie: managerCookie,
    },
    201,
  );
  events.set(name, created.event);
}
const main = events.get(MAIN_EVENT);
const mainId = String(main.id);
const venueLedId = String(events.get(VENUE_LED_EVENT).id);
const purgedId = String(events.get(PURGED_EVENT).id);
const organizerKey = main.links.organizer.replace(/^\/o\//, "");
const tvKey = main.links.tv.replace(/^\/tv\//, "");
const restaurantKey = main.links.restaurant.replace(/^\/r\//, "");
const api = `/api/o/${organizerKey}`;
const organizerUrl = href(main.links.organizer);

// Every event has the template's room (its own copy; template changes never touch it).
{
  const copied = await step(
    `sala „${TEMPLATE_EVENT}” z szablonu`,
    `/api/panel/events/${String(events.get(TEMPLATE_EVENT).id)}/klient/venue`,
    {
      cookie: managerCookie,
    },
  );
  if (copied.tables.length !== template.tableCount || copied.rooms.length !== template.roomCount) {
    fail(`Wydarzenie „${TEMPLATE_EVENT}” nie dostało sali z szablonu „${TEMPLATE_NAME}”.`);
  }
}
// client-restaurant-split: the venue runs the company Christmas party („Lokal prowadzi”) and adds its first guests
// through the panel; its client link is view-only. The main party stays client-led.
const switched = await step(`lokal prowadzi: ${VENUE_LED_EVENT}`, `/api/panel/events/${venueLedId}`, {
  method: "PATCH",
  json: { venueLeads: true },
  cookie: ownerCookie,
});
if (switched.event.venueLeads !== true) {
  fail(`„Lokal prowadzi” nie włączył się dla „${VENUE_LED_EVENT}”.`);
}
await step(
  `goście przez panel: ${VENUE_LED_EVENT}`,
  `/api/panel/events/${venueLedId}/klient/guests`,
  { method: "POST", json: { text: VENUE_LED_GUESTS.join("\n") }, cookie: ownerCookie },
  201,
);
// Flow 7: after the party the event goes to the archive; 60 days ago is past the 30-day term, so the panel's guard
// purges its guests' data before serving it.
await step(`archiwum: ${PURGED_EVENT}`, `/api/panel/events/${purgedId}`, {
  method: "PATCH",
  json: { archived: true },
  cookie: ownerCookie,
});
const eventLists = await step("listy wydarzeń lokalu", eventsApi, { cookie: ownerCookie });
{
  const listed = [...eventLists.upcoming, ...eventLists.past, ...eventLists.archived].map((entry) => entry.name).sort();
  if (
    JSON.stringify(listed) !== JSON.stringify(EVENTS.map((entry) => entry.name).sort()) ||
    eventLists.archived.length !== 1 ||
    eventLists.past.length !== 1
  ) {
    fail(`Lista wydarzeń lokalu demo to nie pięć wydarzeń demo: ${listed.join(", ")}.`);
  }
}

// menu-catalog-courses (S-16): the main party's menu is the file's „w menu imprezy” dishes that the catalog has (a
// menu typed in the app: all of it).
const reducedIds = catalog.items
  .filter((item) => menuFile.some((entry) => entry.inEvent && sameName(entry.name, item.name)))
  .map((item) => item.id);
const eventMenu = await step(`menu imprezy „${MAIN_EVENT}”`, `/api/panel/events/${mainId}/menu`, {
  method: "PUT",
  json: reducedIds.length > 0 ? { mode: "reduced", itemIds: reducedIds } : { mode: "full" },
  cookie: managerCookie,
});

// --- 5. The client prepares the party on its link: guests, diets, groups, seating -------------------------------

await step("gra w zgadywanie: włączenie (klient)", `${api}/modules`, {
  method: "PUT",
  json: { module: "guessing", enabled: true },
});
await step(
  "lista gości (wklejona)",
  `${api}/guests`,
  { method: "POST", json: { text: PASTED_GUESTS.join("\n") } },
  201,
);
// guest-import-diets (S-23): the rest from the company's spreadsheet as a Polish Excel saves it (UTF-8 with a BOM, `;`,
// a header, quoted cells where needed): the preview first (nothing saved), then the import, all at once.
const csvCell = (text) => (/[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
const importCsv =
  "﻿Imię;Dieta;Uwagi\r\n" +
  IMPORTED_GUESTS.map((name) => {
    const [diet, note] = GUEST_DIETS.get(name) ?? ["", ""];
    return [name, diet, note].map(csvCell).join(";");
  }).join("\r\n") +
  "\r\n";
const importPreview = await step("podgląd importu gości", `${api}/guests/import`, {
  method: "POST",
  json: { text: importCsv, preview: true },
});
if (!importPreview.ready || importPreview.rows.length !== IMPORTED_GUESTS.length) {
  fail(`Podgląd importu gości nie jest gotowy: ${importPreview.problems.join(" ")}`);
}
const imported = await step(
  "import gości z dietami (CSV)",
  `${api}/guests/import`,
  { method: "POST", json: { text: importCsv } },
  201,
);
const guestId = new Map(imported.guests.map((guest) => [guest.displayName, guest.id]));
{
  const missing = GUESTS.filter((name) => !guestId.has(name));
  if (missing.length > 0 || imported.guests.length !== GUESTS.length) {
    fail(`Po wklejeniu i imporcie lista gości się nie zgadza (brakuje: ${missing.join(", ") || "-"}).`);
  }
  const wrongDiets = IMPORTED_GUESTS.filter((name) => {
    const guest = imported.guests.find((candidate) => candidate.displayName === name);
    const [, note, tags] = GUEST_DIETS.get(name) ?? ["", "", []];
    return JSON.stringify(guest?.diets) !== JSON.stringify(tags) || (guest?.dietNote ?? "") !== note;
  });
  if (wrongDiets.length > 0) {
    fail(`Import nie zapisał diet: ${wrongDiets.join(", ")}.`);
  }
}
const idOf = (name) => guestId.get(name);
for (const name of PATCHED_DIETS) {
  const [, note, tags] = GUEST_DIETS.get(name);
  await step(`dieta ${name}`, `${api}/guests/${String(idOf(name))}`, {
    method: "PATCH",
    json: { diets: tags, dietNote: note === "" ? null : note },
  });
}
for (const group of GROUPS) {
  await step(
    `grupa ${group.members.join(" + ")}`,
    `${api}/groups`,
    { method: "POST", json: { guestIds: group.members.map(idOf) } },
    201,
  );
}
await step(`nieobecność ${ABSENT}`, `${api}/guests/${String(idOf(ABSENT))}`, {
  method: "PATCH",
  json: { isAbsent: true },
});

// A whole draft on the event's tables (whatever the template holds: groups on consecutive seats of one side, the
// other present guests spread out), the pinned guest, the publish.
const venue = await step("sala imprezy", `${api}/venue`);
let draft;
try {
  draft = seatGuests({ tables: venue.tables, guests: GUESTS, groups: GROUPS, absent: [ABSENT] });
} catch (error) {
  fail(error instanceof DemoDataError ? error.message : String(error));
}
await step("zapis rozsadzenia", `${api}/seating/draft`, {
  method: "POST",
  json: { seats: draft.map((seat) => ({ guestId: idOf(seat.name), tableId: seat.tableId, seat: seat.seat })) },
});
await step(`przypięcie ${PINNED}`, `${api}/seating/guests/${String(idOf(PINNED))}`, {
  method: "PATCH",
  json: { pinned: true },
});
const board = await step("publikacja na TV", `${api}/seating/publish`, { method: "POST" }, 201);
const tableOfGroup = (index) => draft.find((seat) => seat.name === GROUPS[index].members[0]).tableId;
const tableName = (id) => venue.tables.find((table) => table.id === id)?.name ?? "?";

// guest-import-diets (S-23): the kitchen's tablet counts the present guests' diets and shows each at its seat.
const tabletView = await step("tablet: diety i alergie", `/api/r/${restaurantKey}/orders`);
const expectedDietCounts = Object.keys(DIET_LABELS)
  .map((tag) => ({
    tag,
    count: [...GUEST_DIETS].filter(([name, [, , tags]]) => name !== ABSENT && tags.includes(tag)).length,
  }))
  .filter((entry) => entry.count > 0);
if (
  JSON.stringify(tabletView.diets?.counts) !== JSON.stringify(expectedDietCounts) ||
  (tabletView.diets?.unplaced?.length ?? -1) !== 0
) {
  fail(`Tablet nie pokazuje diet demo (${JSON.stringify(tabletView.diets ?? null).slice(0, 300)}).`);
}
const dietSummary = expectedDietCounts.map((entry) => `${DIET_LABELS[entry.tag]} ${String(entry.count)}`).join(", ");

// Guesses by organizer proxy.
let guessBoard;
for (const [name, amount, place] of GUESSES) {
  guessBoard = await step(`strzał ${name}`, `${api}/guesses/${String(idOf(name))}`, {
    method: "PUT",
    json: place === undefined ? { amount } : { amount, place },
  });
}

// --- 6. Orders from the event's menu (each line takes its dish's price and course), RSVPs -----------------------

let orderBoard = await step("zamówienia: menu imprezy", `${api}/orders`);
if (!orderBoard.menu?.active) {
  fail(`Menu „${MAIN_EVENT}” nie jest aktywne (menu lokalu puste?).`);
}
const menuItems = orderBoard.menu.items;
for (const [courses, pick, quantity, note, target] of ORDERS) {
  const item = pickMenuItem(menuItems, courses, pick);
  const assignment =
    target === null
      ? null
      : typeof target === "string"
        ? { guestId: idOf(target) }
        : { tableId: tableOfGroup(target.group) };
  const added = await step(
    `zamówienie ${item.name}`,
    `${api}/orders`,
    { method: "POST", json: { name: item.name, quantity, note, assignment } },
    201,
  );
  const line = added.items.find((candidate) => !orderBoard.items.some((old) => old.id === candidate.id));
  if (line?.course !== item.course || line.unitPriceGrosze !== item.priceGrosze) {
    fail(`Pozycja „${item.name}” nie wzięła ceny i kursu z menu (${JSON.stringify(line)}).`);
  }
  orderBoard = added;
}
const firstLine = orderBoard.items.reduce((first, line) => (line.id < first.id ? line : first));
orderBoard = await step(`wydane: ${firstLine.name}`, `${api}/orders/${String(firstLine.id)}`, {
  method: "PATCH",
  json: { delivered: true },
});

// guest-rsvp-menu (S-25): the client offers the menu's main courses (else any dishes) until tomorrow 12:00 (Warsaw
// time); three guests answer on their own links (guest access on just for that), the client enters ten more and „nie
// przyjdzie” for the absent guest (no new absence, so the published seating stays up to date).
const RSVP_DEADLINE = `${shiftDate(today, 1)}T12:00`;
const mains = menuItems.filter((item) => item.course === "main").map((item) => item.name);
const rsvpOptions = (mains.length >= 2 ? mains : menuItems.map((item) => item.name)).slice(0, 4);
if (rsvpOptions.length < 2) {
  fail(`Menu „${MAIN_EVENT}” nie ma dwóch dań do wyboru w potwierdzeniach.`);
}
await step("potwierdzenia: termin i dania", `${api}/rsvp`, {
  method: "PATCH",
  json: { deadline: RSVP_DEADLINE, options: rsvpOptions },
});
const rsvpDishOf = (index) => rsvpOptions[index % rsvpOptions.length];
const guestLinks = await step("linki gości: włączenie na potwierdzenia", `${api}/guest-links`, {
  method: "PATCH",
  json: { enabled: true },
});
const guestKeyOf = (name) => guestLinks.guests.find((guest) => guest.displayName === name)?.key ?? "";
for (const [index, name] of RSVP_BY_GUESTS.entries()) {
  const state = await step(`potwierdzenie gościa: ${name}`, `/api/g/${guestKeyOf(name)}/rsvp`, {
    method: "PUT",
    json: { attending: true, dish: rsvpDishOf(index) },
  });
  if (state?.rsvp?.attending !== true || state.rsvp.dish !== rsvpDishOf(index) || state.rsvp.open !== true) {
    fail(`Telefon gościa ${name} nie pokazuje jego potwierdzenia (${JSON.stringify(state?.rsvp ?? null)}).`);
  }
}
await step("linki gości: wyłączenie po potwierdzeniach", `${api}/guest-links`, {
  method: "PATCH",
  json: { enabled: false },
});
for (const [index, name] of RSVP_BY_CLIENT.entries()) {
  await step(`potwierdzenie za gościa: ${name}`, `${api}/rsvp/guests/${String(idOf(name))}`, {
    method: "PUT",
    json: { attending: true, dish: rsvpDishOf(index + RSVP_BY_GUESTS.length) },
  });
}
const rsvpBoard = await step(
  `potwierdzenie za gościa: ${ABSENT} nie przyjdzie`,
  `${api}/rsvp/guests/${String(idOf(ABSENT))}`,
  { method: "PUT", json: { attending: false, dish: null } },
);
{
  const coming = RSVP_BY_GUESTS.length + RSVP_BY_CLIENT.length;
  const counted = Object.fromEntries(rsvpBoard.counts.dishes.map((dish) => [dish.name, dish.count]));
  const { counts } = rsvpBoard;
  const dishesMatch = rsvpOptions.every(
    (name, optionIndex) =>
      (counted[name] ?? 0) ===
      Array.from({ length: coming }, (_, index) => index).filter((index) => index % rsvpOptions.length === optionIndex)
        .length,
  );
  if (
    !rsvpBoard.open ||
    counts.coming !== coming ||
    counts.notComing !== 1 ||
    counts.noAnswer !== GUESTS.length - coming - 1 ||
    counts.noDish !== 0 ||
    !dishesMatch
  ) {
    fail(`Zliczenia potwierdzeń się nie zgadzają: ${JSON.stringify(counts)}.`);
  }
}
const seatingAfterRsvp = await step("rozsadzenie po potwierdzeniach", `${api}/seating`);
if (!seatingAfterRsvp.upToDate) {
  fail("Potwierdzenia zmieniły opublikowane rozsadzenie (nowa nieobecność?).");
}
const rsvpSummary =
  `do ${shiftDate(today, 1)} 12:00, przyjdzie ${String(rsvpBoard.counts.coming)} ` +
  `(${String(RSVP_BY_GUESTS.length)} na swoich linkach, ${String(RSVP_BY_CLIENT.length)} wpisanych przez klienta), ` +
  `nie przyjdzie ${String(rsvpBoard.counts.notComing)} (${ABSENT}), bez odpowiedzi ${String(rsvpBoard.counts.noAnswer)}; ` +
  rsvpBoard.counts.dishes.map((dish) => `${dish.name} ×${String(dish.count)}`).join(", ");

// --- 6. The day of the party: the waiter's floor (a refill from the menu), the per-event waiter, readouts, prints ---

const floorApi = `/api/panel/events/${mainId}/obsluga`;
{
  const waiterPage = await request(restaurantPath, { cookie: waiterCookie });
  if (waiterPage.status !== 200 || !waiterPage.text.includes(`data-floor-event="${mainId}"`)) {
    fail(`Kelner demo nie widzi „${MAIN_EVENT}” w „Dziś na sali” (HTTP ${String(waiterPage.status)}).`);
  }
}
const refillItem = pickMenuItem(menuItems, ["drinks"]);
const refillTable = tableOfGroup(0);
const refilled = await step(
  `dokładka kelnera: ${refillItem.name}`,
  `${floorApi}/orders`,
  {
    method: "POST",
    json: { name: refillItem.name, quantity: 1, note: "dokładka", assignment: { tableId: refillTable } },
    cookie: waiterCookie,
  },
  201,
);
const refill = refilled.items.find((candidate) => !orderBoard.items.some((old) => old.id === candidate.id));
if (refill?.name !== refillItem.name || refill.unitPriceGrosze !== refillItem.priceGrosze) {
  fail(`Dokładka kelnera nie wzięła ceny z menu (${JSON.stringify(refill)}).`);
}
await step("kelner wydaje dokładkę", `${floorApi}/orders/${String(refill.id)}/pieces`, {
  method: "PUT",
  json: { piece: 1, delivered: true },
  cookie: waiterCookie,
});
orderBoard = await step("zamówienia po dokładce", `${api}/orders`);

// event-waiter-access (S-21b): the manager adds „Kuba (na imprezę)” on the event card; the one-time link and the code
// are printed (not used: opening the link page uses nothing up).
const addedWaiter = await step(
  `kelner na imprezę: ${EVENT_WAITER}`,
  `/api/panel/events/${mainId}/waiters`,
  { method: "POST", json: { name: EVENT_WAITER }, cookie: managerCookie },
  201,
);
const eventWaiter = addedWaiter.issued;
{
  const linkPage = await request(eventWaiter.path);
  if (linkPage.status !== 200 || !linkPage.text.includes("data-waiter-link-page")) {
    fail(`Link kelnera na imprezę nie otwiera strony wejścia (HTTP ${String(linkPage.status)}).`);
  }
}

// staff-offline-readout (S-27): the tablet's and the floor's readout pages open; their HTML carries no guest or dish.
const READOUT_PATHS = {
  tablet: `/r/${restaurantKey}/odczyt`,
  floor: `/panel/obsluga/${mainId}/odczyt`,
  waiter: `/kelner/sala/${mainId}/odczyt`,
};
{
  const someGuest = board.guestList.guests[0]?.displayName ?? "";
  for (const [area, path, cookie] of [
    ["tablet", READOUT_PATHS.tablet, undefined],
    ["floor", READOUT_PATHS.floor, waiterCookie],
  ]) {
    const page = await request(path, { cookie });
    if (
      page.status !== 200 ||
      !page.text.includes(`data-staff-readout="${area}"`) ||
      (someGuest !== "" && page.text.includes(someGuest))
    ) {
      fail(`Odczyt bez sieci (${area}) nie otwiera się albo niesie dane w HTML (HTTP ${String(page.status)}).`);
    }
  }
}

// room-prints (S-24): the board shows the guests from the published seating and never a diet; the staff list (the
// client's and the waiter's on the floor) shows the diets at the seats.
const PRINT_PATHS = {
  hub: `/o/${organizerKey}/wydruki`,
  board: `/o/${organizerKey}/wydruki/tablica`,
  staff: `/o/${organizerKey}/wydruki/lista-obslugi`,
  panel: `/panel/wydarzenia/${mainId}/wydruki/tablica`,
  floor: `/panel/obsluga/${mainId}/lista-obslugi`,
};
{
  const boardPage = await request(PRINT_PATHS.board);
  if (
    boardPage.status !== 200 ||
    !boardPage.text.includes("data-board-guest") ||
    !boardPage.text.includes("Justyna") ||
    boardPage.text.includes("alergia na orzechy") ||
    boardPage.text.includes("celiakia") ||
    boardPage.text.includes(organizerKey)
  ) {
    fail(
      `Tablica „Znajdź swój stolik” nie pokazuje gości albo pokazuje dietę lub klucz (HTTP ${String(boardPage.status)}).`,
    );
  }
  for (const [name, path, cookie] of [
    ["klienta", PRINT_PATHS.staff, undefined],
    ["kelnera na sali", PRINT_PATHS.floor, waiterCookie],
  ]) {
    const staffPage = await request(path, { cookie });
    if (
      staffPage.status !== 200 ||
      !staffPage.text.includes("data-staff-seat") ||
      !staffPage.text.includes("Gosia Kowalska") ||
      !staffPage.text.includes("alergia na orzechy") ||
      !staffPage.text.includes("także orzeszki ziemne")
    ) {
      fail(`Lista dla obsługi (${name}) nie pokazuje diet przy miejscach (HTTP ${String(staffPage.status)}).`);
    }
  }
}

// --- Extras: the admin's logged support visit unlocks the paid modules; pub quiz; the client's brand; exports -------

const supportApi = `${PLATFORM_API}/${String(restaurantId)}/support`;
await step(
  "wejście administratora jako wsparcie",
  supportApi,
  { method: "POST", json: { reason: SUPPORT_REASON }, cookie: adminCookie },
  201,
);
for (const [name, path] of [
  ["strona restauracji", restaurantPath],
  ["karta wydarzenia", `/panel/wydarzenia/${mainId}`],
]) {
  const page = await request(path, { cookie: adminCookie });
  if (page.status !== 200 || !page.text.includes("data-support-banner")) {
    fail(`Tryb wsparcia nie otworzył: ${name} (HTTP ${String(page.status)}).`);
  }
}
// event-modules (S-17), pub-quiz (S-28): the paid modules are unlocked inside the visit (each logged for the owner).
for (const [eventId, eventName, module] of [
  [venueLedId, VENUE_LED_EVENT, "aiTopics"],
  [mainId, MAIN_EVENT, "aiTopics"],
  [mainId, MAIN_EVENT, "pubQuiz"],
]) {
  const answer = await step(
    `odblokowanie ${module}: ${eventName} (administrator)`,
    `/api/panel/platform/events/${eventId}/modules/${module}`,
    { method: "PUT", json: { unlocked: true }, cookie: adminCookie },
  );
  if (answer.modules.find((entry) => entry.key === module)?.unlocked !== true) {
    fail(`Administrator nie odblokował modułu ${module} dla „${eventName}”.`);
  }
}
const supportEnded = await step("koniec trybu wsparcia", supportApi, { method: "DELETE", cookie: adminCookie });
if (supportEnded.ended !== true) {
  fail("Tryb wsparcia administratora demo nie był aktywny przy wyjściu.");
}
const supportLog = await step("dziennik wejść administratora", `${restaurantApi}/support-log`, { cookie: ownerCookie });
{
  const latest = supportLog.entries.slice(0, 7);
  const kinds = latest.map((entry) => entry.kind).join(",");
  if (kinds !== "exit,unlock,unlock,unlock,access,access,enter" || latest[6].reason !== SUPPORT_REASON) {
    fail(`Dziennik wejść administratora demo ma nieoczekiwane wpisy: ${kinds || "brak"}.`);
  }
}
// The venue switches AI topics and the game on for the party it runs; the client switches AI topics and the pub quiz
// on for its own (with the game and the default modules: all six on). „Urodziny Ani (demo)” keeps the defaults.
for (const module of ["aiTopics", "guessing"]) {
  await step(`moduł ${module}: ${VENUE_LED_EVENT} (właściciel)`, `/api/panel/events/${venueLedId}/klient/modules`, {
    method: "PUT",
    json: { module, enabled: true },
    cookie: ownerCookie,
  });
}
let mainModules;
for (const module of ["aiTopics", "pubQuiz"]) {
  mainModules = await step(`moduł ${module}: ${MAIN_EVENT} (klient)`, `${api}/modules`, {
    method: "PUT",
    json: { module, enabled: true },
  });
}
if (!mainModules.modules.every((entry) => entry.active)) {
  fail(`Nie wszystkie moduły „${MAIN_EVENT}” działają.`);
}

// pub-quiz (S-28): three questions, the quiz started on the TV, two asked; four guests answer through their links
// (switched on for the round, then off again); each question is closed and the results stay on the TV.
let quizBoard;
for (const question of QUIZ) {
  quizBoard = await step(
    `pub quiz: pytanie „${question.text}”`,
    `${api}/quiz/questions`,
    { method: "POST", json: question },
    201,
  );
}
await step("pub quiz: start na TV", `${api}/quiz/run`, { method: "POST", json: { action: "start" } });
await step("linki gości: włączenie na pub quiz", `${api}/guest-links`, { method: "PATCH", json: { enabled: true } });
for (const [index, answers] of QUIZ_ANSWERS.entries()) {
  const questionId = quizBoard.questions[index].id;
  await step(`pub quiz: pytanie ${String(index + 1)} na TV`, `${api}/quiz/run`, {
    method: "POST",
    json: { action: "ask", questionId },
  });
  for (const [name, option] of Object.entries(answers)) {
    const state = await step(`pub quiz: odpowiedź gościa ${name}`, `/api/g/${guestKeyOf(name)}/quiz`, {
      method: "PUT",
      json: { questionId, option },
    });
    if (state?.quiz?.answer !== option) {
      fail(`Telefon gościa ${name} nie pokazuje jego odpowiedzi w pub quizie.`);
    }
  }
  await step(`pub quiz: zamknięcie pytania ${String(index + 1)}`, `${api}/quiz/run`, {
    method: "POST",
    json: { action: "close" },
  });
}
quizBoard = await step("pub quiz: wyniki na TV", `${api}/quiz/run`, { method: "POST", json: { action: "results" } });
{
  const standings = quizBoard.standings.map((row) => [row.name, row.place, row.points]);
  if (JSON.stringify(standings) !== JSON.stringify(QUIZ_RESULTS)) {
    fail(`Wyniki pub quizu demo są inne niż oczekiwane: ${JSON.stringify(standings)}.`);
  }
  const quizTv = await step("pub quiz: ekran TV", `/api/tv/${tvKey}/seating`);
  const tvNames = (quizTv?.quiz?.results?.entries ?? []).map((entry) => `${String(entry.place)}. ${entry.name}`);
  if (quizTv?.quiz?.phase !== "results" || tvNames.join(", ") !== "1. Ania, 1. Bartek, 3. Kasia") {
    fail(`TV nie pokazuje wyników pub quizu (${tvNames.join(", ") || "brak"}).`);
  }
  const phone = await step("pub quiz: telefon gościa Tomek", `/api/g/${guestKeyOf("Tomek")}/state`);
  if (phone?.quiz?.result?.place !== 4 || phone.quiz.result.players !== 4) {
    fail(`Telefon gościa Tomek nie pokazuje jego miejsca w pub quizie (${JSON.stringify(phone?.quiz ?? null)}).`);
  }
}
await step("linki gości: wyłączenie po pub quizie", `${api}/guest-links`, {
  method: "PATCH",
  json: { enabled: false },
});

// event-branding (S-18): the client's company name and logo next to the restaurant's (set by the owner above).
await step("nazwa firmy klienta", `${api}/branding`, { method: "PATCH", json: { name: CLIENT_BRAND } });
const brand = await step("logo firmy klienta", `${api}/branding/logo`, {
  method: "PUT",
  bytes: logoPng(200, 80, [30, 58, 138], [255, 255, 255]),
  contentType: "image/png",
});
if (
  brand.restaurant.color !== BRAND_COLOR ||
  !brand.restaurant.logo ||
  brand.client.name !== CLIENT_BRAND ||
  !brand.client.logo
) {
  fail("Marka demo nie została zapisana.");
}

// privacy-retention (S-26): the archived party of 60 days ago exports without guests; the manager downloads the main
// party's export.
const purgedExport = await step(`eksport: ${PURGED_EVENT}`, `/api/panel/events/${purgedId}/export`, {
  cookie: ownerCookie,
});
if (typeof purgedExport?.event?.guestData?.purgedAt !== "string" || purgedExport.guests.length !== 0) {
  fail(`Dane gości „${PURGED_EVENT}” (60 dni temu) nie zostały usunięte po terminie.`);
}
const exportPath = `/api/panel/events/${mainId}/export`;
{
  const response = await request(exportPath, { cookie: managerCookie });
  if (
    response.status !== 200 ||
    !(response.headers.get("content-disposition") ?? "").startsWith("attachment;") ||
    response.data?.guests?.length !== GUESTS.length ||
    response.data.event.guestData.purgedAt !== null
  ) {
    fail(`Menedżer demo nie pobrał eksportu „${MAIN_EVENT}” (HTTP ${String(response.status)}).`);
  }
}

// tv-room-rotation (S-20): one TV pinned to a room (`?sala=<room name>`): the second room that has tables.
const roomsWithTables = venue.rooms.filter((room) => venue.tables.some((table) => table.roomId === room.id));
const pinnedRoom = (roomsWithTables[1] ?? roomsWithTables[0]).name;
const pinnedTvUrl = href(`/tv/${tvKey}?sala=${encodeURIComponent(pinnedRoom)}`);
{
  const page = await request(pinnedTvUrl);
  if (page.status !== 200 || !page.text.includes(`data-tv-room="${pinnedRoom}"`)) {
    fail(`TV przypięty do sali ${pinnedRoom} nie pokazuje jej (HTTP ${String(page.status)}).`);
  }
}

// landing-legal (S-30): the product page (the start of the demo on the laptop: „Zaloguj się”) and the two DRAFT legal
// documents it links answer.
const LEGAL_PAGES = [
  ["/", "data-landing"],
  ["/regulamin", "data-legal-draft"],
  ["/polityka-prywatnosci", "data-legal-draft"],
];
for (const [path, marker] of LEGAL_PAGES) {
  const page = await request(path);
  if (page.status !== 200 || !page.text.includes(marker)) {
    fail(`Strona ${path} nie odpowiada jak trzeba (HTTP ${String(page.status)}).`);
  }
}

// --- Summary --------------------------------------------------------------------------------------------------

const seatTotal = venue.tables.reduce((sum, table) => sum + table.seatCount, 0);
const guessCount = guessBoard.guests.filter((guest) => guest.amountGrosze !== null).length;
const placeCount = guessBoard.guests.filter((guest) => guest.predictedPlace !== null).length;
const eventCard = (name) => href(`/panel/wydarzenia/${String(events.get(name).id)}`);
const availableCount = eventMenu.items.filter((item) => item.available).length;
const accountLine = (person, role) => `${person.email} / ${person.password} (${role})`;

console.log(`
Restauracja demo gotowa: „${restaurantName}” (id ${String(restaurantId)}, ${restaurantCreated ? "założona teraz" : "odświeżona"}).
- szablon „${TEMPLATE_NAME}”: ${rebuildTemplate || !oldTemplates.some((entry) => entry.id === templateId) ? "zbudowany z plików" : "zachowany"} — ${String(template.roomCount)} sale, ${String(template.tableCount)} stolików, ${String(template.seatCount)} miejsc${options.plan ? ` (plan z ${options.plan})` : ""}
- menu lokalu: ${rebuildMenu ? "zbudowane z pliku" : "zachowane"} — ${String(catalog.items.length)} pozycji; menu imprezy: ${eventMenu.mode === "reduced" ? `okrojone do ${String(availableCount)}` : "całe"}
- wydarzenia (odświeżone z szablonu): ${EVENTS.map((entry) => `„${entry.name}” ${shiftDate(today, entry.days)}`).join(", ")}
- „${MAIN_EVENT}”: ${String(board.guestList.guests.length)} gości (nieobecna: ${ABSENT}, przypięta: ${PINNED}), grupy ${GROUPS.map((group) => group.members.length).join(" + ")}, rozsadzenie opublikowane (${String(board.assignments.length)} osób na ${String(seatTotal)} miejscach)
- import i diety: ${String(IMPORTED_GUESTS.length)} gości z CSV, ${String(PASTED_GUESTS.length)} wklejonych, ${String(PATCHED_DIETS.length)} diety wpisane ręcznie; obecni: ${dietSummary}
- strzały: ${String(guessCount)} (remis: Bartek i Marta), typy miejsc: ${String(placeCount)}, brakuje: ${String(guessBoard.missing.length)} — wpisz prawidłową kwotę 1500, żeby zobaczyć podium
- zamówienie: ${String(orderBoard.totals.lines)} pozycji z menu imprezy (z dokładką kelnera „${refillItem.name}” przy stoliku ${tableName(refillTable)}), wydane: ${String(orderBoard.totals.deliveredQuantity)} z ${String(orderBoard.totals.quantity)} szt.
- potwierdzenia: ${rsvpSummary}
- moduły: „${MAIN_EVENT}” wszystkie (tematy AI i pub quiz odblokowane przez administratora we wsparciu); „${VENUE_LED_EVENT}” tematy AI i gra włączone przez lokal; „${PAST_EVENT}” domyślne
- retencja: ${String(retention.guestRetentionDays)} dni; „${PURGED_EVENT}” w archiwum, dane gości usunięte

Strona produktu: ${href("/")} („Zaloguj się”; regulamin ${href("/regulamin")} i polityka prywatności ${href("/polityka-prywatnosci")} — szkice do przeglądu prawnika)

Konta (logowanie: ${href("/logowanie")}):
  administrator platformy: ${accountLine(ADMIN, "panel platformy")}
  właściciel:              ${accountLine(OWNER, "zespół, marka, retencja, usuwanie wydarzeń")}
  menedżer:                ${accountLine(MANAGER, "szablon, menu, wydarzenia")}
  kelner:                  ${accountLine(WAITER, "„Dziś na sali”")}

Krok 1 — administrator zakłada restaurację: ${href("/panel/platforma")} (karta „${restaurantName}”; do pokazu na żywo załóż drugą restaurację i daj właścicielowi link)
Krok 2 — właściciel i zespół: ${href(restaurantPath)} (sekcja „Zespół”; zaproszenie nowej osoby = jednorazowy link)
Krok 3 — szablon sali: ${href(`/panel/szablony/${String(templateId)}`)} (plan, sale, stoliki); menu lokalu: ${href(`/panel/restauracje/${String(restaurantId)}/menu`)}
Krok 4 — wydarzenie z szablonu: ${eventCard(MAIN_EVENT)} (link organizatora dla klienta na karcie; „Nowe wydarzenie” na stronie restauracji)
Krok 5 — klient: ${organizerUrl} (goście: ${organizerUrl}/goscie, rozsadzenie: ${organizerUrl}/rozsadzenie)
          podgląd lokalu: ${href(`/panel/wydarzenia/${mainId}/rozsadzenie`)}
Krok 6 — zamówienia klienta: ${organizerUrl}/zamowienia
          lokal prowadzi: ${eventCard(VENUE_LED_EVENT)} („${VENUE_LED_EVENT}”: edycja w panelu)
          TV: ${href(main.links.tv)} (sale na zmianę); jednej sali (${pinnedRoom}): ${pinnedTvUrl}
          kelner (${WAITER.email}): ${href(`/panel/obsluga/${mainId}`)} — do południa jutra
          kelner na imprezę „${EVENT_WAITER}”: ${href(eventWaiter.path)} albo kod ${eventWaiter.code} na ${href("/kelner")}
          tablet kuchni: ${href(main.links.restaurant)}
Krok 7 — archiwum: ${href(`${restaurantPath}?lista=archiwum`)} („${PURGED_EVENT}”); z tego samego szablonu: ${eventCard(TEMPLATE_EVENT)}

Dodatki:
  strzały i ranking: ${organizerUrl}/strzaly
  potwierdzenia i wybór dania: ${organizerUrl}/potwierdzenia
  pub quiz: ${organizerUrl}/quiz (wyniki na TV; trzecie pytanie czeka) — telefon Tomka (po włączeniu linków gości): ${href(`/g/${guestKeyOf("Tomek")}`)}
  odczyt bez sieci: tablet ${href(READOUT_PATHS.tablet)}, sala ${href(READOUT_PATHS.floor)}, kelner na imprezę ${href(READOUT_PATHS.waiter)}
  wydruki: ${href(PRINT_PATHS.hub)} (tablica: ${href(PRINT_PATHS.board)}, lista dla obsługi: ${href(PRINT_PATHS.staff)})
           w panelu: ${href(PRINT_PATHS.panel)}; na sali: ${href(PRINT_PATHS.floor)}
  eksport danych: ${href(exportPath)} (?format=guests-csv, ?format=orders-csv; właściciel lub menedżer)
  prywatność gościa: ${href(`/g/${guestKeyOf("Ania")}/prywatnosc`)} (działa, gdy linki gości są włączone)
  marka: lokal ${BRAND_COLOR} z logo, klient „${CLIENT_BRAND}” z logo; dziennik wejść administratora na stronie restauracji

Scenariusz pokazu: ${SCENARIO}
Linki są sekretne: nie wklejaj ich publicznie.`);
