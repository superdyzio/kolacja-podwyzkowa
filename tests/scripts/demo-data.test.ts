import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DemoDataError,
  formatGrosze,
  parseCourse,
  parseDemoArgs,
  parseMenuCsv,
  parsePrice,
  parseVenue,
  pickMenuItem,
  planPng,
  seatBlocks,
  seatGuests,
  sniffImageType,
} from "../../scripts/lib/demo-data.mjs";
import {
  ABSENT,
  GROUPS,
  GUEST_DIETS,
  GUESTS,
  IMPORTED_GUESTS,
  PASTED_GUESTS,
  PINNED,
} from "../../scripts/lib/demo-guests.mjs";

// Pure parts of `npm run demo` (demo-restaurant, S-29) with fixtures and the default data files: no server, no database.

interface Table {
  id: number;
  name: string;
  shape: "round" | "rectangular";
  seatCount: number;
}

interface Seat {
  name: string;
  tableId: number;
  seat: number;
}

const readDefault = (file: string) => readFileSync(new URL(`../../scripts/demo-data/${file}`, import.meta.url), "utf8");

// The server's group rule (areConsecutiveSeats): one table; a round table's arc, or a run on ONE side of a rectangular
// table (side A = 1..ceil(n/2)). Linear runs only, which is stricter than the server (it also allows wrapping arcs).
function groupIsTogether(draft: Seat[], tables: Table[], members: string[]): boolean {
  const places = members.map((name) => draft.find((row) => row.name === name));
  if (places.some((place) => place === undefined)) {
    return false;
  }
  const tableId = places[0]?.tableId;
  if (!places.every((place) => place?.tableId === tableId)) {
    return false;
  }
  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table) {
    return false;
  }
  const seats = places.map((place) => place?.seat ?? 0).sort((a, b) => a - b);
  const consecutive = seats.every((seat, index) => index === 0 || seat === (seats[index - 1] ?? 0) + 1);
  if (table.shape === "rectangular") {
    const sideA = Math.ceil(table.seatCount / 2);
    return consecutive && (seats.every((seat) => seat <= sideA) || seats.every((seat) => seat > sideA));
  }
  return consecutive;
}

function expectValidDraft(draft: Seat[], tables: Table[], guests: string[], absent: string[]) {
  const names = draft.map((row) => row.name);
  expect(new Set(names).size).toBe(names.length);
  expect([...names].sort()).toEqual(guests.filter((name) => !absent.includes(name)).sort());
  const seats = draft.map((row) => `${String(row.tableId)}:${String(row.seat)}`);
  expect(new Set(seats).size).toBe(seats.length);
  for (const row of draft) {
    const table = tables.find((candidate) => candidate.id === row.tableId);
    expect(table).toBeDefined();
    expect(row.seat).toBeGreaterThanOrEqual(1);
    expect(row.seat).toBeLessThanOrEqual(table?.seatCount ?? 0);
  }
}

describe("parseDemoArgs", () => {
  it("reads every option, also with =", () => {
    expect(parseDemoArgs([])).toEqual({ name: null, plan: null, venue: null, menu: null, reset: false, help: false });
    expect(
      parseDemoArgs([
        "--name",
        "  Restauracja   Pod Lipą ",
        "--plan=plan.jpg",
        "--venue",
        "sala.json",
        "--menu",
        "m.csv",
        "--reset",
      ]),
    ).toEqual({
      name: "Restauracja Pod Lipą",
      plan: "plan.jpg",
      venue: "sala.json",
      menu: "m.csv",
      reset: true,
      help: false,
    });
    expect(parseDemoArgs(["--help"]).help).toBe(true);
  });

  it("refuses unknown flags, missing values and a bad name", () => {
    expect(() => parseDemoArgs(["--remote"])).toThrow(DemoDataError);
    expect(() => parseDemoArgs(["--menu"])).toThrow(/wymaga wartości/);
    expect(() => parseDemoArgs(["--menu", "--reset"])).toThrow(/wymaga wartości/);
    expect(() => parseDemoArgs(["--plan="])).toThrow(/wymaga wartości/);
    expect(() => parseDemoArgs(["--reset=1"])).toThrow(/nie przyjmuje/);
    expect(() => parseDemoArgs(["--name", "x".repeat(81)])).toThrow(/1 do 80/);
  });
});

describe("parseVenue", () => {
  const valid = {
    rooms: [{ name: " Sala  A ", outline: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }, { name: "Sala B" }],
    tables: [
      { room: "sala a", name: "Stół 1", shape: "round", seats: 8, x: 0.2, y: 0.3 },
      { room: "Sala B", name: "Stół 2", shape: "rectangular", seats: 30, x: 0.712345, y: 0.5, rotation: 90 },
    ],
  };

  it("normalizes a valid venue (default plan size, names, rooms in any case, 4-decimal fractions)", () => {
    expect(parseVenue(valid)).toEqual({
      planSize: [1600, 900],
      rooms: [
        { name: "Sala A", outline: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
        { name: "Sala B", outline: null },
      ],
      tables: [
        { room: "Sala A", name: "Stół 1", shape: "round", seats: 8, x: 0.2, y: 0.3, rotation: 0 },
        { room: "Sala B", name: "Stół 2", shape: "rectangular", seats: 30, x: 0.7123, y: 0.5, rotation: 90 },
      ],
    });
  });

  it.each([
    ["not an object", [], /obiekt JSON/],
    ["no rooms", { rooms: [], tables: valid.tables }, /brak sal/],
    ["duplicate room", { ...valid, rooms: [{ name: "A" }, { name: "a" }] }, /dwa razy/],
    [
      "outline outside",
      { ...valid, rooms: [{ name: "Sala A", outline: { x: 0.6, y: 0, width: 0.5, height: 1 } }] },
      /kontur/,
    ],
    ["no tables", { ...valid, tables: [] }, /brak stolików/],
    ["unknown room", { ...valid, tables: [{ ...valid.tables[0], room: "Taras" }] }, /nieznana sala/],
    ["duplicate table", { ...valid, tables: [valid.tables[0], { ...valid.tables[1], name: "STÓŁ 1" }] }, /dwa razy/],
    ["bad shape", { ...valid, tables: [{ ...valid.tables[0], shape: "oval" }] }, /kształt/],
    ["31 seats", { ...valid, tables: [{ ...valid.tables[0], seats: 31 }] }, /liczba miejsc/],
    ["1 seat", { ...valid, tables: [{ ...valid.tables[0], seats: 1 }] }, /liczba miejsc/],
    ["pin outside", { ...valid, tables: [{ ...valid.tables[0], x: 1.2 }] }, /ułamki planu/],
    ["rotation", { ...valid, tables: [{ ...valid.tables[0], rotation: 360 }] }, /obrót/],
    ["plan size", { ...valid, planSize: [100, 900] }, /planSize/],
    ["long table name", { ...valid, tables: [{ ...valid.tables[0], name: "x".repeat(25) }] }, /1 do 24/],
  ])("refuses %s", (_label, json, message) => {
    expect(() => parseVenue(json)).toThrow(message);
  });
});

describe("parseMenuCsv and prices", () => {
  it("reads a Polish spreadsheet's CSV with a BOM, a header and course words", () => {
    const items = parseMenuCsv(
      "\uFEFFNazwa;Kurs;Cena;W menu imprezy\r\nRosół;Zupa;18\r\n\r\nSchab;danie główne;42,5;nie\r\nKompot;NAPOJE;24 zł;tak\r\n",
    );
    expect(items).toEqual([
      { name: "Rosół", course: "soup", priceGrosze: 1800, price: "18,00", inEvent: true },
      { name: "Schab", course: "main", priceGrosze: 4250, price: "42,50", inEvent: false },
      { name: "Kompot", course: "drinks", priceGrosze: 2400, price: "24,00", inEvent: true },
    ]);
  });

  it("takes tabs or commas, quotes and English courses without a header", () => {
    expect(parseMenuCsv("Tart\tdessert\t1 499,99 zł\tyes").map((item) => item.priceGrosze)).toEqual([149_999]);
    expect(parseMenuCsv('"Water, still",drinks,"16,00",0\nSoup of the day,soup,9.5,')).toEqual([
      { name: "Water, still", course: "drinks", priceGrosze: 1600, price: "16,00", inEvent: false },
      { name: "Soup of the day", course: "soup", priceGrosze: 950, price: "9,50", inEvent: true },
    ]);
  });

  it("names the line of a problem", () => {
    expect(() => parseMenuCsv("Nazwa;Kurs;Cena\nRosół;zupa;18\nrosół;zupa;19")).toThrow(/wiersz 3.*dwa razy/);
    expect(() => parseMenuCsv("Rosół;obiad;18")).toThrow(/wiersz 1.*nieznany kurs/);
    expect(() => parseMenuCsv("Rosół;zupa;18,999")).toThrow(/cena/);
    expect(() => parseMenuCsv("Rosół;zupa;18;może")).toThrow(/tak albo nie/);
    expect(() => parseMenuCsv("Nazwa;Kurs;Cena\n")).toThrow(/puste/);
  });

  it("parses courses and prices like the app's forms", () => {
    expect(parseCourse("Przystawki")).toBe("starter");
    expect(parseCourse("DANIA GŁÓWNE")).toBe("main");
    expect(parseCourse("dania glowne")).toBe("main");
    expect(parseCourse("desery")).toBe("dessert");
    expect(parseCourse("obiad")).toBeNull();
    expect(parsePrice("1 499,99 zł")).toBe(149_999);
    expect(parsePrice("24 PLN")).toBe(2400);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("100000")).toBe(10_000_000);
    expect(parsePrice("100000,01")).toBeNull();
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("1.500,00")).toBeNull();
    expect(formatGrosze(3250)).toBe("32,50");
    expect(formatGrosze(5)).toBe("0,05");
  });
});

describe("images", () => {
  it("sniffs the plan types the app accepts", () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("<svg></svg>"))).toBeNull();
  });

  it("draws a PNG of the venue's plan size", () => {
    const venue = parseVenue({
      planSize: [400, 300],
      rooms: [{ name: "A", outline: { x: 0, y: 0, width: 1, height: 1 } }],
      tables: [
        { room: "A", name: "T1", shape: "round", seats: 4, x: 0.3, y: 0.5 },
        { room: "A", name: "T2", shape: "rectangular", seats: 6, x: 0.7, y: 0.5, rotation: 90 },
      ],
    });
    const png = planPng(venue);
    expect(sniffImageType(png)).toBe("image/png");
    expect(png.readUInt32BE(16)).toBe(400);
    expect(png.readUInt32BE(20)).toBe(300);
  });
});

describe("seatGuests", () => {
  const tables: Table[] = [
    { id: 11, name: "Okrągły", shape: "round", seatCount: 6 },
    { id: 12, name: "Prostokątny", shape: "rectangular", seatCount: 7 },
    { id: 13, name: "Mały", shape: "round", seatCount: 2 },
  ];

  it("splits rectangular tables into their sides", () => {
    expect(seatBlocks(tables[1])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ]);
    expect(seatBlocks(tables[0])).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("seats every present guest once, groups together at different tables, the absent nowhere", () => {
    const guests = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const groups = [{ members: ["B", "C"] }, { members: ["D", "E", "F", "G"] }, { members: ["H", "Z"] }];
    const draft = seatGuests({ tables, guests, groups, absent: ["K", "Z"] });
    expectValidDraft(draft, tables, guests, ["K"]);
    expect(groupIsTogether(draft, tables, ["D", "E", "F", "G"])).toBe(true);
    expect(groupIsTogether(draft, tables, ["B", "C"])).toBe(true);
    const tableOf = (name: string) => draft.find((row) => row.name === name)?.tableId;
    expect(tableOf("D")).not.toBe(tableOf("B"));
    // The largest group goes first, to the first table (the round one), on its lowest run.
    expect(draft.filter((row) => ["D", "E", "F", "G"].includes(row.name)).map((row) => row.seat)).toEqual([1, 2, 3, 4]);
  });

  it("puts a group on side B of a rectangular table when side A is not free", () => {
    const table: Table = { id: 1, name: "Długi", shape: "rectangular", seatCount: 8 };
    const draft = seatGuests({
      tables: [table],
      guests: ["A", "B", "C", "D", "E", "F"],
      groups: [{ members: ["A", "B", "C"] }, { members: ["D", "E", "F"] }],
    });
    expect(groupIsTogether(draft, [table], ["A", "B", "C"])).toBe(true);
    expect(groupIsTogether(draft, [table], ["D", "E", "F"])).toBe(true);
    expect(draft.filter((row) => ["D", "E", "F"].includes(row.name)).map((row) => row.seat)).toEqual([5, 6, 7]);
  });

  it("stops with a message when seats or a run do not suffice", () => {
    expect(() => seatGuests({ tables: [tables[2]], guests: ["A", "B", "C"], groups: [], absent: [] })).toThrow(
      /2 miejsc.*3/,
    );
    expect(() =>
      seatGuests({
        tables: [tables[2], tables[0]],
        guests: ["A", "B", "C", "D", "E", "F", "G", "H"],
        groups: [{ members: ["A", "B", "C", "D", "E", "F", "G"] }],
      }),
    ).toThrow(/nie mieści się/);
  });
});

describe("pickMenuItem", () => {
  const items = [
    { name: "Żurek", course: "soup", priceGrosze: 2200, available: false },
    { name: "Schabowy", course: "main", priceGrosze: 4200, available: true },
    { name: "Pierogi", course: "main", priceGrosze: 3250, available: true },
    { name: "Kompot", course: "drinks", priceGrosze: 2400 },
  ];

  it("takes the n-th available item of the first course that has one, in the app's order", () => {
    expect(pickMenuItem(items, ["main"], 0)?.name).toBe("Pierogi");
    expect(pickMenuItem(items, ["main"], 1)?.name).toBe("Schabowy");
    expect(pickMenuItem(items, ["main"], 2)?.name).toBe("Pierogi");
    expect(pickMenuItem(items, ["soup", "drinks"], 0)?.name).toBe("Kompot");
    expect(pickMenuItem(items, ["dessert"], 0)?.name).toBe("Pierogi");
    expect(pickMenuItem([], ["main"], 0)).toBeNull();
  });
});

describe("default demo data", () => {
  const venue = parseVenue(JSON.parse(readDefault("sala.json")) as unknown);
  const menu = parseMenuCsv(readDefault("menu.csv"));

  it("has 80 unique guests, 30 pasted and 50 imported, diets only for known guests", () => {
    expect(GUESTS).toHaveLength(80);
    expect(new Set(GUESTS.map((name: string) => name.toLocaleLowerCase("pl"))).size).toBe(80);
    expect(PASTED_GUESTS).toHaveLength(30);
    expect(IMPORTED_GUESTS).toHaveLength(50);
    expect(GUESTS.every((name: string) => Array.from(name).length <= 40)).toBe(true);
    expect(GUESTS.filter((name: string) => name.toLowerCase().includes("ania"))).toEqual(["Ania"]);
    for (const name of GUEST_DIETS.keys()) {
      expect(GUESTS).toContain(name);
    }
    expect(GUESTS).toContain(ABSENT);
    expect(GUESTS).toContain(PINNED);
    expect(
      GROUPS.flatMap((group: { members: string[] }) => group.members).every((name: string) => GUESTS.includes(name)),
    ).toBe(true);
  });

  it("seats the demo's present guests on the default venue with every group together", () => {
    expect(venue.rooms).toHaveLength(3);
    expect(venue.tables).toHaveLength(14);
    expect(venue.rooms.every((room: { outline: unknown }) => room.outline !== null)).toBe(true);
    const tables: Table[] = venue.tables.map(
      (table: { name: string; shape: "round" | "rectangular"; seats: number }, index: number) => ({
        id: index + 1,
        name: table.name,
        shape: table.shape,
        seatCount: table.seats,
      }),
    );
    expect(tables.reduce((sum, table) => sum + table.seatCount, 0)).toBe(98);
    const draft = seatGuests({ tables, guests: GUESTS, groups: GROUPS, absent: [ABSENT] });
    expectValidDraft(draft, tables, GUESTS, [ABSENT]);
    for (const group of GROUPS) {
      expect(groupIsTogether(draft, tables, group.members)).toBe(true);
    }
  });

  it("has a menu in all five courses with two main courses and a drink for the party", () => {
    expect(menu).toHaveLength(13);
    expect(new Set(menu.map((item: { course: string }) => item.course)).size).toBe(5);
    const party = menu.filter((item: { inEvent: boolean }) => item.inEvent);
    expect(party.filter((item: { course: string }) => item.course === "main").length).toBeGreaterThanOrEqual(2);
    expect(party.some((item: { course: string }) => item.course === "drinks")).toBe(true);
  });

  it("draws the default plan at 1600 × 900", () => {
    const png = planPng(venue);
    expect(png.readUInt32BE(16)).toBe(1600);
    expect(png.readUInt32BE(20)).toBe(900);
  });
});
