import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import { MAX_PREDICTED_PLACE, saveGuessByOrganizer } from "@/lib/guesses";
import { MAX_GUESTS, addGuests } from "@/lib/guests";
import { getLatestSnapshot, publishSeating, seatGuest } from "@/lib/seating";
import { MAX_SEATS, MAX_TABLES, addRoom, addTable } from "@/lib/venue";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// scale-150 (S-19, FR-033): one event at the new limits — 150 guests, a 30-seat table among 60 tables, a published
// snapshot of it and a place prediction of 150 — and one more of each refused by the app or by the DB CHECK.
describe.skipIf(!hasLocalDb)("scale-150 limits", () => {
  let db: DbClient;
  let event: TestEvent | undefined;

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "scale");
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  it("holds 150 guests, 60 tables with 30-seat ones, publishes them and stores place 150", async () => {
    const eventId = event?.id ?? 0;
    const names = Array.from({ length: MAX_GUESTS }, (_, index) => `Skala ${String(index + 1)}`);
    const added = await addGuests(db, eventId, names);
    expect(added.status).toBe("added");
    const guests = added.status === "added" ? added.added : [];
    expect(guests).toHaveLength(150);
    expect(await addGuests(db, eventId, ["Skala nadmiarowy"])).toEqual({
      status: "too-many",
      limit: 150,
      existing: 150,
    });

    const room = await addRoom(db, eventId, "Sala skali");
    const roomId = room.status === "added" ? room.room.id : 0;
    const big = await addTable(db, eventId, {
      roomId,
      name: "Bankiet",
      seatCount: MAX_SEATS,
      shape: "rectangular",
      x: 0.5,
      y: 0.5,
    });
    expect(big.status).toBe("added");
    const bigId = big.status === "added" ? big.table.id : 0;
    expect(big.status === "added" && big.table.seatCount).toBe(30);
    const tooBig = await addTable(db, eventId, {
      roomId,
      name: "Za duży",
      seatCount: MAX_SEATS + 1,
      shape: "round",
      x: 0.1,
      y: 0.1,
    });
    expect(tooBig).toEqual({ status: "invalid", problem: { field: "seatCount" } });
    // The DB CHECK refuses 31 seats even past the app.
    const direct = await db.from("venue_table").insert({
      event_id: eventId,
      room_id: roomId,
      name: "CHECK",
      seat_count: 31,
      shape: "round",
      pos_x: 0.2,
      pos_y: 0.2,
    });
    expect(direct.error?.message ?? "").toContain("venue_table_seat_count");

    // The rest up to 60 tables in one insert, then the 61st is refused.
    const rows = Array.from({ length: MAX_TABLES - 1 }, (_, index) => ({
      event_id: eventId,
      room_id: roomId,
      name: `S${String(index + 1)}`,
      seat_count: 4,
      shape: "round",
      pos_x: 0.5,
      pos_y: 0.5,
    }));
    const inserted = await db.from("venue_table").insert(rows);
    expect(inserted.error).toBeNull();
    expect(await addTable(db, eventId, { roomId, name: "S61", seatCount: 4, shape: "round", x: 0.3, y: 0.3 })).toEqual({
      status: "too-many",
      limit: 60,
    });

    // Seat 30 guests at the 30-seat table (seat 30 included) and publish: the snapshot keeps 30 seats.
    for (let seat = 1; seat <= MAX_SEATS; seat++) {
      expect(await seatGuest(db, eventId, guests[seat - 1].id, bigId, seat)).toEqual({ status: "seated" });
    }
    expect((await publishSeating(db, eventId)).status).toBe("published");
    const snapshot = await getLatestSnapshot(db, eventId);
    expect(snapshot?.tables.find((table) => table.tableId === bigId)?.seatCount).toBe(30);
    expect(
      snapshot?.seats.filter(
        (row) => row.snapshotTableId === snapshot.tables.find((t) => t.tableId === bigId)?.snapshotTableId,
      ),
    ).toHaveLength(30);

    // A place prediction of 150 (= MAX_GUESTS) is stored; 151 is refused by the DB CHECK.
    expect(MAX_PREDICTED_PLACE).toBe(MAX_GUESTS);
    expect(await saveGuessByOrganizer(db, eventId, guests[0].id, 150_000, MAX_GUESTS)).toEqual({ status: "saved" });
    const tooFar = await db
      .from("guess")
      .update({ predicted_place: MAX_GUESTS + 1 })
      .eq("guest_id", guests[0].id);
    expect(tooFar.error?.message ?? "").toContain("guess_predicted_place_range");
  });
});
