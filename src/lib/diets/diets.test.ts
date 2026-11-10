import { describe, expect, it } from "vitest";
import { guest } from "@/lib/seating/fixtures.test-helpers";
import type { SeatingSnapshot } from "@/types";
import { dietBoard, dietSeatLookup, EMPTY_DIET_BOARD } from "./board";
import { dietMessages } from "./messages";
import {
  DIET_TAGS,
  foldDietWord,
  hasDiet,
  isAllergyTag,
  isDietTag,
  matchDietWord,
  MAX_DIET_NOTE_LENGTH,
  normalizeDiets,
  parseDietCell,
  parseDietNote,
} from "./rules";

describe("diet tags", () => {
  it("knows exactly the eight tags of the DB CHECK", () => {
    expect(DIET_TAGS).toEqual([
      "vegetarian",
      "vegan",
      "gluten-free",
      "lactose-free",
      "nut-allergy",
      "seafood-allergy",
      "halal",
      "no-pork",
    ]);
    expect(isDietTag("vegan")).toBe(true);
    expect(isDietTag("keto")).toBe(false);
    expect(isDietTag(3)).toBe(false);
    expect(isAllergyTag("nut-allergy")).toBe(true);
    expect(isAllergyTag("vegan")).toBe(false);
  });

  it("normalizes to known tags, once each, in display order", () => {
    expect(normalizeDiets(["no-pork", "vegan", "keto", "vegan", "gluten-free"])).toEqual([
      "vegan",
      "gluten-free",
      "no-pork",
    ]);
  });

  it("has a label for every tag in both languages", () => {
    for (const tag of DIET_TAGS) {
      expect(dietMessages("pl").labels[tag]).not.toBe("");
      expect(dietMessages("en").labels[tag]).not.toBe("");
    }
  });
});

describe("parseDietNote", () => {
  it("normalizes, treats empty as none and refuses more than the limit", () => {
    expect(parseDietNote(undefined)).toEqual({ ok: true, note: null });
    expect(parseDietNote("   ")).toEqual({ ok: true, note: null });
    expect(parseDietNote("  alergia   na seler ")).toEqual({ ok: true, note: "alergia na seler" });
    expect(parseDietNote("x".repeat(MAX_DIET_NOTE_LENGTH))).toEqual({ ok: true, note: "x".repeat(120) });
    expect(parseDietNote("x".repeat(MAX_DIET_NOTE_LENGTH + 1))).toEqual({ ok: false, problem: "too-long" });
  });

  it("tells whether a guest has anything for the kitchen", () => {
    expect(hasDiet({ diets: [], dietNote: null })).toBe(false);
    expect(hasDiet({ diets: ["vegan"], dietNote: null })).toBe(true);
    expect(hasDiet({ diets: [], dietNote: "bez cebuli" })).toBe(true);
  });
});

describe("matchDietWord", () => {
  it("folds case, diacritics and punctuation", () => {
    expect(foldDietWord("  Bezglutenowa. ")).toBe("bezglutenowa");
    expect(foldDietWord("Bez orzechów")).toBe("bez orzechow");
    expect(foldDietWord("WEGAŃSKA")).toBe("weganska");
  });

  it.each([
    ["wegetariańska", "vegetarian"],
    ["Wege", "vegetarian"],
    ["vegetarian", "vegetarian"],
    ["dieta wegańska", "vegan"],
    ["Vegan", "vegan"],
    ["bez glutenu", "gluten-free"],
    ["Celiakia", "gluten-free"],
    ["gluten-free", "gluten-free"],
    ["GF", "gluten-free"],
    ["nietolerancja laktozy", "lactose-free"],
    ["lactose free", "lactose-free"],
    ["alergia na orzechy", "nut-allergy"],
    ["orzeszki ziemne", "nut-allergy"],
    ["nut allergy", "nut-allergy"],
    ["owoce morza", "seafood-allergy"],
    ["fish allergy", "seafood-allergy"],
    ["alergia na ryby i owoce morza", "seafood-allergy"],
    ["Halal", "halal"],
    ["bez wieprzowiny", "no-pork"],
    ["no pork", "no-pork"],
  ])("„%s” → %s", (word, tag) => {
    expect(matchDietWord(word)).toBe(tag);
  });

  it("reads „no diet” words as none and unknown words as null", () => {
    for (const word of ["", "-", "brak", "Nie", "none", "n/a", "standardowa"]) {
      expect(matchDietWord(word)).toBe("none");
    }
    expect(matchDietWord("keto")).toBeNull();
    expect(matchDietWord("bez jajek")).toBeNull();
  });
});

describe("parseDietCell", () => {
  it("splits on separators and the words „i” / „and”", () => {
    expect(parseDietCell("wegetariańska, bez glutenu")).toEqual({ tags: ["vegetarian", "gluten-free"], unknown: [] });
    expect(parseDietCell("bez glutenu i laktozy")).toEqual({ tags: ["gluten-free", "lactose-free"], unknown: [] });
    expect(parseDietCell("vegan / nuts")).toEqual({ tags: ["vegan", "nut-allergy"], unknown: [] });
    expect(parseDietCell("alergia na orzechy i ryby")).toEqual({
      tags: ["nut-allergy", "seafood-allergy"],
      unknown: [],
    });
    expect(parseDietCell("Vegan and gluten free")).toEqual({ tags: ["vegan", "gluten-free"], unknown: [] });
  });

  it("keeps a phrase that is itself a label whole", () => {
    expect(parseDietCell("alergia na ryby i owoce morza")).toEqual({ tags: ["seafood-allergy"], unknown: [] });
  });

  it("names the words it does not know, as typed", () => {
    expect(parseDietCell("wege; keto; bez jajek")).toEqual({ tags: ["vegetarian"], unknown: ["keto", "bez jajek"] });
  });

  it("reads empty and „brak” as no diet", () => {
    expect(parseDietCell("")).toEqual({ tags: [], unknown: [] });
    expect(parseDietCell("brak")).toEqual({ tags: [], unknown: [] });
    expect(parseDietCell("-")).toEqual({ tags: [], unknown: [] });
  });
});

function snapshot(): SeatingSnapshot {
  return {
    id: 7,
    publishedAt: "2026-11-10T18:00:00Z",
    chairPitch: 0.035,
    rooms: [],
    tables: [
      {
        snapshotTableId: 1,
        tableId: 10,
        roomName: "Sala B",
        name: "Stół 2",
        seatCount: 6,
        shape: "round",
        x: 0.2,
        y: 0.2,
        rotation: 0,
      },
      {
        snapshotTableId: 2,
        tableId: 11,
        roomName: "Sala A",
        name: "Stół 10",
        seatCount: 6,
        shape: "round",
        x: 0.5,
        y: 0.5,
        rotation: 0,
      },
      {
        snapshotTableId: 3,
        tableId: 12,
        roomName: "Sala A",
        name: "Stół 9",
        seatCount: 6,
        shape: "round",
        x: 0.7,
        y: 0.7,
        rotation: 0,
      },
    ],
    seats: [
      { snapshotTableId: 1, seat: 4, guestId: 1, guestName: "Ania" },
      { snapshotTableId: 1, seat: 2, guestId: 2, guestName: "Kuba (publ.)" },
      { snapshotTableId: 2, seat: 1, guestId: 3, guestName: "Ola" },
      { snapshotTableId: 3, seat: 5, guestId: 4, guestName: "Ewa" },
      { snapshotTableId: 3, seat: 6, guestId: null, guestName: "Usunięty" },
      { snapshotTableId: 3, seat: 1, guestId: 5, guestName: "Bez diety" },
    ],
  };
}

describe("dietBoard", () => {
  const guests = [
    guest(1, "Ania", { diets: ["vegan", "nut-allergy"] }),
    guest(2, "Kuba", { dietNote: "bez cebuli" }),
    guest(3, "Ola", { diets: ["vegan"], isAbsent: true }),
    guest(4, "Ewa", { diets: ["gluten-free"] }),
    guest(5, "Bez diety"),
    guest(6, "Zosia", { diets: ["vegan"] }),
    guest(7, "Adam", { diets: ["halal"], dietNote: "bez alkoholu" }),
  ];

  it("lists present guests with a diet at their published seats, tables by room then name, seats in order", () => {
    const board = dietBoard(snapshot(), guests);
    expect(board.tables).toEqual([
      { name: "Stół 9", room: "Sala A", seats: [{ seat: 5, guestName: "Ewa", diets: ["gluten-free"], note: null }] },
      {
        name: "Stół 2",
        room: "Sala B",
        seats: [
          { seat: 2, guestName: "Kuba (publ.)", diets: [], note: "bez cebuli" },
          { seat: 4, guestName: "Ania", diets: ["vegan", "nut-allergy"], note: null },
        ],
      },
    ]);
  });

  it("puts present guests without a published seat under unplaced (live names, Polish order)", () => {
    expect(dietBoard(snapshot(), guests).unplaced).toEqual([
      { guestName: "Adam", diets: ["halal"], note: "bez alkoholu" },
      { guestName: "Zosia", diets: ["vegan"], note: null },
    ]);
  });

  it("counts present guests per tag in tag order, without zeros (absent Ola is not counted)", () => {
    const board = dietBoard(snapshot(), guests);
    expect(board.counts).toEqual([
      { tag: "vegan", count: 2 },
      { tag: "gluten-free", count: 1 },
      { tag: "nut-allergy", count: 1 },
      { tag: "halal", count: 1 },
    ]);
    expect(board.guests).toBe(5);
  });

  it("works before the first publish (everyone unplaced) and with nobody on a diet", () => {
    const board = dietBoard(null, guests);
    expect(board.tables).toEqual([]);
    expect(board.unplaced.map((entry) => entry.guestName)).toEqual(["Adam", "Ania", "Ewa", "Kuba", "Zosia"]);
    expect(dietBoard(snapshot(), [guest(1, "Ania")])).toEqual(EMPTY_DIET_BOARD);
  });

  it("finds the diet of a published seat", () => {
    const lookup = dietSeatLookup(dietBoard(snapshot(), guests));
    expect(lookup("Stół 2", 4)?.diets).toEqual(["vegan", "nut-allergy"]);
    expect(lookup("Stół 2", 3)).toBeUndefined();
    expect(lookup("Stół 9", 1)).toBeUndefined();
  });
});
