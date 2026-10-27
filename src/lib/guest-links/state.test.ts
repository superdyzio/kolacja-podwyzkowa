import { describe, expect, it } from "vitest";
import type { GuestSeatDto } from "@/types";
import {
  GUEST_UNPUBLISHED_MESSAGE,
  GUEST_UNSEATED_MESSAGE,
  describeGuestSeat,
  guestStateVersion,
  toGuestState,
} from "./state";

const SEAT: GuestSeatDto = { table: "Okno", room: "Sala A", seat: 3, shape: "round", seatCount: 8, x: 0.25, y: 0.5 };

describe("guestStateVersion", () => {
  it("is stable for the same inputs", () => {
    expect(guestStateVersion("4.1700000000000", "Ania")).toBe(guestStateVersion("4.1700000000000", "Ania"));
  });

  it("changes with the published version and with the name", () => {
    const base = guestStateVersion("4.1700000000000", "Ania");
    expect(guestStateVersion("5.1700000000000", "Ania")).not.toBe(base);
    expect(guestStateVersion("4.1700000000001", "Ania")).not.toBe(base);
    expect(guestStateVersion("4.1700000000000", "Ania K.")).not.toBe(base);
    expect(guestStateVersion("4.1700000000000", "ania")).not.toBe(base);
  });

  it("starts with the seating token and stays short enough for the 64-character limit", () => {
    const version = guestStateVersion(`${Number.MAX_SAFE_INTEGER}.${Number.MAX_SAFE_INTEGER}`, "Ż".repeat(40));
    expect(version.startsWith(`${Number.MAX_SAFE_INTEGER}.${Number.MAX_SAFE_INTEGER}.`)).toBe(true);
    expect(version.length).toBeLessThanOrEqual(64);
  });
});

describe("toGuestState", () => {
  const base = { seatingVersion: "4.17", planVersion: 17, name: "Ania" };

  it("is unpublished before the first publish, even with a seat in hand", () => {
    expect(toGuestState({ ...base, seatingVersion: "0.17", snapshotId: null, seat: SEAT })).toEqual({
      version: guestStateVersion("0.17", "Ania"),
      name: "Ania",
      status: "unpublished",
      seat: null,
      planVersion: 17,
    });
  });

  it("is unseated when the guest is not in the latest snapshot", () => {
    expect(toGuestState({ ...base, snapshotId: 4, seat: null })).toMatchObject({ status: "unseated", seat: null });
  });

  it("is seated with the snapshot seat", () => {
    expect(toGuestState({ ...base, snapshotId: 4, seat: SEAT })).toEqual({
      version: guestStateVersion("4.17", "Ania"),
      name: "Ania",
      status: "seated",
      seat: SEAT,
      planVersion: 17,
    });
  });

  it("carries no ids or keys", () => {
    const json = JSON.stringify(toGuestState({ ...base, snapshotId: 4, seat: SEAT }));
    expect(json).not.toMatch(/"(id|guestId|tableId|snapshotId|key)"/);
  });
});

describe("describeGuestSeat", () => {
  it("names table, room and seat", () => {
    expect(
      describeGuestSeat(
        toGuestState({ seatingVersion: "4.0", planVersion: null, name: "A", snapshotId: 4, seat: SEAT }),
      ),
    ).toBe("Twoje miejsce: stolik Okno, sala Sala A, miejsce 3.");
  });

  it("explains the other two states", () => {
    const common = { seatingVersion: "0.0", planVersion: null, name: "A", seat: null };
    expect(describeGuestSeat(toGuestState({ ...common, snapshotId: null }))).toBe(GUEST_UNPUBLISHED_MESSAGE);
    expect(describeGuestSeat(toGuestState({ ...common, snapshotId: 2 }))).toBe(GUEST_UNSEATED_MESSAGE);
  });
});
