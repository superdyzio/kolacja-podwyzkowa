import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  cleanupTestSeating,
  countSnapshots,
  createTestSeating,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

async function seatDirect(db: DbClient, guestId: number, tableId: number, seat: number, pinned = false) {
  return db.from("seat_assignment").insert({ guest_id: guestId, table_id: tableId, seat, is_pinned: pinned });
}

async function seatsAt(db: DbClient, tableId: number): Promise<number[]> {
  const { data, error } = await db.from("seat_assignment").select("seat").eq("table_id", tableId).order("seat");
  if (error) {
    throw new Error(error.message);
  }
  return data.map((row) => row.seat);
}

// The browser never talks to the database, and the seating invariants hold in the database itself (one seat per
// guest, one guest per seat, seats within the table, the S-02 deletion semantics).
describe.skipIf(!hasLocalDb)("seating schema", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  let seating: TestSeating | null = null;

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterEach(async () => {
    await cleanupTestSeating(db, seating);
    seating = null;
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function setup() {
    seating = await createTestSeating(
      db,
      testTag(),
      [
        { seatCount: 8, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      3,
    );
    return seating;
  }

  const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];

  it.each(["seat_assignment", "seating_snapshot", "seating_snapshot_table", "seating_snapshot_seat"])(
    "does not serve %s rows to anonymous requests",
    async (table) => {
      const { guestIds, tableIds, guestNames } = await setup();
      const { error } = await seatDirect(db, guestIds[0], tableIds[0], 1);
      expect(error).toBeNull();
      for (const headers of anonymousHeaders) {
        const response = await fetch(`${restUrl}/${table}?select=*`, { headers });
        const body = await response.text();
        expect(body).not.toContain(guestNames[0]);
        if (response.ok) {
          expect(JSON.parse(body)).toEqual([]);
        }
      }
    },
  );

  it("does not let anonymous requests seat a guest or publish", async () => {
    const { guestIds, tableIds } = await setup();
    const before = await countSnapshots(db);
    for (const headers of anonymousHeaders) {
      const seat = await fetch(`${restUrl}/rpc/seat_guest`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_guest_id: guestIds[0], p_table_id: tableIds[0], p_seat: 1 }),
      });
      expect(seat.ok).toBe(false);
      const publish = await fetch(`${restUrl}/rpc/publish_seating`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(publish.ok).toBe(false);
    }
    expect(await seatsAt(db, tableIds[0])).toEqual([]);
    expect(await countSnapshots(db)).toBe(before);
  });

  it("gives a guest at most one seat and a seat at most one guest", async () => {
    const { guestIds, tableIds } = await setup();
    const [g1, g2] = guestIds;
    const [t1] = tableIds;
    expect((await seatDirect(db, g1, t1, 1)).error).toBeNull();
    expect((await seatDirect(db, g1, t1, 2)).error?.code).toBe("23505");
    expect((await seatDirect(db, g2, t1, 1)).error?.code).toBe("23505");
  });

  it("keeps seats within the table", async () => {
    const { guestIds, tableIds } = await setup();
    expect((await seatDirect(db, guestIds[0], tableIds[0], 0)).error?.code).toBe("23514");
    const tooFar = await seatDirect(db, guestIds[0], tableIds[1], 7);
    expect(tooFar.error?.message).toBe("SEAT_OUT_OF_RANGE");
  });

  it("unseats guests above a lowered seat count, pinned ones too, and keeps the rest", async () => {
    const { guestIds, tableIds } = await setup();
    const [g1, g2, g3] = guestIds;
    const t1 = tableIds[0];
    await seatDirect(db, g1, t1, 2);
    await seatDirect(db, g2, t1, 5, true);
    await seatDirect(db, g3, t1, 8);
    const { error } = await db.from("venue_table").update({ seat_count: 4 }).eq("id", t1);
    expect(error).toBeNull();
    expect(await seatsAt(db, t1)).toEqual([2]);
    await db.from("venue_table").update({ seat_count: 10 }).eq("id", t1);
    expect(await seatsAt(db, t1)).toEqual([2]);
  });

  it("removes the seats of a deleted table (pinned included) and of a deleted guest", async () => {
    const { guestIds, tableIds } = await setup();
    const [g1, g2, g3] = guestIds;
    const [t1, t2] = tableIds;
    await seatDirect(db, g1, t1, 1, true);
    await seatDirect(db, g2, t2, 1);
    await seatDirect(db, g3, t2, 2);
    await db.from("venue_table").delete().eq("id", t1);
    const { data: left } = await db
      .from("seat_assignment")
      .select("guest_id")
      .in("guest_id", [...guestIds]);
    expect(left?.map((row) => row.guest_id).sort()).toEqual([g2, g3].sort());
    await db.from("guest").delete().eq("id", g2);
    expect(await seatsAt(db, t2)).toEqual([2]);
  });
});
