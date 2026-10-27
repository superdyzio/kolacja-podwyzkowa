import { describe, expect, it } from "vitest";
import type { GuessBoardDto, PublishedSeatingDto } from "@/types";
import {
  OFFLINE_CACHE_VERSION,
  isGuessBoardData,
  isPublishedSeating,
  offlineEntry,
  offlineOwner,
  ownEntry,
  parseOfflineGuesses,
  parseOfflineSeating,
  serializeOfflineEntry,
} from "./cache";

// The offline memory envelope (S-09): owner tag, round trips and every way stored text can be wrong.

const API = "/api/o/AAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_API = "/api/o/BBBBBBBBBBBBBBBBBBBBBBBB";
const SAVED_AT = "2026-11-08T20:34:00.000Z";

const seating: PublishedSeatingDto = {
  snapshotId: 3,
  publishedAt: "2026-11-08T20:05:00.000Z",
  tables: [
    {
      name: "Okno",
      room: "Sala duża",
      shape: "rectangular",
      seatCount: 6,
      seats: [
        { seat: 1, name: "Ania" },
        { seat: 4, name: "Kuba" },
      ],
    },
  ],
};

const board: GuessBoardDto = {
  intakeOpen: false,
  correctAmountGrosze: 500000,
  guests: [
    { id: 1, displayName: "Ania", isAbsent: false, amountGrosze: 450000, enteredBy: "guest" },
    { id: 2, displayName: "Kuba", isAbsent: true, amountGrosze: null, enteredBy: null },
  ],
  missing: [{ id: 2, displayName: "Kuba", isAbsent: true }],
  ranking: {
    correctAmountGrosze: 500000,
    entries: [
      {
        place: 1,
        tied: false,
        guestId: 1,
        displayName: "Ania",
        isAbsent: false,
        amountGrosze: 450000,
        differenceGrosze: -50000,
        distanceGrosze: 50000,
      },
    ],
  },
};

function stored(value: unknown): string {
  return JSON.stringify(value);
}

describe("offlineOwner", () => {
  it("is 8 hex chars, stable, and tells organizer links apart", () => {
    expect(offlineOwner(API)).toMatch(/^[0-9a-f]{8}$/);
    expect(offlineOwner(API)).toBe(offlineOwner(API));
    expect(offlineOwner(API)).not.toBe(offlineOwner(OTHER_API));
    expect(offlineOwner("")).toBe("811c9dc5");
  });

  it("never contains the key", () => {
    expect(API).not.toContain(offlineOwner(API));
  });
});

describe("round trips", () => {
  it("keeps the published seating, also 'nothing published yet'", () => {
    const entry = offlineEntry(API, seating, SAVED_AT);
    expect(entry).toEqual({ v: OFFLINE_CACHE_VERSION, owner: offlineOwner(API), savedAt: SAVED_AT, data: seating });
    expect(parseOfflineSeating(serializeOfflineEntry(entry))).toEqual(entry);
    const empty = offlineEntry(API, null, SAVED_AT);
    expect(parseOfflineSeating(serializeOfflineEntry(empty))).toEqual(empty);
  });

  it("keeps the whole guess board, also without a ranking", () => {
    const entry = offlineEntry(API, board, SAVED_AT);
    expect(parseOfflineGuesses(serializeOfflineEntry(entry))).toEqual(entry);
    const noRanking = offlineEntry(API, { ...board, correctAmountGrosze: null, ranking: null }, SAVED_AT);
    expect(parseOfflineGuesses(serializeOfflineEntry(noRanking))).toEqual(noRanking);
  });

  it("drops unknown extra fields of the envelope", () => {
    const raw = stored({ ...offlineEntry(API, seating, SAVED_AT), extra: "x" });
    expect(parseOfflineSeating(raw)).not.toHaveProperty("extra");
  });

  it("reads a cleared value (null) as nothing saved", () => {
    expect(parseOfflineSeating(serializeOfflineEntry(null))).toBeNull();
    expect(parseOfflineGuesses(null)).toBeNull();
  });
});

describe("rejections", () => {
  const good = offlineEntry(API, board, SAVED_AT);

  it.each([
    ["not JSON", "{oops"],
    ["a number", "42"],
    ["an array", "[]"],
    ["another version", stored({ ...good, v: 2 })],
    ["no owner", stored({ ...good, owner: undefined })],
    ["an empty owner", stored({ ...good, owner: "" })],
    ["no savedAt", stored({ ...good, savedAt: undefined })],
    ["a savedAt that is not a date", stored({ ...good, savedAt: "wczoraj" })],
    ["no data", stored({ v: 1, owner: "abc", savedAt: SAVED_AT })],
  ])("refuses %s", (_label, raw) => {
    expect(parseOfflineGuesses(raw)).toBeNull();
  });

  it("refuses a guess board with a wrongly typed field anywhere", () => {
    const entry = (data: unknown) => stored({ ...good, data });
    const [first] = board.ranking?.entries ?? [];
    expect(parseOfflineGuesses(entry({ ...board, intakeOpen: "tak" }))).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, correctAmountGrosze: 12.5 }))).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, guests: [{ ...board.guests[0], amountGrosze: 1.5 }] }))).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, guests: [{ ...board.guests[0], enteredBy: "ktoś" }] }))).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, missing: [{ id: "2", displayName: "Kuba", isAbsent: true }] }))).toBe(
      null,
    );
    expect(
      parseOfflineGuesses(
        entry({ ...board, ranking: { correctAmountGrosze: 1, entries: [{ ...first, place: "1" }] } }),
      ),
    ).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, ranking: { entries: [] } }))).toBeNull();
    expect(parseOfflineGuesses(entry({ ...board, guests: null }))).toBeNull();
  });

  it("refuses a published seating with a wrongly typed field anywhere", () => {
    const entry = (data: unknown) => stored({ ...offlineEntry(API, seating, SAVED_AT), data });
    const [table] = seating.tables;
    expect(parseOfflineSeating(entry({ ...seating, snapshotId: 0 }))).toBeNull();
    expect(parseOfflineSeating(entry({ ...seating, publishedAt: "nigdy" }))).toBeNull();
    expect(parseOfflineSeating(entry({ ...seating, tables: [{ ...table, shape: "square" }] }))).toBeNull();
    expect(parseOfflineSeating(entry({ ...seating, tables: [{ ...table, seatCount: 0 }] }))).toBeNull();
    expect(parseOfflineSeating(entry({ ...seating, tables: [{ ...table, seats: [{ seat: 1 }] }] }))).toBeNull();
    expect(parseOfflineSeating(entry({ ...seating, tables: [{ ...table, room: 5 }] }))).toBeNull();
    expect(parseOfflineSeating(entry([]))).toBeNull();
  });

  it("does not take one kind for the other", () => {
    expect(parseOfflineSeating(serializeOfflineEntry(offlineEntry(API, board, SAVED_AT)))).toBeNull();
    expect(parseOfflineGuesses(serializeOfflineEntry(offlineEntry(API, seating, SAVED_AT)))).toBeNull();
  });
});

describe("validators of API answers", () => {
  it("accept the documented shapes and refuse others", () => {
    expect(isPublishedSeating(seating)).toBe(true);
    expect(isPublishedSeating(null)).toBe(false);
    expect(isGuessBoardData(board)).toBe(true);
    expect(isGuessBoardData({ error: "Brak dostępu" })).toBe(false);
  });
});

describe("ownEntry", () => {
  it("returns the same object for its owner and nothing for another link", () => {
    const entry = offlineEntry(API, seating, SAVED_AT);
    expect(ownEntry(entry, offlineOwner(API))).toBe(entry);
    expect(ownEntry(entry, offlineOwner(OTHER_API))).toBeNull();
    expect(ownEntry(null, offlineOwner(API))).toBeNull();
  });
});
