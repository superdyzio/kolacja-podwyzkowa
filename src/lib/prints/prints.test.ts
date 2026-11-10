import { describe, expect, it } from "vitest";
import { dietBoard, EMPTY_DIET_BOARD, type DietGuestSource } from "@/lib/diets/board";
import type { DietTag } from "@/lib/diets/rules";
import type { BoardRowDto, BrandingDto, PublishedSeatingDto, PublishedTableDto, SeatingSnapshot } from "@/types";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  boardEntries,
  boardLetter,
  boardPages,
  boardRowUnits,
  boardShowsRooms,
  fitFontPt,
  parsePrintOptions,
  placeCardLayout,
  placeCardSheets,
  placeCards,
  placeNameSizePt,
  printBrand,
  printFormat,
  printPaper,
  printQuery,
  STAFF_PAGE_UNITS,
  staffList,
  staffListPages,
  staffRowUnits,
  tableCardSheets,
  tableCards,
  tableNameSizePt,
} from "./index";

function table(name: string, room: string, seats: [number, string][], seatCount = 10): PublishedTableDto {
  return { name, room, shape: "round", seatCount, seats: seats.map(([seat, guest]) => ({ seat, name: guest })) };
}

function published(...tables: PublishedTableDto[]): PublishedSeatingDto {
  return { snapshotId: 7, publishedAt: "2026-11-10T18:00:00.000Z", tables };
}

const params = (query: string) => new URLSearchParams(query);

describe("print options", () => {
  it("reads every kind's defaults and valid values", () => {
    expect(parsePrintOptions("tablica", params(""))).toEqual({ kind: "tablica", format: "a4" });
    expect(parsePrintOptions("tablica", params("format=a3"))).toEqual({ kind: "tablica", format: "a3" });
    expect(parsePrintOptions("karty-stolow", params(""))).toEqual({
      kind: "karty-stolow",
      format: "tent",
      names: false,
    });
    expect(parsePrintOptions("karty-stolow", params("format=flat&names=1"))).toEqual({
      kind: "karty-stolow",
      format: "flat",
      names: true,
    });
    expect(parsePrintOptions("winietki", params(""))).toEqual({ kind: "winietki", format: "tent-90x45" });
    for (const format of ["tent-95x70", "flat-90x50"] as const) {
      expect(parsePrintOptions("winietki", params(`format=${format}`))).toEqual({ kind: "winietki", format });
    }
    expect(parsePrintOptions("lista-obslugi", params("format=a3"))).toEqual({ kind: "lista-obslugi" });
  });

  it("falls back to the default for unknown, empty and odd values", () => {
    expect(parsePrintOptions("tablica", params("format=A3"))).toEqual({ kind: "tablica", format: "a4" });
    expect(parsePrintOptions("tablica", params("format="))).toEqual({ kind: "tablica", format: "a4" });
    expect(parsePrintOptions("winietki", params("format=tent-90x45x"))).toEqual({
      kind: "winietki",
      format: "tent-90x45",
    });
    expect(parsePrintOptions("karty-stolow", params("format=round&names=yes"))).toEqual({
      kind: "karty-stolow",
      format: "tent",
      names: false,
    });
    // The first value of a repeated parameter decides.
    expect(parsePrintOptions("tablica", params("format=bogus&format=a3"))).toEqual({ kind: "tablica", format: "a4" });
  });

  it("writes the options back canonically (defaults left out) and names the paper", () => {
    expect(printQuery({ kind: "tablica", format: "a4" })).toBe("");
    expect(printQuery({ kind: "tablica", format: "a3" })).toBe("?format=a3");
    expect(printQuery({ kind: "karty-stolow", format: "flat", names: true })).toBe("?format=flat&names=1");
    expect(printQuery({ kind: "karty-stolow", format: "tent", names: false }, { lang: "en" })).toBe("?lang=en");
    expect(printQuery({ kind: "winietki", format: "flat-90x50" })).toBe("?format=flat-90x50");
    expect(printQuery({ kind: "lista-obslugi" })).toBe("");
    expect(printFormat({ kind: "lista-obslugi" })).toBeNull();
    expect(printFormat({ kind: "winietki", format: "tent-95x70" })).toBe("tent-95x70");
    expect(printPaper({ kind: "tablica", format: "a3" }).page).toBe("A3");
    expect(printPaper({ kind: "tablica", format: "a4" }).page).toBe("A4");
    expect(printPaper({ kind: "winietki", format: "tent-90x45" }).page).toBe("A4");
  });
});

describe("the „Znajdź swój stolik” board", () => {
  it("sorts every published seat in Polish order, then by table, and shows rooms only with more than one", () => {
    const one = published(
      table("Stół 10", "Sala", [
        [1, "Łucja"],
        [2, "Lena"],
      ]),
      table("Stół 2", "Sala", [
        [3, "Ania"],
        [1, "Ąda"],
        [2, "Émile"],
        [4, "Edek"],
        [5, "1. Gość"],
        [6, "Lena"],
      ]),
    );
    expect(boardShowsRooms(one)).toBe(false);
    const entries = boardEntries(one);
    expect(entries.map((entry) => `${entry.name}/${entry.table}`)).toEqual([
      "1. Gość/Stół 2",
      "Ania/Stół 2",
      "Ąda/Stół 2",
      "Edek/Stół 2",
      "Émile/Stół 2",
      "Lena/Stół 2",
      "Lena/Stół 10",
      "Łucja/Stół 10",
    ]);
    expect(entries.every((entry) => entry.room === null)).toBe(true);

    const two = published(table("A", "Ogród", [[1, "Ola"]]), table("B", "Sala", [[1, "Piotr"]]));
    expect(boardShowsRooms(two)).toBe(true);
    expect(boardEntries(two)).toEqual([
      { name: "Ola", table: "A", room: "Ogród" },
      { name: "Piotr", table: "B", room: "Sala" },
    ]);
    expect(boardEntries(null)).toEqual([]);
    expect(boardShowsRooms(null)).toBe(false);
  });

  it("gives Polish letters their own heading and folds other letters to their base", () => {
    expect(boardLetter("łucja")).toBe("Ł");
    expect(boardLetter("Ąda")).toBe("Ą");
    expect(boardLetter("Żaneta")).toBe("Ż");
    expect(boardLetter("Émile")).toBe("E");
    expect(boardLetter("Ünal")).toBe("U");
    expect(boardLetter("„Szef”")).toBe("#");
    expect(boardLetter("1. Gość")).toBe("#");
  });

  it("counts a long row as two", () => {
    expect(boardRowUnits({ name: "Ola", table: "Stół 1", room: null })).toBe(1);
    expect(boardRowUnits({ name: "Aleksandra Konstantynopolitańczykiewicz", table: "Stół 1", room: null })).toBe(2);
    expect(boardRowUnits({ name: "Ola Nowak", table: "Stół 1", room: "Sala kominkowa" })).toBe(2);
  });

  it("splits into columns and pages with headings that never end a column and repeat mid-letter", () => {
    const names = Array.from({ length: 120 }, (_, index) => `Kowalski ${String(index).padStart(3, "0")}`);
    const entries = names.map((name) => ({ name, table: "T1", room: null }));
    const pages = boardPages([{ name: "Adam", table: "T2", room: null }, ...entries]);
    // 1 heading + Adam, 1 heading + 120 Kowalskis = 123 rows; 34 per column → 4 columns (one repeated heading each).
    expect(pages).toHaveLength(2);
    expect(pages[0].columns).toHaveLength(BOARD_COLUMNS);
    const columns = pages.flatMap((page) => page.columns);
    for (const column of columns) {
      const used = column.reduce((sum, row) => sum + (row.kind === "guest" ? row.units : 1), 0);
      expect(used).toBeLessThanOrEqual(BOARD_ROWS);
      expect(column[column.length - 1].kind).toBe("guest");
      expect(column[0].kind).toBe("letter");
    }
    const headings = columns.flatMap((column) => column.filter((row) => row.kind === "letter"));
    expect(headings).toEqual([
      { kind: "letter", letter: "A", continued: false },
      { kind: "letter", letter: "K", continued: false },
      { kind: "letter", letter: "K", continued: true },
      { kind: "letter", letter: "K", continued: true },
      { kind: "letter", letter: "K", continued: true },
    ]);
    const guests = columns.flat().filter((row): row is Extract<BoardRowDto, { kind: "guest" }> => row.kind === "guest");
    expect(guests.map((row) => row.name)).toEqual(["Adam", ...names]);
    expect(boardPages([])).toEqual([]);
  });

  it("moves a new letter's heading to the next column with its first name", () => {
    const filler = Array.from({ length: BOARD_ROWS - 2 }, (_, index) => ({
      name: `Anna ${String(index).padStart(2, "0")}`,
      table: "T",
      room: null,
    }));
    // A heading + 32 Annas = 33 rows: the B heading would be row 34 with no room for Bartek.
    const pages = boardPages([...filler, { name: "Bartek", table: "T", room: null }]);
    expect(pages[0].columns).toHaveLength(2);
    expect(pages[0].columns[1]).toEqual([
      { kind: "letter", letter: "B", continued: false },
      { kind: "guest", units: 1, name: "Bartek", table: "T", room: null },
    ]);
  });
});

describe("table cards", () => {
  it("lists every published table (empty too) with the names in seat order", () => {
    const seating = published(
      table("Stół 1", "Sala", [
        [2, "Bartek"],
        [1, "Ania"],
      ]),
      table("Stół 2", "Sala", []),
    );
    expect(tableCards(seating)).toEqual([
      { name: "Stół 1", room: null, guests: ["Ania", "Bartek"] },
      { name: "Stół 2", room: null, guests: [] },
    ]);
    expect(tableCards(null)).toEqual([]);
    const cards = tableCards(published(table("A", "Ogród", []), table("B", "Sala", []), table("C", "Sala", [])));
    expect(cards.map((card) => card.room)).toEqual(["Ogród", "Sala", "Sala"]);
    expect(tableCardSheets(cards, "tent").map((sheet) => sheet.length)).toEqual([1, 1, 1]);
    expect(tableCardSheets(cards, "flat").map((sheet) => sheet.length)).toEqual([2, 1]);
  });

  it("sizes the table name down for long names and when the names share the face", () => {
    expect(tableNameSizePt("7", false)).toBe(110);
    expect(tableNameSizePt("Stół przy oknie numer 12", false)).toBeLessThan(110);
    expect(tableNameSizePt("Stół przy oknie numer 12", false)).toBeGreaterThanOrEqual(32);
    expect(tableNameSizePt("7", true)).toBe(72);
    expect(fitFontPt("abcdefghij", 20, 8, 5)).toBe(10);
    expect(fitFontPt("a".repeat(100), 20, 8, 5)).toBe(8);
  });
});

describe("place cards", () => {
  it("makes one card per published seat in the order of the tables and seats", () => {
    const seating = published(
      table("A", "Ogród", [
        [3, "Cezary"],
        [1, "Ania"],
      ]),
      table("B", "Sala", [[1, "Bartek"]]),
    );
    expect(placeCards(seating)).toEqual([
      { name: "Ania", table: "A", room: "Ogród" },
      { name: "Cezary", table: "A", room: "Ogród" },
      { name: "Bartek", table: "B", room: "Sala" },
    ]);
    expect(placeCards(null)).toEqual([]);
  });

  it("lays every format out on A4 within the margin, centred", () => {
    expect(placeCardLayout("tent-90x45")).toMatchObject({
      cardWidthMm: 90,
      cardHeightMm: 45,
      pieceHeightMm: 90,
      folded: true,
      columns: 2,
      rows: 3,
      perPage: 6,
      offsetXMm: 15,
      offsetYMm: 13.5,
    });
    expect(placeCardLayout("tent-95x70")).toMatchObject({
      pieceHeightMm: 140,
      columns: 2,
      rows: 2,
      perPage: 4,
      offsetXMm: 10,
      offsetYMm: 8.5,
    });
    expect(placeCardLayout("flat-90x50")).toMatchObject({
      pieceHeightMm: 50,
      folded: false,
      columns: 2,
      rows: 5,
      perPage: 10,
      offsetXMm: 15,
      offsetYMm: 23.5,
    });
    for (const format of ["tent-90x45", "tent-95x70", "flat-90x50"] as const) {
      const layout = placeCardLayout(format);
      expect(layout.offsetXMm).toBeGreaterThanOrEqual(8);
      expect(layout.offsetYMm).toBeGreaterThanOrEqual(8);
    }
  });

  it("puts the cards on sheets of the layout's size and shrinks long names", () => {
    const cards = Array.from({ length: 13 }, (_, index) => ({ name: `G${String(index)}`, table: "T", room: null }));
    expect(placeCardSheets(cards, placeCardLayout("tent-90x45")).map((sheet) => sheet.length)).toEqual([6, 6, 1]);
    expect(placeCardSheets(cards, placeCardLayout("flat-90x50")).map((sheet) => sheet.length)).toEqual([10, 3]);
    expect(placeCardSheets([], placeCardLayout("flat-90x50"))).toEqual([]);
    expect(placeNameSizePt("Ola", "tent-90x45")).toBe(22);
    expect(placeNameSizePt("Aleksandra Konstantynopolitańczykiewicz", "tent-90x45")).toBe(11);
  });
});

function guest(
  id: number,
  displayName: string,
  diets: DietTag[] = [],
  dietNote: string | null = null,
  isAbsent = false,
) {
  return { id, displayName, isAbsent, diets, dietNote } satisfies DietGuestSource;
}

function snapshot(tables: { id: number; name: string; room: string; seats: [number, number | null, string][] }[]) {
  return {
    id: 7,
    publishedAt: "2026-11-10T18:00:00.000Z",
    chairPitch: 0.035,
    rooms: [],
    tables: tables.map((t) => ({
      snapshotTableId: t.id,
      tableId: t.id,
      roomName: t.room,
      name: t.name,
      seatCount: 10,
      shape: "round" as const,
      x: 0.5,
      y: 0.5,
      rotation: 0,
    })),
    seats: tables.flatMap((t) =>
      t.seats.map(([seat, guestId, guestName]) => ({ snapshotTableId: t.id, seat, guestId, guestName })),
    ),
  } satisfies SeatingSnapshot;
}

describe("the staff list", () => {
  const snap = snapshot([
    {
      id: 1,
      name: "Stół 1",
      room: "Sala",
      seats: [
        [2, 2, "Bartek"],
        [1, 1, "Ania"],
        [3, 3, "Celina"],
      ],
    },
    { id: 2, name: "Stół 2", room: "Sala", seats: [[1, 4, "Darek"]] },
    { id: 3, name: "Stół 3", room: "Sala", seats: [] },
  ]);
  const guests = [
    guest(1, "Ania", ["vegan", "nut-allergy"], "bez orzeszków ziemnych"),
    guest(2, "Bartek"),
    // Marked absent after the publish: the name stays (as on the TV), the diet goes (the kitchen cooks for who is here).
    guest(3, "Celina", ["vegetarian"], null, true),
    guest(4, "Darek", ["vegetarian"]),
    guest(5, "Ewa", ["gluten-free"], "celiakia"),
  ];

  it("lists every occupied seat with the diet at that seat, the table's counts and the unplaced guests", () => {
    const seating = { snapshotId: 7, publishedAt: snap.publishedAt, tables: [] } as PublishedSeatingDto;
    const pub: PublishedSeatingDto = {
      ...seating,
      tables: [
        table("Stół 1", "Sala", [
          [2, "Bartek"],
          [1, "Ania"],
          [3, "Celina"],
        ]),
        table("Stół 2", "Sala", [[1, "Darek"]]),
        table("Stół 3", "Sala", []),
      ],
    };
    const list = staffList(pub, dietBoard(snap, guests));
    expect(list.tables.map((t) => t.name)).toEqual(["Stół 1", "Stół 2"]);
    expect(list.tables[0]).toMatchObject({ name: "Stół 1", room: null, people: 3 });
    expect(list.tables[0].seats).toEqual([
      { seat: 1, name: "Ania", diets: ["vegan", "nut-allergy"], note: "bez orzeszków ziemnych", units: 2 },
      { seat: 2, name: "Bartek", diets: [], note: null, units: 1 },
      { seat: 3, name: "Celina", diets: [], note: null, units: 1 },
    ]);
    expect(list.tables[0].counts).toEqual([
      { tag: "vegan", count: 1 },
      { tag: "nut-allergy", count: 1 },
    ]);
    expect(list.tables[1].counts).toEqual([{ tag: "vegetarian", count: 1 }]);
    expect(list.unplaced).toEqual([{ guestName: "Ewa", diets: ["gluten-free"], note: "celiakia" }]);
    expect(list.counts).toEqual([
      { tag: "vegetarian", count: 1 },
      { tag: "vegan", count: 1 },
      { tag: "gluten-free", count: 1 },
      { tag: "nut-allergy", count: 1 },
    ]);
    expect(list.withDiets).toBe(3);
    expect(JSON.stringify(list)).not.toMatch(/"id"|snapshotId|guestId/);
    expect(staffList(null, EMPTY_DIET_BOARD)).toEqual({ tables: [], unplaced: [], counts: [], withDiets: 0 });
  });

  it("estimates the rows a seat takes", () => {
    expect(staffRowUnits("Ola", [], null)).toBe(1);
    expect(staffRowUnits("Ola", ["vegan", "halal", "no-pork"], null)).toBe(1);
    expect(staffRowUnits("Ola", ["vegan", "halal", "no-pork", "nut-allergy"], null)).toBe(2);
    expect(staffRowUnits("Ola", [], "x".repeat(120))).toBe(3);
    expect(staffRowUnits("Aleksandra Konstantynopolitańczykiewicz", [], null)).toBe(2);
  });

  it("puts the summary first, keeps a table on one page when it fits and splits a longer one", () => {
    const seats = (count: number, units = 1) =>
      Array.from({ length: count }, (_, index) => ({
        seat: index + 1,
        name: `G${String(index + 1)}`,
        diets: [] as DietTag[],
        note: null,
        units,
      }));
    const list = {
      tables: [
        { name: "A", room: null, people: 20, counts: [], seats: seats(20) },
        // 2 + 20 = 22 rows: does not fit after A (2 + 22 + 22 > 36) → a new page.
        { name: "B", room: null, people: 20, counts: [], seats: seats(20) },
        // 2 + 30 × 2 = 62 rows: longer than a page → split and continued.
        { name: "C", room: null, people: 30, counts: [], seats: seats(30, 2) },
      ],
      unplaced: [{ guestName: "Ewa", diets: ["vegan" as DietTag], note: null }],
      counts: [],
      withDiets: 1,
    };
    const pages = staffListPages(list);
    const describe = pages.map((page) =>
      page.blocks.map((block) =>
        block.kind === "table"
          ? `${block.table.name}${block.continued ? "+" : ""}:${String(block.table.seats.length)}`
          : block.kind,
      ),
    );
    expect(describe).toEqual([["summary", "A:20"], ["B:20"], ["C:17"], ["C+:13", "unplaced"]]);
    for (const page of pages) {
      const used = page.blocks.reduce(
        (sum, block) =>
          sum +
          (block.kind === "summary"
            ? 2
            : 2 +
              (block.kind === "table"
                ? block.table.seats.reduce((s, seat) => s + seat.units, 0)
                : block.guests.length)),
        0,
      );
      expect(used).toBeLessThanOrEqual(STAFF_PAGE_UNITS);
    }
    const seated = pages.flatMap((page) =>
      page.blocks.flatMap((block) => (block.kind === "table" && block.table.name === "C" ? block.table.seats : [])),
    );
    expect(seated.map((seat) => seat.seat)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(staffListPages({ tables: [], unplaced: [], counts: [], withDiets: 0 })).toEqual([
      { blocks: [{ kind: "summary", counts: [], withDiets: 0 }] },
    ]);
  });
});

describe("the print brand", () => {
  const branding: BrandingDto = {
    restaurant: {
      name: "Pod Lipą",
      color: "#7c2d12",
      textColor: "#ffffff",
      logo: { mimeType: "image/png", byteSize: 10, version: 5 },
    },
    client: { name: "Acme", logo: { mimeType: "image/png", byteSize: 10, version: 9 } },
  };

  it("links the logos under the given base and none without one", () => {
    expect(printBrand(branding, ".")).toEqual({
      restaurantName: "Pod Lipą",
      clientName: "Acme",
      color: "#7c2d12",
      textColor: "#ffffff",
      restaurantLogo: "./logo?kind=restaurant&v=5",
      clientLogo: "./logo?kind=event&v=9",
    });
    expect(printBrand(branding, null)).toMatchObject({ restaurantLogo: null, clientLogo: null, clientName: "Acme" });
    expect(
      printBrand({ restaurant: { ...branding.restaurant, logo: null }, client: { name: null, logo: null } }, "/x"),
    ).toMatchObject({ restaurantLogo: null, clientLogo: null, clientName: null });
    expect(printBrand(null, ".")).toBeNull();
  });
});
