import { describe, expect, it } from "vitest";
import type { GuestGuessDto, GuestSeatDto } from "@/types";
import {
  GUEST_UNPUBLISHED_MESSAGE,
  GUEST_UNSEATED_MESSAGE,
  describeGuestSeat,
  guestStateVersion,
  toGuestState,
  toTablemates,
} from "./state";

const SEAT: GuestSeatDto = {
  table: "Okno",
  room: "Sala A",
  seat: 3,
  shape: "round",
  seatCount: 8,
  x: 0.25,
  y: 0.5,
  tablemates: [{ seat: 4, name: "Ola", relation: "side" }],
};
const OPEN: GuestGuessDto = { intakeOpen: true, amountGrosze: null };

describe("toTablemates", () => {
  const rows = (...seats: number[]) => seats.map((seat) => ({ seat, name: `Gość ${String(seat)}` }));

  it("marks the side neighbours of a round table, with wrap-around, in seat order", () => {
    expect(toTablemates({ shape: "round", seatCount: 8 }, 1, rows(5, 2, 8, 4))).toEqual([
      { seat: 2, name: "Gość 2", relation: "side" },
      { seat: 4, name: "Gość 4", relation: null },
      { seat: 5, name: "Gość 5", relation: null },
      { seat: 8, name: "Gość 8", relation: "side" },
    ]);
  });

  it("marks side neighbours on the same side and the opposite seat of a rectangular table", () => {
    // 6 seats: side A = 1..3, side B = 4..6; seat 2 sits next to 1 and 3, opposite 5.
    expect(toTablemates({ shape: "rectangular", seatCount: 6 }, 2, rows(1, 3, 4, 5, 6))).toEqual([
      { seat: 1, name: "Gość 1", relation: "side" },
      { seat: 3, name: "Gość 3", relation: "side" },
      { seat: 4, name: "Gość 4", relation: null },
      { seat: 5, name: "Gość 5", relation: "opposite" },
      { seat: 6, name: "Gość 6", relation: null },
    ]);
    // No wrap-around between the sides: seat 4 (start of B) is opposite 1, next to 5 only.
    expect(toTablemates({ shape: "rectangular", seatCount: 6 }, 4, rows(1, 3, 5, 6))).toEqual([
      { seat: 1, name: "Gość 1", relation: "opposite" },
      { seat: 3, name: "Gość 3", relation: null },
      { seat: 5, name: "Gość 5", relation: "side" },
      { seat: 6, name: "Gość 6", relation: null },
    ]);
  });

  it("leaves out the guest's own seat and copes with an empty table", () => {
    expect(toTablemates({ shape: "round", seatCount: 4 }, 2, rows(2))).toEqual([]);
    expect(toTablemates({ shape: "round", seatCount: 4 }, 2, [])).toEqual([]);
  });

  it("carries only seat, name and relation", () => {
    const leaky = [{ seat: 1, name: "Ola", guestId: 7, isAbsent: false }];
    expect(Object.keys(toTablemates({ shape: "round", seatCount: 4 }, 2, leaky)[0] ?? {})).toEqual([
      "seat",
      "name",
      "relation",
    ]);
  });
});

describe("guestStateVersion", () => {
  it("is stable for the same inputs", () => {
    expect(guestStateVersion("4.1700000000000", "Ania", OPEN)).toBe(guestStateVersion("4.1700000000000", "Ania", OPEN));
    expect(guestStateVersion("4.17", "Ania", { intakeOpen: false, amountGrosze: 149_999 })).toBe(
      guestStateVersion("4.17", "Ania", { intakeOpen: false, amountGrosze: 149_999 }),
    );
  });

  it("changes with the published version and with the name", () => {
    const base = guestStateVersion("4.1700000000000", "Ania", OPEN);
    expect(guestStateVersion("5.1700000000000", "Ania", OPEN)).not.toBe(base);
    expect(guestStateVersion("4.1700000000001", "Ania", OPEN)).not.toBe(base);
    expect(guestStateVersion("4.1700000000000", "Ania K.", OPEN)).not.toBe(base);
    expect(guestStateVersion("4.1700000000000", "ania", OPEN)).not.toBe(base);
  });

  it("changes when intake opens or closes and when the own guess changes (S-06)", () => {
    const versions = [
      guestStateVersion("4.17", "Ania", OPEN),
      guestStateVersion("4.17", "Ania", { intakeOpen: false, amountGrosze: null }),
      guestStateVersion("4.17", "Ania", { intakeOpen: true, amountGrosze: 0 }),
      guestStateVersion("4.17", "Ania", { intakeOpen: true, amountGrosze: 150_000 }),
      guestStateVersion("4.17", "Ania", { intakeOpen: false, amountGrosze: 150_000 }),
      guestStateVersion("4.17", "Ania", { intakeOpen: true, amountGrosze: 150_001 }),
    ];
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("starts with the seating token and stays short enough for the 64-character limit", () => {
    const version = guestStateVersion(`${Number.MAX_SAFE_INTEGER}.${Number.MAX_SAFE_INTEGER}`, "Ż".repeat(40), {
      intakeOpen: false,
      amountGrosze: 1_000_000_000,
    });
    expect(version.startsWith(`${Number.MAX_SAFE_INTEGER}.${Number.MAX_SAFE_INTEGER}.`)).toBe(true);
    expect(version.length).toBeLessThanOrEqual(64);
  });
});

describe("toGuestState", () => {
  const base = { seatingVersion: "4.17", planVersion: 17, name: "Ania", guess: OPEN };

  it("is unpublished before the first publish, even with a seat in hand", () => {
    expect(toGuestState({ ...base, seatingVersion: "0.17", snapshotId: null, seat: SEAT })).toEqual({
      version: guestStateVersion("0.17", "Ania", OPEN),
      name: "Ania",
      status: "unpublished",
      seat: null,
      planVersion: 17,
      guess: OPEN,
    });
  });

  it("is unseated when the guest is not in the latest snapshot", () => {
    expect(toGuestState({ ...base, snapshotId: 4, seat: null })).toMatchObject({ status: "unseated", seat: null });
  });

  it("is seated with the snapshot seat", () => {
    expect(toGuestState({ ...base, snapshotId: 4, seat: SEAT })).toEqual({
      version: guestStateVersion("4.17", "Ania", OPEN),
      name: "Ania",
      status: "seated",
      seat: SEAT,
      planVersion: 17,
      guess: OPEN,
    });
  });

  it("carries the intake flag and only the own guess, whatever extra the input had", () => {
    const leaky = { intakeOpen: false, amountGrosze: 149_999, correctAmountGrosze: 500_000, ranking: [] };
    const state = toGuestState({ ...base, snapshotId: 4, seat: null, guess: leaky });
    expect(state.guess).toEqual({ intakeOpen: false, amountGrosze: 149_999 });
    expect(state.version).toBe(guestStateVersion("4.17", "Ania", { intakeOpen: false, amountGrosze: 149_999 }));
    expect(Object.keys(state).sort()).toEqual(["guess", "name", "planVersion", "seat", "status", "version"]);
  });

  it("carries no ids, keys, correct amount or ranking", () => {
    const json = JSON.stringify(toGuestState({ ...base, snapshotId: 4, seat: SEAT }));
    expect(json).not.toMatch(/"(id|guestId|tableId|snapshotId|key|correctAmountGrosze|ranking|place)"/);
  });
});

describe("describeGuestSeat", () => {
  it("names table, room and seat", () => {
    expect(
      describeGuestSeat(
        toGuestState({ seatingVersion: "4.0", planVersion: null, name: "A", snapshotId: 4, seat: SEAT, guess: OPEN }),
      ),
    ).toBe("Twoje miejsce: stolik Okno, sala Sala A, miejsce 3.");
  });

  it("explains the other two states", () => {
    const common = { seatingVersion: "0.0", planVersion: null, name: "A", seat: null, guess: OPEN };
    expect(describeGuestSeat(toGuestState({ ...common, snapshotId: null }))).toBe(GUEST_UNPUBLISHED_MESSAGE);
    expect(describeGuestSeat(toGuestState({ ...common, snapshotId: 2 }))).toBe(GUEST_UNSEATED_MESSAGE);
  });

  it("does not depend on the guess, so a guess change never looks like a new seat", () => {
    const common = { seatingVersion: "4.0", planVersion: null, name: "A", snapshotId: 4, seat: SEAT };
    expect(describeGuestSeat(toGuestState({ ...common, guess: OPEN }))).toBe(
      describeGuestSeat(toGuestState({ ...common, guess: { intakeOpen: false, amountGrosze: 5 } })),
    );
  });
});
