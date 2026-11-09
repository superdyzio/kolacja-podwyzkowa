import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLatestSnapshot, getPublishedSeating, publishSeating, seatGuest, toPublishedSeating } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import {
  createTestEvent,
  createTestSeating,
  hasLocalDb,
  localDb,
  releaseTestEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// The organizer's published seating for the offline readout (S-09) against the local DB, on the suite's own event
// (multi-tenant-events): nothing before the first publish, then the projection of the latest snapshot.

describe.skipIf(!hasLocalDb)("published seating for the offline readout", () => {
  let db: DbClient;
  let event: TestEvent;

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "published");
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  it("is null before the first publish", async () => {
    expect(await getPublishedSeating(db, event.id)).toBeNull();
  });

  it("is the projection of the latest snapshot, with rooms and without ids", async () => {
    const tag = testTag();
    const seating = await createTestSeating(
      db,
      event.id,
      tag,
      [
        { seatCount: 4, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      3,
    );
    const [round, rectangular] = seating.tableIds;
    const [first, second, third] = seating.guestIds;
    expect((await seatGuest(db, event.id, first, round, 2)).status).toBe("seated");
    expect((await seatGuest(db, event.id, second, round, 1)).status).toBe("seated");
    expect((await seatGuest(db, event.id, third, rectangular, 4)).status).toBe("seated");
    expect((await publishSeating(db, event.id)).status).toBe("published");

    const [published, latest] = await Promise.all([getPublishedSeating(db, event.id), getLatestSnapshot(db, event.id)]);
    expect(published).toEqual(toPublishedSeating(latest));
    expect(published?.snapshotId).toBe(latest?.id);
    expect(published?.tables).toHaveLength(2);
    for (const table of published?.tables ?? []) {
      expect(table.room).toBe(`Sala ${tag}`);
      const numbers = table.seats.map((seat) => seat.seat);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(numbers.every((seat) => seat >= 1 && seat <= table.seatCount)).toBe(true);
    }
    expect(JSON.stringify(published)).not.toMatch(/snapshotTableId|tableId|guestId/);
  });
});
