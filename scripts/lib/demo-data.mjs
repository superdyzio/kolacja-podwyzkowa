// Pure parts of `npm run demo` (demo-restaurant, S-29): the command-line options, the demo restaurant's venue and menu
// files (defaults in scripts/demo-data/, replaceable by the restaurant's real plan and menu), the generated plan and logo
// images, a seating of the guests on any venue that the server's draft rules accept, and the choice of dishes from any
// menu. No network, no database, no files: scripts/demo.mjs reads the files and drives the HTTP API;
// tests/scripts/demo-data.test.ts pins these rules. Zero dependencies.
//
// Errors throw DemoDataError with a Polish message (the demo prints it and stops before writing anything).

import { Buffer } from "node:buffer";
import { crc32, deflateSync } from "node:zlib";

export class DemoDataError extends Error {}

/**
 * @typedef {{ name: string | null, plan: string | null, venue: string | null, menu: string | null, reset: boolean, help: boolean }} DemoOptions
 * @typedef {{ x: number, y: number, width: number, height: number }} Outline
 * @typedef {{ name: string, outline: Outline | null }} VenueRoom
 * @typedef {{ room: string, name: string, shape: "round" | "rectangular", seats: number, x: number, y: number, rotation: number }} VenueTable
 * @typedef {{ planSize: [number, number], rooms: VenueRoom[], tables: VenueTable[] }} Venue
 * @typedef {{ name: string, course: string, priceGrosze: number, price: string, inEvent: boolean }} MenuEntry
 * @typedef {{ id: number, name: string, shape: string, seatCount: number }} DraftTable
 * @typedef {{ name: string, tableId: number, seat: number }} DraftSeat
 * @typedef {{ name: string, course: string, priceGrosze: number, available?: boolean }} MenuChoice
 */

// The app's limits (src/lib/venue/rules.ts, src/lib/menu/rules.ts, src/lib/venue/image.ts); the server checks them
// again, these only make the demo stop early with a message that names the file's line.
export const MENU_COURSES = ["starter", "soup", "main", "dessert", "drinks"];
export const MAX_PLAN_BYTES = 4 * 1024 * 1024;
export const MAX_ROOMS = 10;
export const MAX_TABLES = 60;
export const MIN_SEATS = 2;
export const MAX_SEATS = 30;
export const MAX_MENU_ITEMS = 300;
const MAX_ROOM_NAME = 40;
const MAX_TABLE_NAME = 24;
const MAX_DISH_NAME = 80;
const MAX_PRICE_GROSZE = 10_000_000;
const DEFAULT_PLAN_SIZE = [1600, 900];

const dishCollator = new Intl.Collator("pl", { numeric: true });

// --- Options --------------------------------------------------------------------------------------------------------

const VALUE_FLAGS = { "--name": "name", "--plan": "plan", "--venue": "venue", "--menu": "menu" };

// `npm run demo -- [--name "<restaurant name>"] [--plan <image>] [--venue <json>] [--menu <csv>] [--reset] [--help]`
// (also `--flag=value`). Unknown flags and missing values throw.
/**
 * @param {readonly string[]} argv
 * @returns {DemoOptions}
 */
export function parseDemoArgs(argv) {
  const options = { name: null, plan: null, venue: null, menu: null, reset: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const raw = String(argv[index]);
    const eq = raw.indexOf("=");
    const flag = raw.startsWith("--") && eq > 0 ? raw.slice(0, eq) : raw;
    if (flag === "--reset" || flag === "--help" || flag === "-h") {
      if (flag !== raw) {
        throw new DemoDataError(`Opcja ${flag} nie przyjmuje wartości.`);
      }
      options[flag === "--reset" ? "reset" : "help"] = true;
      continue;
    }
    const key = VALUE_FLAGS[flag];
    if (!key) {
      throw new DemoDataError(`Nieznana opcja: ${raw} (dozwolone: --name, --plan, --venue, --menu, --reset, --help).`);
    }
    let value;
    if (flag !== raw) {
      value = raw.slice(eq + 1);
    } else {
      value = argv[index + 1];
      index++;
    }
    if (value === undefined || String(value).startsWith("--") || String(value).trim() === "") {
      throw new DemoDataError(`Opcja ${flag} wymaga wartości.`);
    }
    options[key] = String(value).trim();
  }
  if (options.name !== null) {
    const name = normalizeText(options.name);
    if (codePoints(name) < 1 || codePoints(name) > 80) {
      throw new DemoDataError("Nazwa restauracji (--name) musi mieć od 1 do 80 znaków.");
    }
    options.name = name;
  }
  return options;
}

// --- Text helpers ---------------------------------------------------------------------------------------------------

// Like the app's names: NFC, runs of whitespace as one space, trimmed.
/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeText(raw) {
  return String(raw).normalize("NFC").replace(/\s+/gu, " ").trim();
}

function codePoints(text) {
  return Array.from(text).length;
}

function nameKey(text) {
  return normalizeText(text).toLocaleLowerCase("pl");
}

// Lowercase without Polish diacritics: the key for course and yes/no words.
function wordKey(text) {
  return normalizeText(text).toLocaleLowerCase("pl").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("ł", "l");
}

// 1850 → "18,50" (the price as the app's forms type it).
/**
 * @param {number} grosze
 * @returns {string}
 */
export function formatGrosze(grosze) {
  return `${String(Math.floor(grosze / 100))},${String(grosze % 100).padStart(2, "0")}`;
}

// "18", "18,5", "18.50", "1 499,99 zł", "24 PLN" → grosze; anything else (or above 100 000 zł) → null.
/**
 * @param {unknown} text
 * @returns {number | null}
 */
export function parsePrice(text) {
  const cleaned = String(text)
    .replace(/[\s\u00a0\u202f]/gu, "")
    .replace(/(zł|zl|pln)$/iu, "");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/u.exec(cleaned);
  if (!match) {
    return null;
  }
  const grosze = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return grosze <= MAX_PRICE_GROSZE ? grosze : null;
}

// --- Venue (sala.json) ----------------------------------------------------------------------------------------------

function isFraction(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

const round4 = (value) => Math.round(value * 10_000) / 10_000;

// The demo venue: { planSize?: [w, h], rooms: [{ name, outline?: { x, y, width, height } }], tables: [{ room, name,
// shape: "round" | "rectangular", seats, x, y, rotation? }] } with fractions of the plan (x, y = the table's centre,
// as the app's pins). Validated like the app; returns the normalized venue.
/**
 * @param {any} json
 * @returns {Venue}
 */
export function parseVenue(json) {
  const fail = (message) => {
    throw new DemoDataError(`Plik sali: ${message}`);
  };
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    fail("oczekiwany obiekt JSON z polami rooms i tables.");
  }
  let planSize = DEFAULT_PLAN_SIZE;
  if (json.planSize !== undefined) {
    const [width, height] = Array.isArray(json.planSize) ? json.planSize : [];
    const okSize = (value) => Number.isInteger(value) && value >= 200 && value <= 4000;
    if (!okSize(width) || !okSize(height) || json.planSize.length !== 2) {
      fail("planSize to [szerokość, wysokość] w pikselach, każda od 200 do 4000.");
    }
    planSize = [width, height];
  }
  if (!Array.isArray(json.rooms) || json.rooms.length === 0) {
    fail("brak sal (rooms).");
  }
  if (json.rooms.length > MAX_ROOMS) {
    fail(`najwyżej ${String(MAX_ROOMS)} sal.`);
  }
  const rooms = [];
  const roomKeys = new Set();
  for (const [index, room] of json.rooms.entries()) {
    const label = `sala ${String(index + 1)}`;
    const name = normalizeText(room?.name ?? "");
    if (codePoints(name) < 1 || codePoints(name) > MAX_ROOM_NAME) {
      fail(`${label}: nazwa musi mieć od 1 do ${String(MAX_ROOM_NAME)} znaków.`);
    }
    if (roomKeys.has(nameKey(name))) {
      fail(`sala „${name}” jest dwa razy.`);
    }
    roomKeys.add(nameKey(name));
    let outline = null;
    if (room.outline !== undefined && room.outline !== null) {
      const { x, y, width, height } = room.outline;
      const valid =
        isFraction(x) &&
        isFraction(y) &&
        isFraction(width) &&
        isFraction(height) &&
        width > 0 &&
        height > 0 &&
        x + width <= 1.0001 &&
        y + height <= 1.0001;
      if (!valid) {
        fail(`sala „${name}”: kontur (outline) to x, y, width, height jako ułamki planu 0–1, w obrębie planu.`);
      }
      outline = { x: round4(x), y: round4(y), width: round4(width), height: round4(height) };
    }
    rooms.push({ name, outline });
  }
  if (!Array.isArray(json.tables) || json.tables.length === 0) {
    fail("brak stolików (tables).");
  }
  if (json.tables.length > MAX_TABLES) {
    fail(`najwyżej ${String(MAX_TABLES)} stolików.`);
  }
  const roomByKey = new Map(rooms.map((room) => [nameKey(room.name), room.name]));
  const tables = [];
  const tableKeys = new Set();
  for (const [index, table] of json.tables.entries()) {
    const name = normalizeText(table?.name ?? "");
    const label = name === "" ? `stolik ${String(index + 1)}` : `stolik „${name}”`;
    if (codePoints(name) < 1 || codePoints(name) > MAX_TABLE_NAME) {
      fail(`${label}: nazwa musi mieć od 1 do ${String(MAX_TABLE_NAME)} znaków.`);
    }
    if (tableKeys.has(nameKey(name))) {
      fail(`stolik „${name}” jest dwa razy (nazwy stolików są wspólne dla całego lokalu).`);
    }
    tableKeys.add(nameKey(name));
    const room = roomByKey.get(nameKey(table.room ?? ""));
    if (!room) {
      fail(`${label}: nieznana sala „${String(table.room ?? "")}”.`);
    }
    if (table.shape !== "round" && table.shape !== "rectangular") {
      fail(`${label}: kształt (shape) to "round" albo "rectangular".`);
    }
    if (!Number.isInteger(table.seats) || table.seats < MIN_SEATS || table.seats > MAX_SEATS) {
      fail(`${label}: liczba miejsc (seats) od ${String(MIN_SEATS)} do ${String(MAX_SEATS)}.`);
    }
    if (!isFraction(table.x) || !isFraction(table.y)) {
      fail(`${label}: x i y to środek stolika jako ułamki planu 0–1.`);
    }
    const rotation = table.rotation ?? 0;
    if (!Number.isInteger(rotation) || rotation < 0 || rotation > 359) {
      fail(`${label}: obrót (rotation) to liczba całkowita stopni 0–359.`);
    }
    tables.push({
      room,
      name,
      shape: table.shape,
      seats: table.seats,
      x: round4(table.x),
      y: round4(table.y),
      rotation,
    });
  }
  return { planSize, rooms, tables };
}

// --- Menu (menu.csv) ------------------------------------------------------------------------------------------------

const COURSE_WORDS = new Map(
  [
    [
      "starter",
      ["starter", "starters", "przystawka", "przystawki", "przekaska", "przekaski", "appetizer", "appetizers"],
    ],
    ["soup", ["soup", "soups", "zupa", "zupy"]],
    [
      "main",
      [
        "main",
        "mains",
        "main course",
        "main courses",
        "danie glowne",
        "dania glowne",
        "glowne",
        "glowna",
        "drugie danie",
      ],
    ],
    ["dessert", ["dessert", "desserts", "deser", "desery"]],
    ["drinks", ["drinks", "drink", "napoj", "napoje", "beverage", "beverages"]],
  ].flatMap(([course, words]) => words.map((word) => [word, course])),
);

// A course key, Polish or English word (any case, with or without diacritics) → the course key, else null.
/**
 * @param {unknown} text
 * @returns {string | null}
 */
export function parseCourse(text) {
  return COURSE_WORDS.get(wordKey(text)) ?? null;
}

const YES = new Set(["", "tak", "t", "yes", "y", "1", "x", "true"]);
const NO = new Set(["nie", "n", "no", "0", "false"]);
const HEADER_WORDS = new Set(["nazwa", "name", "danie", "dish", "pozycja", "item"]);

// One CSV record per line, RFC 4180 quotes ("" inside quotes, the separator inside quotes); line breaks inside quotes
// are not needed for a menu and end the record.
function splitCsvLine(line, separator) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

// The restaurant's menu as a spreadsheet saves it: "Nazwa;Kurs;Cena;W menu imprezy" (the header is optional, the
// fourth column too: empty = yes). Separator = tab, else ";", else "," by the first line (with "," write prices with a
// dot or in quotes). Course: a key or a Polish / English word; price as typed in Polish formats. → [{ name, course,
// priceGrosze, price ("18,00"), inEvent }] in file order.
/**
 * @param {string} text
 * @returns {MenuEntry[]}
 */
export function parseMenuCsv(text) {
  const lines = String(text)
    .replace(/^\uFEFF/u, "")
    .split(/\r\n|\n|\r/u);
  const firstLine = lines.find((line) => line.trim() !== "") ?? "";
  const separator = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const items = [];
  const keys = new Set();
  let headerChecked = false;
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }
    const row = `Menu, wiersz ${String(index + 1)}`;
    const cells = splitCsvLine(line, separator);
    if (!headerChecked) {
      headerChecked = true;
      if (HEADER_WORDS.has(wordKey(cells[0] ?? ""))) {
        continue;
      }
    }
    const [rawName = "", rawCourse = "", rawPrice = "", rawInEvent = ""] = cells;
    const name = normalizeText(rawName);
    if (codePoints(name) < 1 || codePoints(name) > MAX_DISH_NAME) {
      throw new DemoDataError(`${row}: nazwa dania musi mieć od 1 do ${String(MAX_DISH_NAME)} znaków.`);
    }
    if (keys.has(nameKey(name))) {
      throw new DemoDataError(`${row}: „${name}” jest w menu dwa razy.`);
    }
    keys.add(nameKey(name));
    const course = parseCourse(rawCourse);
    if (!course) {
      throw new DemoDataError(
        `${row}: nieznany kurs „${rawCourse}” (przystawka, zupa, danie główne, deser, napoje — albo starter, soup, main, dessert, drinks).`,
      );
    }
    const priceGrosze = parsePrice(rawPrice);
    if (priceGrosze === null) {
      throw new DemoDataError(`${row}: cena „${rawPrice}” — wpisz np. 18, 18,50 albo 1 499,99 zł (do 100 000 zł).`);
    }
    const flag = wordKey(rawInEvent);
    if (!YES.has(flag) && !NO.has(flag)) {
      throw new DemoDataError(`${row}: „W menu imprezy” to tak albo nie (puste = tak), a jest „${rawInEvent}”.`);
    }
    items.push({ name, course, priceGrosze, price: formatGrosze(priceGrosze), inEvent: YES.has(flag) });
  }
  if (items.length === 0) {
    throw new DemoDataError("Menu jest puste.");
  }
  if (items.length > MAX_MENU_ITEMS) {
    throw new DemoDataError(
      `Menu ma ${String(items.length)} pozycji, a lokal może mieć najwyżej ${String(MAX_MENU_ITEMS)}.`,
    );
  }
  return items;
}

// --- Images ---------------------------------------------------------------------------------------------------------

// What the app accepts as a plan (by the magic bytes, like src/lib/venue/image.ts), else null.
/**
 * @param {Uint8Array} bytes
 * @returns {"image/png" | "image/jpeg" | "image/webp" | null}
 */
export function sniffImageType(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// Encodes RGB pixels (3 bytes per pixel, rows top to bottom) as a PNG.
/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer} pixels
 * @returns {Buffer}
 */
export function rgbPng(width, height, pixels) {
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

const ROOM_COLOURS = [
  { fill: [219, 232, 245], border: [96, 125, 160] },
  { fill: [246, 227, 207], border: [170, 120, 80] },
  { fill: [220, 239, 217], border: [95, 145, 95] },
  { fill: [236, 226, 244], border: [125, 95, 160] },
  { fill: [245, 240, 212], border: [160, 140, 70] },
];

// A table's size on the generated plan in pixels of a 1600-wide plan: round = radius, rectangular = [width, height]
// (seats on the two long sides, none at the ends, like the app's drawing).
export function tableDrawSize(table) {
  if (table.shape === "round") {
    return Math.round(30 + 5.6 * table.seats);
  }
  const perSide = Math.ceil(table.seats / 2);
  return [50 + 78 * perSide, 60 + 10 * perSide];
}

// The generated plan of a venue (the default until the restaurant's real plan): rooms as framed rectangles from their
// outlines, tables as wooden shapes at their pins (rotated by 90° when the venue says so; other angles drawn level).
/**
 * @param {Venue} venue
 * @returns {Buffer}
 */
export function planPng(venue) {
  const [width, height] = venue.planSize;
  const scale = width / 1600;
  const pixels = Buffer.alloc(width * height * 3);
  const paint = (x, y, [r, g, b]) => {
    const offset = (y * width + x) * 3;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  };
  const fillRect = (x0, y0, x1, y1, colour) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(height, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(width, Math.round(x1)); x++) {
        paint(x, y, colour);
      }
    }
  };
  const fillCircle = (cx, cy, radius, colour) => {
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          paint(x, y, colour);
        }
      }
    }
  };

  fillRect(0, 0, width, height, [247, 245, 240]);
  const border = Math.max(2, Math.round(8 * scale));
  venue.rooms.forEach((room, index) => {
    if (!room.outline) {
      return;
    }
    const { fill, border: frame } = ROOM_COLOURS[index % ROOM_COLOURS.length];
    const x0 = room.outline.x * width;
    const y0 = room.outline.y * height;
    const x1 = x0 + room.outline.width * width;
    const y1 = y0 + room.outline.height * height;
    fillRect(x0, y0, x1, y1, frame);
    fillRect(x0 + border, y0 + border, x1 - border, y1 - border, fill);
  });
  const edge = [120, 92, 62];
  const wood = [196, 164, 122];
  const rim = Math.max(2, Math.round(5 * scale));
  for (const table of venue.tables) {
    const cx = table.x * width;
    const cy = table.y * height;
    const size = tableDrawSize(table);
    if (table.shape === "round") {
      fillCircle(cx, cy, size * scale, edge);
      fillCircle(cx, cy, size * scale - rim, wood);
    } else {
      const turned = table.rotation % 180 === 90;
      const [w, h] = (turned ? [size[1], size[0]] : size).map((value) => value * scale);
      const [x0, y0] = [cx - w / 2, cy - h / 2];
      fillRect(x0, y0, x0 + w, y0 + h, edge);
      fillRect(x0 + rim, y0 + rim, x0 + w - rim, y0 + h - rim, wood);
    }
  }
  return rgbPng(width, height, pixels);
}

// A simple logo — a coloured badge with a ring and a bar, `width` × `height` (event-branding, S-18).
/**
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number]} background
 * @param {[number, number, number]} foreground
 * @returns {Buffer}
 */
export function logoPng(width, height, background, foreground) {
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

// --- Seating --------------------------------------------------------------------------------------------------------

// Runs of seats a group may take (the server's areConsecutiveSeats): a round table's seats 1..n in order; a
// rectangular table's side A (1..ceil(n/2)) and side B (the rest), never across the sides.
/**
 * @param {{ shape: string, seatCount: number }} table
 * @returns {number[][]}
 */
export function seatBlocks(table) {
  const seats = Array.from({ length: table.seatCount }, (_, index) => index + 1);
  if (table.shape !== "rectangular") {
    return [seats];
  }
  const sideA = Math.ceil(table.seatCount / 2);
  return [seats.slice(0, sideA), seats.slice(sideA)].filter((block) => block.length > 0);
}

// A whole draft for the venue's tables ([{ id, name, shape, seatCount }] in the venue's order): groups first, largest
// first, each at the first table without a group that has a free run of its size (else any table that has one), on the
// lowest such run; then every other present guest at the table with the most free seats (the venue's order on a tie),
// on its lowest free seat. Absent guests get no seat. → [{ name, tableId, seat }] (the order of placement).
/**
 * @param {{ tables: readonly DraftTable[], guests: readonly string[], groups?: readonly { members: readonly string[] }[], absent?: readonly string[] }} input
 * @returns {DraftSeat[]}
 */
export function seatGuests({ tables, guests, groups = [], absent = [] }) {
  const absentSet = new Set(absent);
  const present = guests.filter((name) => !absentSet.has(name));
  const totalSeats = tables.reduce((sum, table) => sum + table.seatCount, 0);
  if (present.length > totalSeats) {
    throw new DemoDataError(
      `Sala ma ${String(totalSeats)} miejsc, a obecnych gości demo jest ${String(present.length)}: dodaj stoliki w szablonie albo podaj większą salę (--venue).`,
    );
  }
  const free = new Map(tables.map((table) => [table.id, new Set(seatBlocks(table).flat())]));
  const withGroup = new Set();
  const placed = new Set();
  /** @type {DraftSeat[]} */
  const draft = [];
  const take = (name, table, seat) => {
    draft.push({ name, tableId: table.id, seat });
    free.get(table.id).delete(seat);
    placed.add(name);
  };
  const runAt = (table, size) => {
    for (const block of seatBlocks(table)) {
      for (let start = 0; start + size <= block.length; start++) {
        const run = block.slice(start, start + size);
        if (run.every((seat) => free.get(table.id).has(seat))) {
          return run;
        }
      }
    }
    return null;
  };

  const ordered = groups
    .map((group, index) => ({ members: group.members.filter((name) => !absentSet.has(name)), index }))
    .filter((group) => group.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length || a.index - b.index);
  for (const group of ordered) {
    let spot = null;
    for (const candidates of [tables.filter((table) => !withGroup.has(table.id)), tables]) {
      for (const table of candidates) {
        const run = runAt(table, group.members.length);
        if (run) {
          spot = { table, run };
          break;
        }
      }
      if (spot) {
        break;
      }
    }
    if (!spot) {
      throw new DemoDataError(
        `Grupa ${group.members.join(", ")} nie mieści się przy żadnym stoliku (potrzeba ${String(group.members.length)} wolnych miejsc obok siebie po jednej stronie).`,
      );
    }
    withGroup.add(spot.table.id);
    group.members.forEach((name, index) => {
      take(name, spot.table, spot.run[index]);
    });
  }

  for (const name of present.filter((candidate) => !placed.has(candidate))) {
    let best = null;
    for (const table of tables) {
      if (best === null || free.get(table.id).size > free.get(best.id).size) {
        best = table;
      }
    }
    if (best === null || free.get(best.id).size === 0) {
      throw new DemoDataError("Za mało wolnych miejsc dla obecnych gości demo.");
    }
    take(name, best, Math.min(...free.get(best.id)));
  }
  return draft;
}

// --- Dishes ---------------------------------------------------------------------------------------------------------

// The app's menu order: course (the kitchen's order), then Polish name order.
export function compareMenuItems(a, b) {
  return MENU_COURSES.indexOf(a.course) - MENU_COURSES.indexOf(b.course) || dishCollator.compare(a.name, b.name);
}

// The `pick`-th (modulo) available item of the first listed course that has any, else of the whole available menu,
// else null. `items` = the event menu's items ({ name, course, priceGrosze, available? }); missing `available` = yes.
/**
 * @template {MenuChoice} T
 * @param {readonly T[]} items
 * @param {readonly string[]} courses
 * @param {number} [pick]
 * @returns {T | null}
 */
export function pickMenuItem(items, courses, pick = 0) {
  const available = items.filter((item) => item.available !== false).sort(compareMenuItems);
  for (const course of courses) {
    const inCourse = available.filter((item) => item.course === course);
    if (inCourse.length > 0) {
      return inCourse[pick % inCourse.length];
    }
  }
  return available.length > 0 ? available[pick % available.length] : null;
}
