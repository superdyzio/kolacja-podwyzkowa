import { describe, expect, it } from "vitest";
import { getLatestSnapshot, getPublishedSeating, toPublishedSeating } from "@/lib/seating";
import { hasLocalDb, localDb } from "./helpers";

// The organizer's published seating for the offline readout (S-09) against the local DB. Read-only: it never
// publishes or deletes anything, so it runs on whatever the event holds (or before any publish).

describe.skipIf(!hasLocalDb)("published seating for the offline readout", () => {
  const db = hasLocalDb ? localDb() : null;

  it("is the projection of the latest snapshot, with rooms and without ids", async () => {
    if (!db) {
      return;
    }
    const [published, latest] = await Promise.all([getPublishedSeating(db), getLatestSnapshot(db)]);
    expect(published).toEqual(toPublishedSeating(latest));
    if (published === null) {
      expect(latest).toBeNull();
      return;
    }
    expect(published.snapshotId).toBe(latest?.id);
    for (const table of published.tables) {
      expect(typeof table.room).toBe("string");
      const numbers = table.seats.map((seat) => seat.seat);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(numbers.every((seat) => seat >= 1 && seat <= table.seatCount)).toBe(true);
    }
    expect(JSON.stringify(published)).not.toMatch(/snapshotTableId|tableId|guestId/);
  });
});
