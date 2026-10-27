import { describe, expect, it } from "vitest";
import type { GuestGuessDto, GuestSeatDto } from "@/types";
import {
  GUEST_UNPUBLISHED_MESSAGE,
  GUEST_UNSEATED_MESSAGE,
  describeGuestSeat,
  guestStateVersion,
  toGuestState,
} from "./state";

const SEAT: GuestSeatDto = { table: "Okno", room: "Sala A", seat: 3, shape: "round", seatCount: 8, x: 0.25, y: 0.5 };
const OPEN: GuestGuessDto = { intakeOpen: true, amountGrosze: null };

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
