import { describe, expect, it } from "vitest";
import type { DietBoardDto, GuestListDto } from "@/types";
import { EMPTY_DIET_BOARD } from "./board";
import { withoutDiets, withoutDietsInResponse } from "./support";

// Support mode never sees diets (the PR #4 review's decision 2): every shape keeps its keys, the diets go.

const BOARD: DietBoardDto = {
  tables: [
    {
      name: "Okno",
      room: "Sala",
      seats: [{ seat: 1, guestName: "Ania", diets: ["nut-allergy"], note: "bez orzechów" }],
    },
  ],
  unplaced: [{ guestName: "Bartek", diets: ["vegan"], note: "bez miodu" }],
  counts: [
    { tag: "nut-allergy", count: 1 },
    { tag: "vegan", count: 1 },
  ],
  guests: 2,
};

const LIST: GuestListDto = {
  guests: [
    { id: 1, displayName: "Ania", isAbsent: false, groupId: null, diets: ["nut-allergy"], dietNote: "bez orzechów" },
    { id: 2, displayName: "Bartek", isAbsent: true, groupId: 7, diets: [], dietNote: null },
  ],
  groups: [{ id: 7, memberIds: [2, 3] }],
};

describe("withoutDiets", () => {
  it("empties a guest's tags and note and keeps everything else of the list", () => {
    expect(withoutDiets(LIST)).toEqual({
      guests: [
        { id: 1, displayName: "Ania", isAbsent: false, groupId: null, diets: [], dietNote: null },
        { id: 2, displayName: "Bartek", isAbsent: true, groupId: 7, diets: [], dietNote: null },
      ],
      groups: [{ id: 7, memberIds: [2, 3] }],
    });
    // The input is untouched.
    expect(LIST.guests[0]?.diets).toEqual(["nut-allergy"]);
  });

  it("replaces a diet board with the empty one, deep inside an answer too", () => {
    const answer = {
      board: { items: [{ id: 5, name: "Zupa", note: "na środek stołu" }], diets: BOARD },
      seating: { guestList: LIST },
    };
    const stripped = withoutDiets(answer);
    expect(stripped.board.diets).toEqual(EMPTY_DIET_BOARD);
    // An order line's note is not a diet: it stays.
    expect(stripped.board.items).toEqual([{ id: 5, name: "Zupa", note: "na środek stołu" }]);
    expect(stripped.seating.guestList.guests.map((guest) => guest.dietNote)).toEqual([null, null]);
    const json = JSON.stringify(stripped);
    for (const leak of ["nut-allergy", "vegan", "bez orzechów", "bez miodu"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("drops the note of any row that carries diets (a staff list seat, an import row)", () => {
    expect(withoutDiets({ seat: 2, name: "Ania", diets: ["halal"], note: "bez wieprzowiny", units: 1 })).toEqual({
      seat: 2,
      name: "Ania",
      diets: [],
      note: null,
      units: 1,
    });
    expect(withoutDiets({ diets: null })).toEqual({ diets: null });
  });

  it("passes scalars, nulls and arrays through", () => {
    expect(withoutDiets(null)).toBeNull();
    expect(withoutDiets("diets")).toBe("diets");
    expect(withoutDiets([1, { dietNote: "x" }])).toEqual([1, { dietNote: null }]);
  });
});

describe("withoutDietsInResponse", () => {
  it("rewrites a JSON answer with its status and headers", async () => {
    const response = Response.json({ guests: LIST.guests }, { status: 201, headers: { "x-test": "1" } });
    const stripped = await withoutDietsInResponse(response);
    expect(stripped.status).toBe(201);
    expect(stripped.headers.get("x-test")).toBe("1");
    expect(stripped.headers.get("content-type")).toContain("application/json");
    const body = (await stripped.json()) as GuestListDto;
    expect(body.guests.map((guest) => guest.diets)).toEqual([[], []]);
  });

  it("leaves anything else (an image) untouched", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    expect(await withoutDietsInResponse(response)).toBe(response);
  });
});
