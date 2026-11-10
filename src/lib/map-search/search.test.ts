import { describe, expect, it } from "vitest";
import { mapSearchMessages } from "./messages";
import {
  MAP_SEARCH_LIMIT,
  hitTables,
  normalizeSearch,
  searchMarks,
  searchSeats,
  seatHitKey,
  type SearchableTable,
} from "./search";

const tables: SearchableTable[] = [
  {
    name: "Stolik 10",
    room: "Sala duża",
    seats: [
      { seat: 1, name: "Joanna Nowak" },
      { seat: 2, name: "Anna Kowalska" },
    ],
  },
  {
    name: "Stolik 2",
    room: "Sala duża",
    seats: [
      { seat: 3, name: "Żółć Gęślą" },
      { seat: 1, name: "Łukasz Wójcik" },
      { seat: 2, name: "Anna-Maria Zając" },
    ],
  },
  { name: "Okno", room: "Taras", seats: [{ seat: 4, name: "Ania B." }] },
  { name: "Pusty", room: "Taras", seats: [] },
];

describe("normalizeSearch", () => {
  it("ignores case, Polish marks (ł too) and extra spaces", () => {
    expect(normalizeSearch("  ŻÓŁĆ  gęślą ")).toBe("zolc gesla");
    expect(normalizeSearch("Łukasz")).toBe("lukasz");
    expect(normalizeSearch("Søren Strauß")).toBe("soren strauss");
    expect(normalizeSearch("\t\n")).toBe("");
  });
});

describe("searchSeats", () => {
  it("finds a guest typed without Polish letters, in any case", () => {
    expect(searchSeats(tables, "LUKASZ")).toEqual([
      { name: "Łukasz Wójcik", table: "Stolik 2", room: "Sala duża", seat: 1 },
    ]);
    expect(searchSeats(tables, "zolc").map((hit) => hit.name)).toEqual(["Żółć Gęślą"]);
    expect(searchSeats(tables, "wójc").map((hit) => hit.name)).toEqual(["Łukasz Wójcik"]);
  });

  it("takes the query's words in any order", () => {
    expect(searchSeats(tables, "kow an").map((hit) => hit.name)).toEqual(["Anna Kowalska"]);
    expect(searchSeats(tables, "an kow").map((hit) => hit.name)).toEqual(["Anna Kowalska"]);
    expect(searchSeats(tables, "anna nowak zajac")).toEqual([]);
  });

  it("lists several hits: names whose words start with the query first, then the rest, each in Polish order", () => {
    expect(searchSeats(tables, "an").map((hit) => hit.name)).toEqual([
      "Ania B.",
      "Anna Kowalska",
      "Anna-Maria Zając",
      "Joanna Nowak",
    ]);
    // A word after a hyphen starts a word too.
    expect(searchSeats(tables, "maria").map((hit) => hit.name)).toEqual(["Anna-Maria Zając"]);
  });

  it("orders equal names by table (natural order) and seat", () => {
    const twins: SearchableTable[] = [
      { name: "Stolik 10", room: "A", seats: [{ seat: 1, name: "Ola" }] },
      {
        name: "Stolik 2",
        room: "A",
        seats: [
          { seat: 5, name: "Ola" },
          { seat: 2, name: "Ola" },
        ],
      },
    ];
    expect(searchSeats(twins, "ola").map((hit) => `${hit.table}/${String(hit.seat)}`)).toEqual([
      "Stolik 2/2",
      "Stolik 2/5",
      "Stolik 10/1",
    ]);
  });

  it("finds nobody for a blank query, no match or no tables", () => {
    expect(searchSeats(tables, "")).toEqual([]);
    expect(searchSeats(tables, "   ")).toEqual([]);
    expect(searchSeats(tables, "zenek")).toEqual([]);
    expect(searchSeats([], "anna")).toEqual([]);
  });
});

describe("hits as marks", () => {
  const hits = searchSeats(tables, "an");

  it("keys a hit by its table and seat", () => {
    expect(seatHitKey(hits[0])).toBe("Okno\u00004");
    expect(new Set(hits.map(seatHitKey)).size).toBe(hits.length);
  });

  it("gives one violet seat mark per hit and the tables they sit at", () => {
    expect(searchMarks(hits.slice(0, 1))).toEqual([
      { table: "Okno", seat: 4, label: null, done: false, tone: "search" },
    ]);
    expect([...hitTables(hits)].sort()).toEqual(["Okno", "Stolik 10", "Stolik 2"]);
  });

  it("lists a handful at once", () => {
    expect(MAP_SEARCH_LIMIT).toBeGreaterThanOrEqual(5);
  });
});

describe("mapSearchMessages", () => {
  it("counts people in Polish and English", () => {
    expect(mapSearchMessages("pl").found(1)).toContain("1 osobę");
    expect(mapSearchMessages("pl").found(3)).toContain("3 osoby");
    expect(mapSearchMessages("pl").found(5)).toContain("5 osób");
    expect(mapSearchMessages("en").found(1)).toContain("1 person");
    expect(mapSearchMessages("en").found(2)).toContain("2 people");
    expect(mapSearchMessages("pl").more(1)).toContain("jeszcze jedna osoba");
    expect(mapSearchMessages("pl").more(12)).toContain("jeszcze 12 osób");
  });
});
