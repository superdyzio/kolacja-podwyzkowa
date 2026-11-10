// Fills the LOCAL app with demo data for the manual checks: 40 fictional guests, a generated venue plan, 3 rooms,
// 7 tables (45 seats), groups of 4, 2 and 2, one absent and one pinned guest, a published seating, 30 guesses
// (a tie and the absent guest's guess among them, 10 missing, 12 with a place prediction) and a food order (lines for guests, for tables, one
// unassigned, one delivered). Every run creates a NEW restaurant „Restauracja demo” with a new event „Kolacja
// podwyżkowa (demo)” in the LOCAL database (like `npm run event:create`; refused for any other SUPABASE_URL), so other
// events are never touched, and its owner's staff account (staff-accounts: an invitation link redeemed over HTTP with
// a fixed local demo password, printed at the end with the panel login). Through the panel API that owner then adds
// three more events of the restaurant (restaurant-events): an upcoming, a past and an archived one, so the restaurant
// page shows every tab filled, and invites a manager and a waiter into the restaurant's team (restaurant-team), who
// set fixed local demo passwords over HTTP (logins printed at the end). It also keeps ONE platform admin account
// admin@demo.stolik with a fixed local password (platform-restaurants: the platform panel's login, printed at the end),
// who pays the restaurant one logged support visit (admin-support-log: enter with a reason, the restaurant page, the
// main event's card, exit), so the owner's „Dziennik wejść administratora” is not empty. client-restaurant-split: the
// main event stays client-led; the upcoming company Christmas party is switched to „Lokal prowadzi” and gets its first
// guests through the panel. menu-catalog-courses: the owner fills the restaurant's menu (all five courses) and gives
// the main event a reduced menu, from which the client's order lines take their price and course. guest-rsvp-menu:
// the main event collects RSVPs with a dish choice until tomorrow noon (3 guests on their links, 10 entered by the
// client, the absent guest's „no”).
// Every write after that goes through the HTTP API of a running server, so it passes the same validation as the UI.
// Defaults stay as they are: guest access OFF, guess intake OPEN, no correct amount, only the starter questions.
// Usage: npm run build && npm run preview, then npm run demo   (BASE_URL, default http://localhost:4321)
// Zero dependencies.

import { Buffer } from "node:buffer";
import { URL, URLSearchParams } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import {
  addMembership,
  createEvent,
  createRestaurant,
  ensureStaffAccount,
  issueStaffLink,
  PlatformError,
  readDbEnv,
} from "./lib/platform.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const RESTAURANT_NAME = "Restauracja demo";
const EVENT_NAME = "Kolacja podwyżkowa (demo)";
// The demo owner's password (local demo data only; the account's e-mail carries the restaurant id).
const OWNER_PASSWORD = "demo-wlasciciel-1";
// The demo platform admin (local demo data only): one account for every run, its password set again when needed.
const ADMIN_EMAIL = "admin@demo.stolik";
const ADMIN_PASSWORD = "demo-admin-1";
// The demo manager and waiter (restaurant-team; local demo data only; e-mails carry the restaurant id).
const MANAGER_PASSWORD = "demo-menedzer-1";
const WAITER_PASSWORD = "demo-kelner-1";

// --- Demo data -------------------------------------------------------------------------------------------------

// "Ania" is the only name containing "ania" (the offline readout check searches for her).
const GUESTS = [
  "Ania",
  "Bartek",
  "Kasia",
  "Tomek",
  "Magda",
  "Piotrek",
  "Ola",
  "Kuba",
  "Ewa",
  "Marcin",
  "Zosia",
  "Michał",
  "Basia",
  "Grzesiek",
  "Agnieszka",
  "Paweł",
  "Joasia",
  "Krzysiek",
  "Monika",
  "Łukasz",
  "Dorota",
  "Wojtek",
  "Natalia",
  "Adam",
  "Iwona",
  "Rafał",
  "Marta",
  "Szymon",
  "Ela",
  "Darek",
  "Justyna",
  "Maciek",
  "Karolina",
  "Jacek",
  "Gosia Kowalska",
  "Gosia Wiśniewska",
  "Staszek „Szef”",
  "Pani Halinka",
  "Igor z IT",
  "Weronika",
];
const ABSENT = "Weronika";
const PINNED = "Pani Halinka";
// guest-import-diets (S-23): the last ten guests come from a spreadsheet's CSV with their diets — [the diet column as
// typed, the notes, the tags it must become]; Bartek and Kasia get theirs per guest („Dieta”). The tablet's counts
// (present guests only, so not the absent Weronika) must match.
const IMPORTED_GUESTS = GUESTS.slice(-10);
const GUEST_DIETS = new Map([
  ["Justyna", ["wegetariańska", "", ["vegetarian"]]],
  ["Maciek", ["bez glutenu", "celiakia — osobna deska", ["gluten-free"]]],
  ["Karolina", ["wegańska, bez laktozy", "", ["vegan", "lactose-free"]]],
  ["Gosia Kowalska", ["alergia na orzechy", "także orzeszki ziemne", ["nut-allergy"]]],
  ["Staszek „Szef”", ["Halal", "", ["halal"]]],
  ["Pani Halinka", ["bez wieprzowiny", "", ["no-pork"]]],
  ["Igor z IT", ["", "bez cebuli", []]],
  ["Weronika", ["wege", "", ["vegetarian"]]],
  ["Bartek", ["", "", ["seafood-allergy"]]],
  ["Kasia", ["", "bez mleka krowiego", ["lactose-free"]]],
]);
const PATCHED_DIETS = ["Bartek", "Kasia"];
// The tags in the app's order with their Polish labels (src/lib/diets/messages.ts).
const DIET_LABELS = {
  vegetarian: "wegetariańska",
  vegan: "wegańska",
  "gluten-free": "bez glutenu",
  "lactose-free": "bez laktozy",
  "nut-allergy": "alergia na orzechy",
  "seafood-allergy": "alergia na ryby i owoce morza",
  halal: "halal",
  "no-pork": "bez wieprzowiny",
};

// Plan image size in pixels; rooms and tables are drawn on it and the pins are the table centres as fractions.
const PLAN_WIDTH = 1600;
const PLAN_HEIGHT = 900;
const ROOMS = [
  { name: "Sala Główna", box: [40, 40, 820, 860], fill: [219, 232, 245], border: [96, 125, 160] },
  { name: "Sala Kominkowa", box: [860, 40, 1560, 430], fill: [246, 227, 207], border: [170, 120, 80] },
  { name: "Ogród zimowy", box: [860, 470, 1560, 860], fill: [220, 239, 217], border: [95, 145, 95] },
];
// Round tables: `size` = radius; rectangular: [width, height]. Seats: 8 + 8 + 10 + 6 + 5 + 4 + 4 = 45.
const TABLES = [
  { room: "Sala Główna", name: "Dąb", shape: "round", seatCount: 8, at: [230, 240], size: 75 },
  { room: "Sala Główna", name: "Lipa", shape: "round", seatCount: 8, at: [630, 240], size: 75 },
  { room: "Sala Główna", name: "Długi stół", shape: "rectangular", seatCount: 10, at: [430, 640], size: [440, 110] },
  { room: "Sala Kominkowa", name: "Kominek", shape: "round", seatCount: 6, at: [1040, 235], size: 65 },
  { room: "Sala Kominkowa", name: "Okno", shape: "rectangular", seatCount: 5, at: [1370, 235], size: [260, 90] },
  { room: "Ogród zimowy", name: "Palma", shape: "round", seatCount: 4, at: [1040, 665], size: 50 },
  { room: "Ogród zimowy", name: "Fontanna", shape: "rectangular", seatCount: 4, at: [1370, 665], size: [200, 80] },
];
// Inseparable groups on consecutive seats (round: an arc; rectangular: one side, seats 1..ceil(n/2) are side A).
const GROUPS = [
  { members: ["Magda", "Piotrek", "Zosia", "Grzesiek"], table: "Długi stół", seats: [1, 2, 3, 4] },
  { members: ["Kasia", "Tomek"], table: "Dąb", seats: [1, 2] },
  { members: ["Gosia Kowalska", "Igor z IT"], table: "Kominek", seats: [1, 2] },
];
// Guesses entered by the organizer, typed in the formats guests use, some with a place prediction (guess-place).
// Bartek and Marta tie exactly (same amount in two spellings); the absent guest has a guess. The 10 guests not listed
// here are "missing". With the correct amount 1500 the ranking shows the podium (Ania, Monika, Maciek) and the hits:
// Ania 1, Maciek 3, Gosia Kowalska 4 and Natalia 5 (a tie at 4 spans 4–5), Paweł 7, Marta 12 (a tie at 10 spans
// 10–12).
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
// Food order lines: [dish, price as typed, quantity, note, for whom]. `for` is a guest name, `{ table }` or null
// (unassigned). The first line is marked delivered after it is added.
const ORDERS = [
  ["Rosół z makaronem", "18,00", 1, null, "Ania"],
  ["Schabowy z ziemniakami", "42,00", 1, null, "Bartek"],
  ["Schabowy z ziemniakami", "42,00", 1, "bez kapusty", "Kasia"],
  ["Pierogi ruskie", "32,50", 1, null, "Tomek"],
  ["Sałatka z kozim serem", "36,00", 1, "bez orzechów", "Magda"],
  ["Pierogi ruskie", "32,50", 1, null, "Pani Halinka"],
  ["Deska serów", "79,00", 1, null, { table: "Dąb" }],
  ["Dzbanek kompotu", "24,00", 2, null, { table: "Długi stół" }],
  ["Tort czekoladowy", "180,00", 1, "na deser, ze świeczką", null],
];

// menu-catalog-courses (S-16): the demo restaurant's menu — every course, every dish of ORDERS at its price; the
// main event gets a REDUCED menu (the items marked true), so the client picks from those and the kitchen list on the
// tablet is grouped by course.
const MENU = [
  ["Tatar wołowy", "starter", "48,00", false],
  ["Sałatka z kozim serem", "starter", "36,00", true],
  ["Deska serów", "starter", "79,00", true],
  ["Rosół z makaronem", "soup", "18,00", true],
  ["Żurek staropolski", "soup", "22,00", false],
  ["Schabowy z ziemniakami", "main", "42,00", true],
  ["Pierogi ruskie", "main", "32,50", true],
  ["Polędwica z dzika", "main", "89,00", false],
  ["Tort czekoladowy", "dessert", "180,00", true],
  ["Sernik baskijski", "dessert", "24,00", true],
  ["Dzbanek kompotu", "drinks", "24,00", true],
  ["Lemoniada", "drinks", "14,00", true],
  ["Woda gazowana 0,7 l", "drinks", "16,00", false],
];

// --- Helpers ---------------------------------------------------------------------------------------------------

// 1850 → "18,50" (the price format of MENU and ORDERS).
function formatGrosze(grosze) {
  return `${String(Math.floor(grosze / 100))},${String(grosze % 100).padStart(2, "0")}`;
}

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
          ? "\nDane demo tego wydarzenia są niekompletne. Uruchom npm run demo ponownie: utworzy nowe wydarzenie."
          : ""),
    );
  }
  dataWritten = dataWritten || (options?.method ?? "GET") !== "GET";
  return res.data;
}

// A plain RGB PNG (8 bits per channel, no interlace): rooms as framed rectangles, tables as filled shapes.
function planPng() {
  const pixels = Buffer.alloc(PLAN_WIDTH * PLAN_HEIGHT * 3);
  const paint = (x, y, [r, g, b]) => {
    const offset = (y * PLAN_WIDTH + x) * 3;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  };
  const fillRect = (x0, y0, x1, y1, color) => {
    for (let y = Math.max(0, y0); y < Math.min(PLAN_HEIGHT, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(PLAN_WIDTH, x1); x++) {
        paint(x, y, color);
      }
    }
  };
  const fillCircle = (cx, cy, radius, color) => {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          paint(x, y, color);
        }
      }
    }
  };

  fillRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT, [247, 245, 240]);
  for (const room of ROOMS) {
    const [x0, y0, x1, y1] = room.box;
    fillRect(x0, y0, x1, y1, room.border);
    fillRect(x0 + 8, y0 + 8, x1 - 8, y1 - 8, room.fill);
  }
  const edge = [120, 92, 62];
  const wood = [196, 164, 122];
  for (const table of TABLES) {
    const [cx, cy] = table.at;
    if (table.shape === "round") {
      fillCircle(cx, cy, table.size, edge);
      fillCircle(cx, cy, table.size - 5, wood);
    } else {
      const [width, height] = table.size;
      const [x0, y0] = [cx - width / 2, cy - height / 2];
      fillRect(x0, y0, x0 + width, y0 + height, edge);
      fillRect(x0 + 5, y0 + 5, x0 + width - 5, y0 + height - 5, wood);
    }
  }

  return rgbPng(PLAN_WIDTH, PLAN_HEIGHT, pixels);
}

// Encodes RGB pixels (3 bytes per pixel, rows top to bottom) as a PNG.
function rgbPng(width, height, pixels) {
  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(height * rowLength); // filter byte 0 (none) at the start of every row
  for (let y = 0; y < height; y++) {
    pixels.copy(raw, y * rowLength + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (type, data) => {
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // bit depth 8, colour type 2 (RGB), deflate, no filter method, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// event-branding (S-18): a simple logo — a coloured badge with a ring and a bar, `width` × `height`.
function logoPng(width, height, background, foreground) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ring = Math.hypot(x - height / 2, y - height / 2);
      const onRing = ring >= height * 0.28 && ring <= height * 0.4;
      const onBar = x >= height * 0.95 && x <= width - height * 0.15 && Math.abs(y - height / 2) <= height * 0.12;
      const [r, g, b] = onRing || onBar ? foreground : background;
      const offset = (y * width + x) * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
  }
  return rgbPng(width, height, pixels);
}

const fraction = (value, total) => Math.round((value / total) * 10_000) / 10_000;

// --- 1. A new restaurant and event in the local database; the running server must know its key ------------------

let env;
let restaurantId;
let event;
let owner;
let admin;
try {
  env = readDbEnv({ requireLocal: true });
  const restaurant = await createRestaurant(env, RESTAURANT_NAME);
  restaurantId = restaurant.id;
  event = await createEvent(env, restaurant.id, EVENT_NAME, { allModules: true });
  console.log(
    `Baza ${env.host}: restauracja „${restaurant.name}” (id ${String(restaurant.id)}), wydarzenie „${event.name}” (id ${String(event.id)}).`,
  );
  // The restaurant's owner (staff-accounts): an account without a password and an invitation link, redeemed below.
  const account = await ensureStaffAccount(env, {
    email: `wlasciciel-${String(restaurant.id)}@demo.stolik`,
    displayName: "Właściciel demo",
  });
  await addMembership(env, restaurant.id, account.id, "owner");
  const invite = await issueStaffLink(env, account.id, "invite", BASE_URL);
  owner = { email: account.email, token: invite.token };
  // The platform admin (platform-restaurants): created once; a new account gets an invitation, redeemed below.
  const adminAccount = await ensureStaffAccount(env, {
    email: ADMIN_EMAIL,
    displayName: "Administrator demo",
    isPlatformAdmin: true,
  });
  admin = {
    id: adminAccount.id,
    email: adminAccount.email,
    token: adminAccount.hasPassword ? null : (await issueStaffLink(env, adminAccount.id, "invite", BASE_URL)).token,
  };
} catch (error) {
  fail(error instanceof PlatformError ? error.message : String(error));
}

const api = `/api/o/${event.organizerKey}`;
const existingGuests = await request(`${api}/guests`);
if (existingGuests.status === 404) {
  fail(
    "Serwer nie zna klucza organizatora nowego wydarzenia — serwer i .env wskazują różne bazy?\n" +
      `Wydarzenie id ${String(event.id)} zostało w bazie z .env puste.`,
  );
}
await step("baza startowa pytań", `${api}/questions/starter`, { method: "POST" });

// The owner sets the password from the invitation link, like a person in the browser (the answer logs them in).
const ownerRedeem = await request("/api/auth/password-link", {
  method: "POST",
  form: { token: owner.token, password: OWNER_PASSWORD, repeat: OWNER_PASSWORD },
});
if (ownerRedeem.status !== 303 || !/\/panel$/.test(new URL(ownerRedeem.location, BASE_URL).pathname)) {
  fail(`Nie udało się ustawić hasła właściciela demo (HTTP ${ownerRedeem.status} → ${ownerRedeem.location || "-"}).`);
}
// The redeem logs the owner in: their session drives the panel API below (restaurant-events).
const ownerSession = /(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/.exec(ownerRedeem.setCookie)?.[1];
if (!ownerSession) {
  fail("Ustawienie hasła właściciela demo nie zalogowało go (brak ciasteczka sesji).");
}
const ownerCookie = `kp-session=${ownerSession}`;

// The platform admin: a new account sets the password from its invitation; an existing one logs in with the demo
// password, and only when that fails (changed by hand) a password-reset link sets it again.
const toPanel = (res) => res.status === 303 && new URL(res.location, BASE_URL).pathname === "/panel";
const setAdminPassword = (token) =>
  request("/api/auth/password-link", {
    method: "POST",
    form: { token, password: ADMIN_PASSWORD, repeat: ADMIN_PASSWORD },
  });
// The session cookie of an answer that logged the person in (303 to /panel), else null.
const panelCookieOf = (res) => {
  const token = /(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/.exec(res.setCookie)?.[1];
  return toPanel(res) && token ? `kp-session=${token}` : null;
};
let adminCookie = admin.token
  ? panelCookieOf(await setAdminPassword(admin.token))
  : panelCookieOf(
      await request("/api/auth/login", { method: "POST", form: { email: admin.email, password: ADMIN_PASSWORD } }),
    );
if (!adminCookie) {
  try {
    const reset = await issueStaffLink(env, admin.id, "reset", BASE_URL);
    adminCookie = panelCookieOf(await setAdminPassword(reset.token));
  } catch (error) {
    fail(error instanceof PlatformError ? error.message : String(error));
  }
}
if (!adminCookie) {
  fail(`Nie udało się ustawić hasła administratora demo (${ADMIN_EMAIL}).`);
}

// --- 2. Venue: plan image, rooms, tables with pins ----------------------------------------------------------------

const png = planPng();
await step("wgranie planu", `${api}/plan`, { method: "PUT", bytes: png, contentType: "image/png" });

const roomIds = new Map();
for (const room of ROOMS) {
  const venue = await step(`sala ${room.name}`, `${api}/rooms`, { method: "POST", json: { name: room.name } }, 201);
  roomIds.set(room.name, venue.rooms.find((candidate) => candidate.name === room.name).id);
}

let venue;
for (const table of TABLES) {
  venue = await step(
    `stolik ${table.name}`,
    `${api}/tables`,
    {
      method: "POST",
      json: {
        roomId: roomIds.get(table.room),
        name: table.name,
        seatCount: table.seatCount,
        shape: table.shape,
        x: fraction(table.at[0], PLAN_WIDTH),
        y: fraction(table.at[1], PLAN_HEIGHT),
      },
    },
    201,
  );
}
const tableByName = new Map(venue.tables.map((table) => [table.name, table]));

// --- 3. Guests, groups, the absent guest --------------------------------------------------------------------------

await step(
  "lista gości",
  `${api}/guests`,
  { method: "POST", json: { text: GUESTS.filter((name) => !IMPORTED_GUESTS.includes(name)).join("\n") } },
  201,
);
// guest-import-diets (S-23): the rest from a CSV as a Polish spreadsheet saves it (UTF-8 with a BOM, `;`, a header,
// quoted cells where needed): the preview first (nothing saved), then the import, all at once.
const csvCell = (text) => (/[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
const importCsv =
  "\uFEFFImię;Dieta;Uwagi\r\n" +
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
const missingNames = GUESTS.filter((name) => !guestId.has(name));
if (missingNames.length > 0) {
  fail(`Po wklejeniu i imporcie brakuje gości: ${missingNames.join(", ")}.`);
}
const idOf = (name) => guestId.get(name);
const wrongDiets = IMPORTED_GUESTS.filter((name) => {
  const guest = imported.guests.find((candidate) => candidate.displayName === name);
  const [, note, tags] = GUEST_DIETS.get(name) ?? ["", "", []];
  return JSON.stringify(guest?.diets) !== JSON.stringify(tags) || (guest?.dietNote ?? "") !== note;
});
if (wrongDiets.length > 0) {
  fail(`Import nie zapisał diet: ${wrongDiets.join(", ")}.`);
}
for (const name of PATCHED_DIETS) {
  const [, note, tags] = GUEST_DIETS.get(name);
  await step(`dieta ${name}`, `${api}/guests/${idOf(name)}`, {
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
await step(`nieobecność ${ABSENT}`, `${api}/guests/${idOf(ABSENT)}`, { method: "PATCH", json: { isAbsent: true } });

// --- 4. Seating: a whole draft (groups on their seats, the other present guests spread out), pin, publish ---------

const seats = [];
const taken = new Map(TABLES.map((table) => [table.name, new Set()]));
const take = (name, tableName, seat) => {
  seats.push({ guestId: idOf(name), tableId: tableByName.get(tableName).id, seat });
  taken.get(tableName).add(seat);
};
for (const group of GROUPS) {
  group.members.forEach((name, index) => {
    take(name, group.table, group.seats[index]);
  });
}
const grouped = new Set(GROUPS.flatMap((group) => group.members));
// Each single goes to the table with the most free seats (first in TABLES on a tie), at its lowest free seat.
for (const name of GUESTS.filter((candidate) => candidate !== ABSENT && !grouped.has(candidate))) {
  const free = (table) => table.seatCount - taken.get(table.name).size;
  const table = TABLES.reduce((best, candidate) => (free(candidate) > free(best) ? candidate : best));
  if (free(table) === 0) {
    fail("Za mało miejsc przy stolikach dla obecnych gości.");
  }
  let seat = 1;
  while (taken.get(table.name).has(seat)) {
    seat++;
  }
  take(name, table.name, seat);
}

await step("zapis rozsadzenia", `${api}/seating/draft`, { method: "POST", json: { seats } });
await step(`przypięcie ${PINNED}`, `${api}/seating/guests/${idOf(PINNED)}`, {
  method: "PATCH",
  json: { pinned: true },
});
const board = await step("publikacja na TV", `${api}/seating/publish`, { method: "POST" }, 201);

// guest-import-diets (S-23): the kitchen's tablet counts the present guests' diets and shows each at its seat.
const tabletView = await step("tablet: diety i alergie", `/api/r/${event.restaurantKey}/orders`);
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

// --- 5. Guesses by organizer proxy ----------------------------------------------------------------------------

let guessBoard;
for (const [name, amount, place] of GUESSES) {
  guessBoard = await step(`strzał ${name}`, `${api}/guesses/${idOf(name)}`, {
    method: "PUT",
    json: place === undefined ? { amount } : { amount, place },
  });
}

// --- 6. Food order -----------------------------------------------------------------------------------------------

// menu-catalog-courses (S-16): the owner fills the restaurant's menu (all five courses) and gives the main event a
// reduced menu; the client then orders only from it and every line takes the menu's price and course (no
// „Cennik wydarzenia” needed — that stays the venue's way to re-price an event).
let catalog;
for (const [name, course, price] of MENU) {
  catalog = await step(
    `menu ${name}`,
    `/api/panel/restaurants/${String(restaurantId)}/menu`,
    { method: "POST", json: { name, course, price }, cookie: ownerCookie },
    201,
  );
}
const reducedIds = MENU.filter((entry) => entry[3]).map(
  ([name]) => catalog.items.find((item) => item.name === name)?.id ?? 0,
);
const eventMenu = await step("menu wydarzenia (okrojone)", `/api/panel/events/${String(event.id)}/menu`, {
  method: "PUT",
  json: { mode: "reduced", itemIds: reducedIds },
  cookie: ownerCookie,
});
for (const [name, price, quantity, note, target] of ORDERS) {
  const assignment =
    target === null
      ? null
      : typeof target === "string"
        ? { guestId: idOf(target) }
        : { tableId: tableByName.get(target.table).id };
  const added = await step(
    `zamówienie ${name}`,
    `${api}/orders`,
    { method: "POST", json: { name, quantity, note, assignment } },
    201,
  );
  const line = added.items.at(-1);
  if (line?.course === null || formatGrosze(line?.unitPriceGrosze ?? -1) !== price) {
    fail(`Pozycja „${name}” nie wzięła ceny i kursu z menu (${JSON.stringify(line)}).`);
  }
}
let orderBoard = await step("zamówienie z menu", `${api}/orders`);
const firstLine = orderBoard.items[0];
orderBoard = await step(`wydane: ${firstLine.name}`, `${api}/orders/${firstLine.id}`, {
  method: "PATCH",
  json: { delivered: true },
});

// --- 7. More events of the restaurant (restaurant-events): upcoming, past and archived ---------------------------

const eventsApi = `/api/panel/restaurants/${String(restaurantId)}/events`;
const { today } = await step("lista wydarzeń lokalu", eventsApi, { cookie: ownerCookie });
const shiftDate = (date, days) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const MORE_EVENTS = [
  { name: "Wigilia firmowa (demo)", date: shiftDate(today, 32), expectedGuests: 80, archived: false },
  { name: "Urodziny Ani (demo)", date: shiftDate(today, -10), expectedGuests: 30, archived: false },
  { name: "Komunia Zosi (demo)", date: shiftDate(today, -60), expectedGuests: null, archived: true },
];
// client-restaurant-split: the company Christmas party is run by the venue („Lokal prowadzi”): the owner flips the
// switch and adds its first guests through the panel (the dispatcher to the client's API); its client link is
// view-only. The main event stays client-led (its prices were set by the owner above).
const VENUE_LED_EVENT = MORE_EVENTS[0].name;
const VENUE_LED_GUESTS = ["Dyrektor Nowak", "Pani Kowalska", "Pan Wiśniewski", "Ola z księgowości"];
let venueLedEventId = null;
const moreEventIds = new Map();
for (const { name, date, expectedGuests, archived } of MORE_EVENTS) {
  const created = await step(
    `wydarzenie ${name}`,
    eventsApi,
    { method: "POST", json: { name, date, expectedGuests }, cookie: ownerCookie },
    201,
  );
  moreEventIds.set(name, created.event.id);
  if (name === VENUE_LED_EVENT) {
    venueLedEventId = created.event.id;
    const switched = await step(`lokal prowadzi: ${name}`, `/api/panel/events/${String(venueLedEventId)}`, {
      method: "PATCH",
      json: { venueLeads: true },
      cookie: ownerCookie,
    });
    if (switched.event.venueLeads !== true) {
      fail(`„Lokal prowadzi” nie włączył się dla „${name}”.`);
    }
    await step(
      `goście przez panel: ${name}`,
      `/api/panel/events/${String(venueLedEventId)}/klient/guests`,
      { method: "POST", json: { text: VENUE_LED_GUESTS.join("\n") }, cookie: ownerCookie },
      201,
    );
  }
  if (archived) {
    await step(`archiwum: ${name}`, `/api/panel/events/${String(created.event.id)}`, {
      method: "PATCH",
      json: { archived: true },
      cookie: ownerCookie,
    });
  }
}

// --- 7b. A venue template (venue-templates, S-15): the main event's room saved as a template, and an event created from
// it with the room ready (the template's rows are its own; it is in no event list or counter) ----------------------

const TEMPLATE_NAME = "Sala główna (szablon demo)";
const TEMPLATE_EVENT = "Rocznica firmy (demo)";
const savedTemplate = await step(
  `szablon sali ${TEMPLATE_NAME}`,
  `/api/panel/restaurants/${String(restaurantId)}/templates`,
  { method: "POST", json: { name: TEMPLATE_NAME, sourceEventId: event.id }, cookie: ownerCookie },
  201,
);
const templateId = savedTemplate.template.id;
const fromTemplate = await step(
  `wydarzenie z szablonu ${TEMPLATE_EVENT}`,
  eventsApi,
  {
    method: "POST",
    json: { name: TEMPLATE_EVENT, date: shiftDate(today, 20), expectedGuests: 60, templateId },
    cookie: ownerCookie,
  },
  201,
);
const templateEventVenue = await step(
  `sala wydarzenia z szablonu`,
  `/api/panel/events/${String(fromTemplate.event.id)}/klient/venue`,
  { cookie: ownerCookie },
);
if (
  templateEventVenue.tables.length !== savedTemplate.template.tableCount ||
  templateEventVenue.rooms.length !== savedTemplate.template.roomCount
) {
  fail(`Wydarzenie „${TEMPLATE_EVENT}” nie dostało sali z szablonu „${TEMPLATE_NAME}”.`);
}

const eventLists = await step("listy wydarzeń lokalu", eventsApi, { cookie: ownerCookie });
if (eventLists.upcoming.length === 0 || eventLists.past.length === 0 || eventLists.archived.length === 0) {
  fail("Lista wydarzeń lokalu demo nie ma wszystkich trzech zakładek (nadchodzące, minione, archiwum).");
}

// --- 7c. RSVP and dish choice (guest-rsvp-menu, S-25): the client offers the reduced menu's main courses until
// tomorrow 12:00 (Warsaw time); three guests answer on their own links (guest access on just for that, then off
// again), the client enters ten more and „nie przyjdzie” for the absent guest (no new absence, so the published
// seating stays up to date) -------------------------------------------------------------------------------------

const RSVP_DEADLINE = `${shiftDate(today, 1)}T12:00`;
const rsvpOptions = eventMenu.items
  .filter((item) => item.available && item.course === "main")
  .map((item) => item.name)
  .slice(0, 4);
if (rsvpOptions.length < 2) {
  fail(`Menu „${EVENT_NAME}” nie ma dwóch dań głównych do wyboru (${rsvpOptions.join(", ")}).`);
}
await step("potwierdzenia: termin i dania", `${api}/rsvp`, {
  method: "PATCH",
  json: { deadline: RSVP_DEADLINE, options: rsvpOptions },
});
const RSVP_BY_GUESTS = ["Ania", "Bartek", "Kasia"];
const RSVP_BY_CLIENT = ["Tomek", "Magda", "Piotrek", "Ola", "Kuba", "Ewa", "Marcin", "Zosia", "Michał", "Basia"];
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
  await step(`potwierdzenie za gościa: ${name}`, `${api}/rsvp/guests/${idOf(name)}`, {
    method: "PUT",
    json: { attending: true, dish: rsvpDishOf(index + RSVP_BY_GUESTS.length) },
  });
}
const rsvpBoard = await step(`potwierdzenie za gościa: ${ABSENT} nie przyjdzie`, `${api}/rsvp/guests/${idOf(ABSENT)}`, {
  method: "PUT",
  json: { attending: false, dish: null },
});
{
  const coming = RSVP_BY_GUESTS.length + RSVP_BY_CLIENT.length;
  const expectedDishes = rsvpOptions.map((name, optionIndex) => ({
    name,
    count: Array.from({ length: coming }, (_, index) => index).filter(
      (index) => index % rsvpOptions.length === optionIndex,
    ).length,
  }));
  const counted = Object.fromEntries(rsvpBoard.counts.dishes.map((dish) => [dish.name, dish.count]));
  const { counts } = rsvpBoard;
  if (
    !rsvpBoard.open ||
    counts.coming !== coming ||
    counts.notComing !== 1 ||
    counts.noAnswer !== GUESTS.length - coming - 1 ||
    counts.noDish !== 0 ||
    expectedDishes.some((dish) => counted[dish.name] !== dish.count)
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

// --- 8. The restaurant's team (restaurant-team): the owner invites a manager and a waiter, both set their passwords --

const teamApi = `/api/panel/restaurants/${String(restaurantId)}/team`;
const TEAM = [
  {
    email: `menedzer-${String(restaurantId)}@demo.stolik`,
    name: "Menedżer demo",
    role: "manager",
    password: MANAGER_PASSWORD,
  },
  {
    email: `kelner-${String(restaurantId)}@demo.stolik`,
    name: "Kelner demo",
    role: "waiter",
    password: WAITER_PASSWORD,
  },
];
for (const person of TEAM) {
  const answer = await step(
    `zaproszenie ${person.email}`,
    teamApi,
    { method: "POST", json: { email: person.email, name: person.name, role: person.role }, cookie: ownerCookie },
    201,
  );
  const token = /^\/haslo\/([A-Za-z0-9_-]{43})$/.exec(answer.invited?.link?.path ?? "")?.[1];
  if (!token) {
    fail(`Zaproszenie ${person.email} nie dało jednorazowego linku.`);
  }
  const redeemed = await request("/api/auth/password-link", {
    method: "POST",
    form: { token, password: person.password, repeat: person.password },
  });
  if (!toPanel(redeemed)) {
    fail(`Nie udało się ustawić hasła ${person.email} (HTTP ${redeemed.status} → ${redeemed.location || "-"}).`);
  }
  person.cookie = `kp-session=${/(?:^|[\s,])kp-session=([A-Za-z0-9_-]{43});/.exec(redeemed.setCookie)?.[1] ?? ""}`;
}
const team = await step("zespół lokalu", teamApi, { cookie: ownerCookie });
if (team.team?.members?.length !== 3 || !team.team.members.every((member) => member.hasPassword)) {
  fail("Zespół lokalu demo nie ma trzech osób z ustawionym hasłem (właściciel, menedżer, kelner).");
}

// --- 8b. The floor (waiter-day-and-refills, S-21): the main event runs today, so the waiter sees it under „Dziś na
// sali”, adds a refill on the floor (priced by the venue from the menu) and serves it -------------------------------

const floorApi = `/api/panel/events/${String(event.id)}/obsluga`;
const waiter = TEAM[1];
const waiterPage = await request(`/panel/restauracje/${String(restaurantId)}`, { cookie: waiter.cookie });
if (waiterPage.status !== 200 || !waiterPage.text.includes(`data-floor-event="${String(event.id)}"`)) {
  fail(`Kelner demo nie widzi „${EVENT_NAME}” w „Dziś na sali” (HTTP ${String(waiterPage.status)}).`);
}
const REFILL = "Dzbanek kompotu";
const refilled = await step(
  `dokładka kelnera: ${REFILL}`,
  `${floorApi}/orders`,
  {
    method: "POST",
    json: { name: REFILL, quantity: 1, note: "dokładka", assignment: { tableId: tableByName.get("Długi stół").id } },
    cookie: waiter.cookie,
  },
  201,
);
const refill = refilled.items.at(-1);
if (refill?.name !== REFILL || formatGrosze(refill.unitPriceGrosze) !== "24,00") {
  fail(`Dokładka kelnera nie wzięła ceny z menu (${JSON.stringify(refill)}).`);
}
await step(`kelner wydaje dokładkę`, `${floorApi}/orders/${String(refill.id)}/pieces`, {
  method: "PUT",
  json: { piece: 1, delivered: true },
  cookie: waiter.cookie,
});

// --- 8c. A per-event waiter (event-waiter-access, S-21b): the owner adds „Kuba (na imprezę)” to the main event on
// its card; the one-time link and the code are printed (not used: opening the link page uses nothing up) ------------

const EVENT_WAITER = "Kuba (na imprezę)";
const addedWaiter = await step(
  `kelner na imprezę: ${EVENT_WAITER}`,
  `/api/panel/events/${String(event.id)}/waiters`,
  { method: "POST", json: { name: EVENT_WAITER }, cookie: ownerCookie },
  201,
);
const eventWaiter = addedWaiter.issued;
{
  const linkPage = await request(eventWaiter.path);
  if (linkPage.status !== 200 || !linkPage.text.includes("data-waiter-link-page")) {
    fail(`Link kelnera na imprezę nie otwiera strony wejścia (HTTP ${String(linkPage.status)}).`);
  }
}

// --- 8d. The staff's offline readout (staff-offline-readout, S-27): the tablet's and the floor's readout pages open
// (the saved state itself lives in the browser that opened the live page; their HTML carries no guest or dish) ---------

const READOUT_PATHS = {
  tablet: `/r/${event.restaurantKey}/odczyt`,
  floor: `/panel/obsluga/${String(event.id)}/odczyt`,
  waiter: `/kelner/sala/${String(event.id)}/odczyt`,
};
{
  const someGuest = board.guestList.guests[0]?.displayName ?? "";
  for (const [area, path, cookie] of [
    ["tablet", READOUT_PATHS.tablet, undefined],
    ["floor", READOUT_PATHS.floor, waiter.cookie],
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

// --- 9. A support visit of the platform admin (admin-support-log): enter with a reason, two pages, exit -----------

const SUPPORT_REASON = "Pokaz trybu wsparcia: sprawdzenie listy wydarzeń (demo)";
const supportApi = `/api/panel/platform/restaurants/${String(restaurantId)}/support`;
await step(
  "wejście administratora jako wsparcie",
  supportApi,
  { method: "POST", json: { reason: SUPPORT_REASON }, cookie: adminCookie },
  201,
);
for (const [name, path] of [
  ["strona restauracji", `/panel/restauracje/${String(restaurantId)}`],
  ["karta wydarzenia", `/panel/wydarzenia/${String(event.id)}`],
]) {
  const page = await request(path, { cookie: adminCookie });
  if (page.status !== 200 || !page.text.includes("data-support-banner")) {
    fail(`Tryb wsparcia nie otworzył: ${name} (HTTP ${String(page.status)}).`);
  }
}
// event-modules (S-17): inside the same visit the admin unlocks the paid AI topics for the venue-led Christmas party
// (logged for the owner), and the owner — the venue leads there — switches AI topics and the guessing game on through
// the dispatcher. „Urodziny Ani (demo)” keeps the new-event defaults (AI topics and the game off).
const unlocked = await step(
  "odblokowanie tematów AI (administrator)",
  `/api/panel/platform/events/${String(venueLedEventId)}/modules/aiTopics`,
  { method: "PUT", json: { unlocked: true }, cookie: adminCookie },
);
if (unlocked.modules.find((module) => module.key === "aiTopics")?.unlocked !== true) {
  fail("Administrator nie odblokował tematów AI dla „Wigilii firmowej (demo)”.");
}
const supportEnded = await step("koniec trybu wsparcia", supportApi, { method: "DELETE", cookie: adminCookie });
for (const module of ["aiTopics", "guessing"]) {
  await step(`moduł ${module}: ${VENUE_LED_EVENT}`, `/api/panel/events/${String(venueLedEventId)}/klient/modules`, {
    method: "PUT",
    json: { module, enabled: true },
    cookie: ownerCookie,
  });
}
if (supportEnded.ended !== true) {
  fail("Tryb wsparcia administratora demo nie był aktywny przy wyjściu.");
}
const supportLog = await step(
  "dziennik wejść administratora",
  `/api/panel/restaurants/${String(restaurantId)}/support-log`,
  { cookie: ownerCookie },
);
const supportKinds = supportLog.entries.map((entry) => entry.kind).join(",");
if (supportKinds !== "exit,unlock,access,access,enter" || supportLog.entries[4].reason !== SUPPORT_REASON) {
  fail(`Dziennik wejść administratora demo ma nieoczekiwane wpisy: ${supportKinds || "brak"}.`);
}

// --- 9b. Branding (event-branding, S-18): the restaurant's colour and logo (owner), the client's name and logo -------

const BRAND_COLOR = "#7c2d12";
const CLIENT_BRAND = "Acme Polska sp. z o.o.";
const restaurantBrand = `/api/panel/restaurants/${String(restaurantId)}/branding`;
await step("kolor marki lokalu", restaurantBrand, {
  method: "PATCH",
  json: { color: BRAND_COLOR },
  cookie: ownerCookie,
});
await step("logo lokalu", `${restaurantBrand}/logo`, {
  method: "PUT",
  bytes: logoPng(240, 96, [124, 45, 18], [253, 230, 138]),
  contentType: "image/png",
  cookie: ownerCookie,
});
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

// --- 9c. Guest data retention and the export (privacy-retention, S-26): the owner keeps the default term of 30 days;
// „Komunia Zosi (demo)” (60 days ago) lost its guests' data when it was archived (the panel's guard purges an event
// past its term before serving it) — its export says so; the manager downloads the main event's export --------------

const RETENTION_DAYS = 30;
const PURGED_EVENT = MORE_EVENTS[2].name;
const purgedEventId = moreEventIds.get(PURGED_EVENT);
const retention = await step(
  `retencja danych gości: ${String(RETENTION_DAYS)} dni`,
  `/api/panel/restaurants/${String(restaurantId)}/retention`,
  {
    method: "PATCH",
    json: { guestRetentionDays: RETENTION_DAYS },
    cookie: ownerCookie,
  },
);
if (retention.guestRetentionDays !== RETENTION_DAYS) {
  fail(`Retencja danych gości lokalu demo nie jest ${String(RETENTION_DAYS)} dni.`);
}
const purgedExport = await step(`eksport: ${PURGED_EVENT}`, `/api/panel/events/${String(purgedEventId)}/export`, {
  cookie: ownerCookie,
});
if (typeof purgedExport?.event?.guestData?.purgedAt !== "string" || purgedExport.guests.length !== 0) {
  fail(`Dane gości „${PURGED_EVENT}” (60 dni temu) nie zostały usunięte po terminie.`);
}
const exportPath = `/api/panel/events/${String(event.id)}/export`;
{
  const response = await fetch(new URL(exportPath, BASE_URL), { headers: { Cookie: TEAM[0].cookie } });
  const exported = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    !(response.headers.get("content-disposition") ?? "").startsWith("attachment;") ||
    exported?.guests?.length !== board.guestList.guests.length ||
    exported.event.guestData.purgedAt !== null
  ) {
    fail(`Menedżer demo nie pobrał eksportu „${EVENT_NAME}” (HTTP ${String(response.status)}).`);
  }
}
const privacyGuest = RSVP_BY_GUESTS[0];
const privacyUrl = new URL(`/g/${guestKeyOf(privacyGuest)}/prywatnosc`, BASE_URL).href;

// --- 10. Summary ------------------------------------------------------------------------------------------------

const seatTotal = venue.tables.reduce((sum, table) => sum + table.seatCount, 0);
const guessCount = guessBoard.guests.filter((guest) => guest.amountGrosze !== null).length;
const placeCount = guessBoard.guests.filter((guest) => guest.predictedPlace !== null).length;
const organizerUrl = new URL(`/o/${event.organizerKey}`, BASE_URL).href;

// tv-room-rotation (S-20): one TV pinned to a room (`?sala=<room name>`); its page shows that room's caption.
const PINNED_TV_ROOM = ROOMS[1].name;
const pinnedTvUrl = new URL(`/tv/${event.tvKey}?sala=${encodeURIComponent(PINNED_TV_ROOM)}`, BASE_URL).href;
{
  const response = await fetch(pinnedTvUrl);
  const html = await response.text();
  if (response.status !== 200 || !html.includes(`data-tv-room="${PINNED_TV_ROOM}"`)) {
    throw new Error(`TV przypięty do sali ${PINNED_TV_ROOM} nie pokazuje jej (${String(response.status)}).`);
  }
}

console.log(`
Dane demo gotowe („${RESTAURANT_NAME}” · „${EVENT_NAME}”, id ${String(event.id)}):
- goście: ${board.guestList.guests.length} (nieobecna: ${ABSENT}), grupy: ${GROUPS.map((group) => group.members.length).join(" + ")}
- plan ${PLAN_WIDTH}×${PLAN_HEIGHT}, sale: ${venue.rooms.length}, stoliki: ${venue.tables.length}, miejsca: ${seatTotal}
- rozsadzenie opublikowane na TV: ${board.assignments.length} osób, przypięta: ${PINNED}
- strzały: ${guessCount} (remis: Bartek i Marta, strzał nieobecnej), brakuje: ${guessBoard.missing.length}
- typy miejsc: ${placeCount} (wpisz prawidłową kwotę 1500, żeby zobaczyć podium i trafione miejsca)
- import i diety: ${String(IMPORTED_GUESTS.length)} gości z pliku CSV (podgląd, potem zapis), ${String(PATCHED_DIETS.length)} diety wpisane ręcznie; obecni: ${dietSummary} (tablet, zamówienia, sala, rozsadzenie)
- zamówienie: ${orderBoard.totals.lines} pozycji, ${orderBoard.totals.quantity} szt., wydane: ${orderBoard.totals.deliveredQuantity}
- potwierdzenia: ${rsvpSummary}
- bez zmian: przyjmowanie strzałów otwarte, prawidłowa kwota niewpisana, dostęp gości wyłączony, pytania startowe
- wydarzenia lokalu: nadchodzące ${String(eventLists.upcoming.length)}, minione ${String(eventLists.past.length)}, archiwum ${String(eventLists.archived.length)}
- zespół lokalu: ${String(team.team.members.length)} osoby (właściciel, menedżer, kelner)
- dziennik wejść administratora: wejście jako wsparcie z powodem, 2 otwarte strony, odblokowanie tematów AI, wyjście (widzi go właściciel na stronie restauracji)
- moduły: „${EVENT_NAME}” ma wszystkie gry włączone; „${VENUE_LED_EVENT}” — tematy AI odblokowane przez administratora i włączone z grą przez lokal; „Urodziny Ani (demo)” — domyślne (tematy AI i gra wyłączone)
- menu lokalu: ${String(catalog.items.length)} pozycji w 5 kursach; menu „${EVENT_NAME}” okrojone do ${String(eventMenu.items.filter((item) => item.available).length)} pozycji, zamówienie z niego (ceny i kursy z menu, kuchnia na tablecie po kursach)
- „${VENUE_LED_EVENT}”: lokal prowadzi, ${String(VENUE_LED_GUESTS.length)} gości dodanych w panelu
- marka: lokal w kolorze ${BRAND_COLOR} z logo, klient „${CLIENT_BRAND}” z logo (telefony gości, TV, tablet, karteczki, panel)
- szablon sali „${TEMPLATE_NAME}” (${String(savedTemplate.template.roomCount)} sale, ${String(savedTemplate.template.tableCount)} stolików) i wydarzenie z niego „${TEMPLATE_EVENT}”
- retencja danych gości: ${String(retention.guestRetentionDays)} dni po wydarzeniu; „${PURGED_EVENT}” — dane gości usunięte (po terminie), eksport bez gości

Organizator: ${organizerUrl}
TV:          ${new URL(`/tv/${event.tvKey}`, BASE_URL).href}
TV jednej sali (${PINNED_TV_ROOM}): ${pinnedTvUrl}
Restauracja: ${new URL(`/r/${event.restaurantKey}`, BASE_URL).href}
Linki gości: włącz dostęp na ${organizerUrl}/linki
Potwierdzenia: ${organizerUrl}/potwierdzenia (karta „Potwierdzenia i wybór dania” także w „Praca klienta” w panelu)
Panel lokalu: ${new URL("/logowanie", BASE_URL).href} — e-mail ${owner.email}, hasło ${OWNER_PASSWORD} (rola: właściciel)
             e-mail ${TEAM[0].email}, hasło ${MANAGER_PASSWORD} (rola: menedżer)
             e-mail ${TEAM[1].email}, hasło ${WAITER_PASSWORD} (rola: kelner)
Wydarzenia lokalu: ${new URL(`/panel/restauracje/${String(restaurantId)}`, BASE_URL).href} (po zalogowaniu)
Obsługa sali:    ${new URL(`/panel/obsluga/${String(event.id)}`, BASE_URL).href} (kelner ${TEAM[1].email} / ${WAITER_PASSWORD}: dziś do południa jutra; dokładka „${REFILL}” dopisana i wydana)
Kelner na imprezę: ${new URL(eventWaiter.path, BASE_URL).href} („${EVENT_WAITER}”: jednorazowy link)
                 albo kod ${eventWaiter.code} na ${new URL("/kelner", BASE_URL).href} — pierwsze użycie zużywa oba; sala „${EVENT_NAME}” do południa jutra
Odczyt bez sieci (obsługa): stan zapisany na urządzeniu, które otworzyło widok na żywo (do południa jutra)
                 tablet: ${new URL(READOUT_PATHS.tablet, BASE_URL).href}
                 sala:   ${new URL(READOUT_PATHS.floor, BASE_URL).href} (po zalogowaniu)
                 kelner na imprezę: ${new URL(READOUT_PATHS.waiter, BASE_URL).href} (po wejściu linkiem lub kodem)
Menu lokalu:     ${new URL(`/panel/restauracje/${String(restaurantId)}/menu`, BASE_URL).href} („Menu wydarzenia” na karcie wydarzenia)
Praca klienta:   ${new URL(`/panel/wydarzenia/${String(event.id)}`, BASE_URL).href} (prowadzi klient: podgląd)
                 ${new URL(`/panel/wydarzenia/${String(venueLedEventId)}`, BASE_URL).href} (lokal prowadzi: edycja w panelu)
Szablon sali:    ${new URL(`/panel/szablony/${String(templateId)}`, BASE_URL).href} („Zaktualizuj z szablonu” na karcie wydarzenia)
                 ${new URL(`/panel/wydarzenia/${String(fromTemplate.event.id)}`, BASE_URL).href} (wydarzenie z szablonu)
Eksport danych:  ${new URL(exportPath, BASE_URL).href} (JSON; ?format=guests-csv, ?format=orders-csv — właściciel lub menedżer, po zalogowaniu)
                 ${new URL(`/panel/wydarzenia/${String(purgedEventId)}`, BASE_URL).href} („${PURGED_EVENT}”: „Dane gości usunięte”)
Prywatność gościa: ${privacyUrl} (${privacyGuest}; szkic do przeglądu prawnika — działa, gdy dostęp gości jest włączony)
Panel platformy: ${new URL("/logowanie", BASE_URL).href} — e-mail ${ADMIN_EMAIL}, hasło ${ADMIN_PASSWORD}
Linki są sekretne: nie wklejaj ich publicznie.`);
