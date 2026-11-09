// Fills the LOCAL app with demo data for the manual checks: 40 fictional guests, a generated venue plan, 3 rooms,
// 7 tables (45 seats), groups of 4, 2 and 2, one absent and one pinned guest, a published seating, 30 guesses
// (a tie and the absent guest's guess among them, 10 missing, 12 with a place prediction) and a food order (lines for guests, for tables, one
// unassigned, one delivered). Every run creates a NEW restaurant „Restauracja demo” with a new event „Kolacja
// podwyżkowa (demo)” in the LOCAL database (like `npm run event:create`; refused for any other SUPABASE_URL), so other
// events are never touched. Every write after that goes through the HTTP API of a running server, so it passes the
// same validation as the UI. Defaults stay as they are: guest access OFF, guess intake OPEN, no correct amount, only
// the starter questions.
// Usage: npm run build && npm run preview, then npm run demo   (BASE_URL, default http://localhost:4321)
// Zero dependencies.

import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { createEvent, createRestaurant, PlatformError, readDbEnv } from "./lib/platform.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const RESTAURANT_NAME = "Restauracja demo";
const EVENT_NAME = "Kolacja podwyżkowa (demo)";

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

// --- Helpers ---------------------------------------------------------------------------------------------------

function fail(message) {
  console.error(message);
  process.exit(1);
}

let dataWritten = false;

async function request(path, { method = "GET", json, bytes, contentType } = {}) {
  const headers = { Origin: BASE_URL };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
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
  return { status: response.status, text, data };
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

  const rowLength = 1 + PLAN_WIDTH * 3;
  const raw = Buffer.alloc(PLAN_HEIGHT * rowLength); // filter byte 0 (none) at the start of every row
  for (let y = 0; y < PLAN_HEIGHT; y++) {
    pixels.copy(raw, y * rowLength + 1, y * PLAN_WIDTH * 3, (y + 1) * PLAN_WIDTH * 3);
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
  header.writeUInt32BE(PLAN_WIDTH, 0);
  header.writeUInt32BE(PLAN_HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8); // bit depth 8, colour type 2 (RGB), deflate, no filter method, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const fraction = (value, total) => Math.round((value / total) * 10_000) / 10_000;

// --- 1. A new restaurant and event in the local database; the running server must know its key ------------------

let event;
try {
  const env = readDbEnv({ requireLocal: true });
  const restaurant = await createRestaurant(env, RESTAURANT_NAME);
  event = await createEvent(env, restaurant.id, EVENT_NAME);
  console.log(
    `Baza ${env.host}: restauracja „${restaurant.name}” (id ${String(restaurant.id)}), wydarzenie „${event.name}” (id ${String(event.id)}).`,
  );
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

const pasted = await step("lista gości", `${api}/guests`, { method: "POST", json: { text: GUESTS.join("\n") } }, 201);
const guestId = new Map(pasted.guests.map((guest) => [guest.displayName, guest.id]));
const missingNames = GUESTS.filter((name) => !guestId.has(name));
if (missingNames.length > 0) {
  fail(`Po wklejeniu brakuje gości: ${missingNames.join(", ")}.`);
}
const idOf = (name) => guestId.get(name);

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

// --- 5. Guesses by organizer proxy ----------------------------------------------------------------------------

let guessBoard;
for (const [name, amount, place] of GUESSES) {
  guessBoard = await step(`strzał ${name}`, `${api}/guesses/${idOf(name)}`, {
    method: "PUT",
    json: place === undefined ? { amount } : { amount, place },
  });
}

// --- 6. Food order -----------------------------------------------------------------------------------------------

let orderBoard;
for (const [name, price, quantity, note, target] of ORDERS) {
  const assignment =
    target === null
      ? null
      : typeof target === "string"
        ? { guestId: idOf(target) }
        : { tableId: tableByName.get(target.table).id };
  orderBoard = await step(
    `zamówienie ${name}`,
    `${api}/orders`,
    { method: "POST", json: { name, price, quantity, note, assignment } },
    201,
  );
}
const firstLine = orderBoard.items[0];
orderBoard = await step(`wydane: ${firstLine.name}`, `${api}/orders/${firstLine.id}`, {
  method: "PATCH",
  json: { delivered: true },
});

// --- 7. Summary -------------------------------------------------------------------------------------------------

const seatTotal = venue.tables.reduce((sum, table) => sum + table.seatCount, 0);
const guessCount = guessBoard.guests.filter((guest) => guest.amountGrosze !== null).length;
const placeCount = guessBoard.guests.filter((guest) => guest.predictedPlace !== null).length;
const organizerUrl = new URL(`/o/${event.organizerKey}`, BASE_URL).href;

console.log(`
Dane demo gotowe („${RESTAURANT_NAME}” · „${EVENT_NAME}”, id ${String(event.id)}):
- goście: ${board.guestList.guests.length} (nieobecna: ${ABSENT}), grupy: ${GROUPS.map((group) => group.members.length).join(" + ")}
- plan ${PLAN_WIDTH}×${PLAN_HEIGHT}, sale: ${venue.rooms.length}, stoliki: ${venue.tables.length}, miejsca: ${seatTotal}
- rozsadzenie opublikowane na TV: ${board.assignments.length} osób, przypięta: ${PINNED}
- strzały: ${guessCount} (remis: Bartek i Marta, strzał nieobecnej), brakuje: ${guessBoard.missing.length}
- typy miejsc: ${placeCount} (wpisz prawidłową kwotę 1500, żeby zobaczyć podium i trafione miejsca)
- zamówienie: ${orderBoard.totals.lines} pozycji, ${orderBoard.totals.quantity} szt., wydane: ${orderBoard.totals.deliveredQuantity}
- bez zmian: przyjmowanie strzałów otwarte, prawidłowa kwota niewpisana, dostęp gości wyłączony, pytania startowe

Organizator: ${organizerUrl}
TV:          ${new URL(`/tv/${event.tvKey}`, BASE_URL).href}
Restauracja: ${new URL(`/r/${event.restaurantKey}`, BASE_URL).href}
Linki gości: włącz dostęp na ${organizerUrl}/linki
Linki są sekretne: nie wklejaj ich publicznie.`);
