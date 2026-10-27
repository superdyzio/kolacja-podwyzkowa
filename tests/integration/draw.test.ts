import { afterAll, afterEach, beforeAll, describe, expect, it, type TestContext } from "vitest";
import { createGroup } from "@/lib/guests/service";
import {
  createRandom,
  drawSeating,
  getAssignments,
  getNeighbourHistory,
  getSeatingBoard,
  getSeatingVersion,
  historyPairs,
  publishSeating,
  getSnapshot,
  repeatedNeighbours,
  replaceSeating,
  restoreSnapshot,
  saveDraft,
  seatGuest,
  setPinned,
} from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import type { SeatAssignmentDto } from "@/types";
import {
  acquireTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;

// The draw writes the WHOLE event's working arrangement (every non-pinned row) and validates against every present
// guest, so these tests run only when the event holds no guests but their own — otherwise they skip (real data is
// never touched).
describe.skipIf(!hasLocalDb)("draw: history, drafts and restore", () => {
  let db: DbClient;
  let event: TestEvent;
  let seating: TestSeating | null = null;
  const createdSnapshots: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
  });

  afterEach(async () => {
    await deleteTestSnapshots(db, createdSnapshots.splice(0));
    await cleanupTestSeating(db, seating);
    seating = null;
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function setup(
    ctx: TestContext,
    tables: { seatCount: number; shape: "round" | "rectangular" }[],
    guestCount: number,
  ): Promise<TestSeating> {
    seating = await createTestSeating(db, testTag(), tables, guestCount);
    const { count, error } = await db
      .from("guest")
      .select("id", { count: "exact", head: true })
      .not("id", "in", `(${seating.guestIds.join(",")})`);
    if (error) {
      throw new Error(error.message);
    }
    if ((count ?? 0) > 0) {
      ctx.skip();
    }
    return seating;
  }

  async function publish(): Promise<number> {
    const result = await publishSeating(db);
    if (result.status === "published") {
      createdSnapshots.push(result.snapshotId);
    }
    return result.snapshotId;
  }

  function rows(assignments: SeatAssignmentDto[]): string[] {
    return assignments.map((a) => `${a.guestId}@${a.tableId}#${a.seat}${a.pinned ? "*" : ""}`).sort();
  }

  it("builds the history from every published snapshot's own geometry", async (ctx) => {
    const s = await setup(
      ctx,
      [
        { seatCount: 4, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      6,
    );
    const [t1, t2] = s.tableIds;
    const [g1, g2, g3, g4, g5, g6] = s.guestIds;
    for (const [guestId, seat] of [
      [g1, 1],
      [g2, 2],
      [g3, 3],
      [g4, 4],
    ] as const) {
      await seatGuest(db, guestId, t1, seat);
    }
    await seatGuest(db, g5, t2, 1);
    await seatGuest(db, g6, t2, 4); // opposite seat 1
    await publish();
    await seatGuest(db, g2, t1, 3); // swap g2 and g3
    await publish();

    const index = new Map(s.guestIds.map((id, position) => [id, position + 1]));
    const ours = (pairs: [number, number][]) =>
      pairs
        .filter(([a, b]) => index.has(a) && index.has(b))
        .map(([a, b]) => [index.get(a) ?? 0, index.get(b) ?? 0].sort().join("-"))
        .sort();
    const history = await getNeighbourHistory(db);
    expect(history.snapshotCount).toBeGreaterThanOrEqual(2);
    expect(ours(history.pairs)).toEqual(["1-2", "1-3", "1-4", "2-3", "2-4", "3-4", "5-6"]);

    // A later shape change does not rewrite history; a deleted guest's pairs disappear.
    await db.from("venue_table").update({ shape: "rectangular" }).eq("id", t1);
    await db.from("guest").delete().eq("id", g6);
    expect(ours((await getNeighbourHistory(db)).pairs)).toEqual(["1-2", "1-3", "1-4", "2-3", "2-4", "3-4"]);
  });

  it("saves a valid draft: non-pinned rows replaced, pins kept, absent guests unseated, TV untouched", async (ctx) => {
    const s = await setup(
      ctx,
      [
        { seatCount: 6, shape: "round" },
        { seatCount: 4, shape: "rectangular" },
      ],
      6,
    );
    const [t1, t2] = s.tableIds;
    const [g1, g2, g3, g4, g5, g6] = s.guestIds;
    expect((await createGroup(db, [g1, g2])).status).toBe("created");
    await seatGuest(db, g3, t1, 1);
    await setPinned(db, g3, true);
    await seatGuest(db, g4, t2, 2);
    await setPinned(db, g4, true);
    await seatGuest(db, g5, t2, 3);
    await db.from("guest").update({ is_absent: true }).in("id", [g4, g5]);
    await publish();
    const version = await getSeatingVersion(db);

    expect(
      await saveDraft(db, [
        { guestId: g1, tableId: t1, seat: 3 },
        { guestId: g2, tableId: t1, seat: 4 },
        { guestId: g6, tableId: t2, seat: 4 },
      ]),
    ).toEqual({ status: "saved" });
    expect(rows(await getAssignments(db))).toEqual(
      rows([
        { guestId: g3, tableId: t1, seat: 1, pinned: true },
        { guestId: g4, tableId: t2, seat: 2, pinned: true },
        { guestId: g1, tableId: t1, seat: 3, pinned: false },
        { guestId: g2, tableId: t1, seat: 4, pinned: false },
        { guestId: g6, tableId: t2, seat: 4, pinned: false },
      ]),
    );
    expect(await getSeatingVersion(db)).toBe(version);
    expect((await getSeatingBoard(db)).upToDate).toBe(false);
  });

  it("refuses an invalid draft with Polish reasons and changes nothing", async (ctx) => {
    const s = await setup(
      ctx,
      [
        { seatCount: 6, shape: "round" },
        { seatCount: 4, shape: "rectangular" },
      ],
      3,
    );
    const [t1, t2] = s.tableIds;
    const [g1, g2, g3] = s.guestIds;
    const [n1, n2, n3] = s.guestNames;
    expect((await createGroup(db, [g1, g2])).status).toBe("created");
    await seatGuest(db, g3, t1, 1);
    await setPinned(db, g3, true);
    const before = rows(await getAssignments(db));

    const missing = await saveDraft(db, [{ guestId: g1, tableId: t1, seat: 2 }]);
    expect(missing).toEqual({ status: "invalid", problems: [`Bez miejsca w projekcie: ${n2}.`] });
    const split = await saveDraft(db, [
      { guestId: g1, tableId: t1, seat: 3 },
      { guestId: g2, tableId: t2, seat: 1 },
    ]);
    expect(split).toEqual({
      status: "invalid",
      problems: [`${n1} i ${n2} — muszą siedzieć obok siebie przy jednym stoliku.`],
    });
    const pinnedSeat = await saveDraft(db, [
      { guestId: g1, tableId: t1, seat: 1 },
      { guestId: g2, tableId: t1, seat: 2 },
    ]);
    expect(pinnedSeat.status).toBe("invalid");
    const pinnedGuest = await saveDraft(db, [
      { guestId: g1, tableId: t1, seat: 2 },
      { guestId: g2, tableId: t1, seat: 3 },
      { guestId: g3, tableId: t1, seat: 4 },
    ]);
    expect(pinnedGuest).toEqual({
      status: "invalid",
      problems: [`Przypięta osoba w projekcie: ${n3} — jej miejsce się nie zmienia.`],
    });
    expect(rows(await getAssignments(db))).toEqual(before);
  });

  it("aborts the whole write when a row collides with a pinned seat", async (ctx) => {
    const s = await setup(ctx, [{ seatCount: 6, shape: "round" }], 3);
    const [t1] = s.tableIds;
    const [g1, g2, g3] = s.guestIds;
    await seatGuest(db, g1, t1, 1);
    await setPinned(db, g1, true);
    await seatGuest(db, g2, t1, 2);
    const before = rows(await getAssignments(db));

    const { error } = await db.rpc("replace_seating", {
      p_seats: [
        { guest_id: g3, table_id: t1, seat: 3 },
        { guest_id: g2, table_id: t1, seat: 1 },
      ],
    });
    expect(error?.code).toBe("23505");
    expect(rows(await getAssignments(db))).toEqual(before);
    expect(
      await replaceSeating(db, [
        { guestId: g2, tableId: t1, seat: 4 },
        { guestId: g3, tableId: t1, seat: 9 },
      ]),
    ).toEqual({ status: "conflict" });
    expect(await replaceSeating(db, [{ guestId: UNKNOWN_ID, tableId: t1, seat: 4 }])).toEqual({ status: "conflict" });
    expect(rows(await getAssignments(db))).toEqual(before);
  });

  it("restores the published or the previous arrangement, skipping what no longer exists", async (ctx) => {
    const s = await setup(
      ctx,
      [
        { seatCount: 6, shape: "round" },
        { seatCount: 4, shape: "round" },
      ],
      4,
    );
    const [t1, t2] = s.tableIds;
    const [g1, g2, g3, g4] = s.guestIds;
    const [, , n3, n4] = s.guestNames;
    await seatGuest(db, g1, t1, 1);
    await seatGuest(db, g2, t1, 2);
    await seatGuest(db, g3, t1, 6);
    await seatGuest(db, g4, t2, 4);
    const first = await publish();
    const firstRows = rows(await getAssignments(db));
    await seatGuest(db, g1, t2, 1);
    await seatGuest(db, g3, t1, 3);
    const second = await publish();
    const secondRows = rows(await getAssignments(db));

    const board = await getSeatingBoard(db);
    expect(board.published?.snapshotId).toBe(second);
    expect(board.previous?.snapshotId).toBe(first);

    // Discard a draft: back to what the TV shows.
    await saveDraft(db, [
      { guestId: g1, tableId: t1, seat: 4 },
      { guestId: g2, tableId: t1, seat: 5 },
      { guestId: g3, tableId: t2, seat: 2 },
      { guestId: g4, tableId: t2, seat: 3 },
    ]);
    const discarded = await restoreSnapshot(db, second);
    expect(discarded.status).toBe("restored");
    expect(rows(await getAssignments(db))).toEqual(secondRows);
    expect((await getSeatingBoard(db)).upToDate).toBe(true);

    // Back to the previous arrangement.
    const back = await restoreSnapshot(db, first);
    expect(back).toMatchObject({ status: "restored" });
    expect(rows(await getAssignments(db))).toEqual(firstRows);

    // The venue changed since: seat 6 of T1 is gone and T2 was deleted.
    await db.from("venue_table").update({ seat_count: 5 }).eq("id", t1);
    await db.from("venue_table").delete().eq("id", t2);
    const pruned = await restoreSnapshot(db, first);
    expect(pruned.status).toBe("restored");
    const notice = pruned.status === "restored" ? pruned.notice : "";
    expect(notice).toContain("Przywrócono rozkład z");
    expect(notice).toContain(`${n3} (tego miejsca już nie ma)`);
    expect(notice).toContain(`${n4} (stolik usunięty)`);
    expect(rows(await getAssignments(db))).toEqual(
      rows([
        { guestId: g1, tableId: t1, seat: 1, pinned: false },
        { guestId: g2, tableId: t1, seat: 2, pinned: false },
      ]),
    );

    expect(await restoreSnapshot(db, UNKNOWN_ID)).toEqual({ status: "not-found" });
  });

  it("draws in the browser's way end to end: board + history → solver → saved draft without repeats", async (ctx) => {
    const s = await setup(
      ctx,
      [
        { seatCount: 6, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      10,
    );
    const [t1, t2] = s.tableIds;
    for (const [index, guestId] of s.guestIds.entries()) {
      await seatGuest(db, guestId, index < 6 ? t1 : t2, index < 6 ? index + 1 : index - 5);
    }
    const published = await publish();

    const board = await getSeatingBoard(db);
    const history = await getNeighbourHistory(db);
    const snapshot = await getSnapshot(db, published);
    expect(history.pairs.length).toBeGreaterThanOrEqual(historyPairs(snapshot ? [snapshot] : []).length);
    const result = drawSeating(board, history.pairs, { random: createRandom(42), timeBudgetMs: 1000 });
    expect(result).toMatchObject({ status: "drawn", repeats: 0 });
    if (result.status !== "drawn") {
      return;
    }
    expect(await saveDraft(db, result.seats)).toEqual({ status: "saved" });
    expect(repeatedNeighbours(await getSeatingBoard(db), history.pairs)).toEqual([]);
  });

  it("does not let anonymous requests replace the seating", async (ctx) => {
    const s = await setup(ctx, [{ seatCount: 6, shape: "round" }], 2);
    const [t1] = s.tableIds;
    const [g1, g2] = s.guestIds;
    await seatGuest(db, g1, t1, 1);
    const before = rows(await getAssignments(db));
    const env = localDbEnv();
    const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];
    for (const headers of anonymousHeaders) {
      const response = await fetch(`${env?.url ?? ""}/rest/v1/rpc/replace_seating`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_seats: [{ guest_id: g2, table_id: t1, seat: 2 }] }),
      });
      expect(response.ok).toBe(false);
    }
    expect(rows(await getAssignments(db))).toEqual(before);
  });
});
