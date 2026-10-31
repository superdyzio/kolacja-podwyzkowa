import { describe, expect, it } from "vitest";
import type { GuessBoardDto, PublishedSeatingDto } from "@/types";
import {
  findGuestSeats,
  formatPublishedLabel,
  formatSavedAt,
  latestSavedAt,
  normalizeSearch,
  offlineRanking,
  seatingByRoom,
} from "./readout";

// What the offline readout shows (S-09): seats by room and table, the name search, the local ranking and the labels.

const seating: PublishedSeatingDto = {
  snapshotId: 2,
  publishedAt: "2026-11-08T20:05:00.000Z",
  tables: [
    {
      name: "Okno",
      room: "Sala duża",
      shape: "rectangular",
      seatCount: 4,
      seats: [
        { seat: 1, name: "Łukasz" },
        { seat: 3, name: "Ania K." },
      ],
    },
    { name: "Stolik 2", room: "Sala duża", shape: "round", seatCount: 3, seats: [{ seat: 2, name: "Żółć" }] },
    { name: "Kominek", room: "Salonik", shape: "round", seatCount: 2, seats: [{ seat: 1, name: "Ania B." }] },
  ],
};

describe("seatingByRoom", () => {
  it("groups tables by room and lists every seat, empty ones as null", () => {
    expect(seatingByRoom(seating)).toEqual([
      {
        room: "Sala duża",
        tables: [
          {
            name: "Okno",
            shape: "rectangular",
            seatCount: 4,
            seats: [
              { seat: 1, name: "Łukasz" },
              { seat: 2, name: null },
              { seat: 3, name: "Ania K." },
              { seat: 4, name: null },
            ],
          },
          {
            name: "Stolik 2",
            shape: "round",
            seatCount: 3,
            seats: [
              { seat: 1, name: null },
              { seat: 2, name: "Żółć" },
              { seat: 3, name: null },
            ],
          },
        ],
      },
      {
        room: "Salonik",
        tables: [
          {
            name: "Kominek",
            shape: "round",
            seatCount: 2,
            seats: [
              { seat: 1, name: "Ania B." },
              { seat: 2, name: null },
            ],
          },
        ],
      },
    ]);
  });

  it("is empty for an arrangement without tables", () => {
    expect(seatingByRoom({ ...seating, tables: [] })).toEqual([]);
  });
});

describe("normalizeSearch and findGuestSeats", () => {
  it("ignores case, Polish marks and extra spaces", () => {
    expect(normalizeSearch("  ŻÓŁĆ  gęślą ")).toBe("zolc gesla");
    expect(normalizeSearch("Łukasz")).toBe("lukasz");
  });

  it("finds a guest without Polish letters typed", () => {
    expect(findGuestSeats(seating, "zolc")).toEqual([{ name: "Żółć", table: "Stolik 2", room: "Sala duża", seat: 2 }]);
    expect(findGuestSeats(seating, "LUKASZ")).toEqual([{ name: "Łukasz", table: "Okno", room: "Sala duża", seat: 1 }]);
  });

  it("lists every match in Polish name order", () => {
    expect(findGuestSeats(seating, "ania").map((match) => match.name)).toEqual(["Ania B.", "Ania K."]);
  });

  it("finds nobody for an empty query or no match", () => {
    expect(findGuestSeats(seating, "   ")).toEqual([]);
    expect(findGuestSeats(seating, "zenek")).toEqual([]);
  });
});

describe("offlineRanking", () => {
  const board: GuessBoardDto = {
    intakeOpen: false,
    correctAmountGrosze: null,
    guests: [
      { id: 1, displayName: "Ania", isAbsent: false, amountGrosze: 100000, enteredBy: "guest" },
      { id: 2, displayName: "Bartek", isAbsent: false, amountGrosze: 90000, enteredBy: "guest" },
      { id: 3, displayName: "Celina", isAbsent: true, amountGrosze: 110000, enteredBy: "organizer" },
      { id: 4, displayName: "Darek", isAbsent: false, amountGrosze: 50000, enteredBy: "guest" },
      { id: 5, displayName: "Ela", isAbsent: false, amountGrosze: null, enteredBy: null },
    ],
    missing: [{ id: 5, displayName: "Ela", isAbsent: false }],
    ranking: null,
  };

  it("is what was saved when no amount is typed on this device", () => {
    expect(offlineRanking(board, null)).toBeNull();
    const ranking = { correctAmountGrosze: 1, entries: [] };
    expect(offlineRanking({ ...board, ranking }, null)).toBe(ranking);
  });

  it("ranks the saved guesses against a locally typed amount, ties sharing a place (1, 2, 2, 4)", () => {
    const ranking = offlineRanking(board, 100000);
    expect(ranking?.correctAmountGrosze).toBe(100000);
    expect(ranking?.entries.map((entry) => [entry.displayName, entry.place, entry.tied])).toEqual([
      ["Ania", 1, false],
      ["Bartek", 2, true],
      ["Celina", 2, true],
      ["Darek", 4, false],
    ]);
    expect(ranking?.entries.find((entry) => entry.displayName === "Celina")?.isAbsent).toBe(true);
  });

  it("leaves guests without a guess out", () => {
    expect(offlineRanking(board, 0)?.entries.map((entry) => entry.guestId)).not.toContain(5);
  });
});

describe("labels", () => {
  const now = new Date(2026, 10, 8, 22, 15);

  it("shows only the time for today, with zero-padded minutes", () => {
    expect(formatSavedAt(new Date(2026, 10, 8, 21, 34).toISOString(), now)).toBe("Stan z 21:34");
    expect(formatSavedAt(new Date(2026, 10, 8, 0, 5).toISOString(), now)).toBe("Stan z 0:05");
    expect(formatPublishedLabel(new Date(2026, 10, 8, 21, 5).toISOString(), now)).toBe("Opublikowano o 21:05");
  });

  it("adds the date when it was not today", () => {
    expect(formatSavedAt(new Date(2026, 10, 6, 21, 34).toISOString(), now)).toBe("Stan z 6 listopada, 21:34");
    expect(formatSavedAt(new Date(2025, 10, 8, 21, 34).toISOString(), now)).toBe("Stan z 8 listopada, 21:34");
    expect(formatPublishedLabel(new Date(2026, 8, 30, 9, 0).toISOString(), now)).toBe(
      "Opublikowano 30 września o 9:00",
    );
  });

  it("picks the later of two save times", () => {
    const early = "2026-11-08T20:00:00.000Z";
    const late = "2026-11-08T21:00:00.000Z";
    expect(latestSavedAt(early, late)).toBe(late);
    expect(latestSavedAt(late, early)).toBe(late);
    expect(latestSavedAt(null, early)).toBe(early);
    expect(latestSavedAt(early, null)).toBe(early);
    expect(latestSavedAt(null, null)).toBeNull();
  });
});
