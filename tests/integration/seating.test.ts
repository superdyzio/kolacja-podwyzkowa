import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getAssignments,
  getSeatOccupancy,
  getSeatingBoard,
  getSeatingVersion,
  getSnapshot,
  getTvSeating,
  publishSeating,
  seatGuest,
  setPinned,
  unseatGuest,
} from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import type { SeatAssignmentDto, SeatingSnapshot } from "@/types";
import {
  acquireTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  releaseEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;

describe.skipIf(!hasLocalDb)("seating service", () => {
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

  // Tables: T1 round 8 seats, T2 rectangular 6 seats; guests G1..G4.
  async function setup() {
    seating = await createTestSeating(
      db,
      testTag(),
      [
        { seatCount: 8, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      4,
    );
    const [t1, t2] = seating.tableIds;
    const [g1, g2, g3, g4] = seating.guestIds;
    return { s: seating, t1, t2, g1, g2, g3, g4 };
  }

  // Only the test's own guests (publishing and reads cover the whole event).
  async function mine(): Promise<SeatAssignmentDto[]> {
    const ids = new Set(seating?.guestIds);
    return (await getAssignments(db)).filter((assignment) => ids.has(assignment.guestId));
  }

  function where(assignments: SeatAssignmentDto[], guestId: number) {
    const found = assignments.find((assignment) => assignment.guestId === guestId);
    return found ? [found.tableId, found.seat, found.pinned] : null;
  }

  async function publish(): Promise<number> {
    const result = await publishSeating(db);
    if (result.status === "published") {
      createdSnapshots.push(result.snapshotId);
    }
    return result.snapshotId;
  }

  async function snapshot(id: number): Promise<SeatingSnapshot> {
    const found = await getSnapshot(db, id);
    if (!found) {
      throw new Error(`no snapshot ${id}`);
    }
    return found;
  }

  function snapshotNames(snap: SeatingSnapshot, tableNames: readonly string[]) {
    const tableNameById = new Map(snap.tables.map((table) => [table.snapshotTableId, table.name]));
    return snap.seats
      .filter((seat) => tableNames.includes(tableNameById.get(seat.snapshotTableId) ?? ""))
      .map((seat) => `${tableNameById.get(seat.snapshotTableId) ?? ""}#${seat.seat}=${seat.guestName}`)
      .sort();
  }

  it("seats a guest, moves them, swaps two guests and replaces an occupant from the unseated", async () => {
    const { t1, t2, g1, g2, g3 } = await setup();
    expect(await seatGuest(db, g1, t1, 1)).toEqual({ status: "seated" });
    expect(await seatGuest(db, g2, t2, 3)).toEqual({ status: "seated" });
    expect(await seatGuest(db, g1, t1, 5)).toEqual({ status: "seated" });
    expect(where(await mine(), g1)).toEqual([t1, 5, false]);

    // Swap: g1 onto g2's seat.
    expect(await seatGuest(db, g1, t2, 3)).toEqual({ status: "seated" });
    let rows = await mine();
    expect(where(rows, g1)).toEqual([t2, 3, false]);
    expect(where(rows, g2)).toEqual([t1, 5, false]);

    // g3 has no seat and takes g1's seat: g1 becomes unseated.
    expect(await seatGuest(db, g3, t2, 3)).toEqual({ status: "seated" });
    rows = await mine();
    expect(where(rows, g3)).toEqual([t2, 3, false]);
    expect(where(rows, g1)).toBeNull();

    // Own seat: nothing changes.
    expect(await seatGuest(db, g3, t2, 3)).toEqual({ status: "seated" });
    expect(await mine()).toHaveLength(2);
  });

  it("refuses seats that do not exist and unknown guests or tables", async () => {
    const { t1, t2, g1 } = await setup();
    expect(await seatGuest(db, g1, t1, 9)).toEqual({ status: "seat-out-of-range" });
    expect(await seatGuest(db, g1, t2, 0)).toEqual({ status: "seat-out-of-range" });
    expect(await seatGuest(db, UNKNOWN_ID, t1, 1)).toEqual({ status: "guest-not-found" });
    expect(await seatGuest(db, g1, UNKNOWN_ID, 1)).toEqual({ status: "table-not-found" });
    expect(await mine()).toEqual([]);
  });

  it("locks pinned guests: no move, no displacing, no unseating until unpinned", async () => {
    const { s, t1, g1, g2, g3 } = await setup();
    await seatGuest(db, g1, t1, 1);
    await seatGuest(db, g2, t1, 2);
    expect(await setPinned(db, g1, true)).toEqual({ status: "updated" });
    expect(await seatGuest(db, g1, t1, 3)).toEqual({ status: "guest-pinned", guestName: s.guestNames[0] });
    expect(await seatGuest(db, g2, t1, 1)).toEqual({ status: "seat-pinned", occupantName: s.guestNames[0] });
    expect(await seatGuest(db, g3, t1, 1)).toEqual({ status: "seat-pinned", occupantName: s.guestNames[0] });
    expect(await unseatGuest(db, g1)).toEqual({ status: "pinned", guestName: s.guestNames[0] });
    expect(where(await mine(), g1)).toEqual([t1, 1, true]);

    expect(await setPinned(db, g1, false)).toEqual({ status: "updated" });
    expect(await seatGuest(db, g2, t1, 1)).toEqual({ status: "seated" });
    expect(where(await mine(), g1)).toEqual([t1, 2, false]);
  });

  it("unseats, and pins only seated guests", async () => {
    const { t1, g1, g2 } = await setup();
    await seatGuest(db, g1, t1, 4);
    expect(await unseatGuest(db, g1)).toEqual({ status: "unseated" });
    expect(await unseatGuest(db, g1)).toEqual({ status: "unseated" });
    expect(await unseatGuest(db, UNKNOWN_ID)).toEqual({ status: "guest-not-found" });
    expect(await setPinned(db, g2, true)).toEqual({ status: "not-seated" });
    expect(await setPinned(db, UNKNOWN_ID, true)).toEqual({ status: "guest-not-found" });
    expect(await mine()).toEqual([]);
  });

  it("publishes a snapshot of tables and seated present guests; publishing again without changes is a no-op", async () => {
    const { s, t1, t2, g1, g2, g3 } = await setup();
    await seatGuest(db, g1, t1, 1);
    await seatGuest(db, g2, t2, 4);
    await seatGuest(db, g3, t2, 5);
    await db.from("guest").update({ is_absent: true }).eq("id", g3);

    const first = await publish();
    const snap = await snapshot(first);
    expect(snapshotNames(snap, s.tableNames)).toEqual(
      [`${s.tableNames[0]}#1=${s.guestNames[0]}`, `${s.tableNames[1]}#4=${s.guestNames[1]}`].sort(),
    );
    const t2Copy = snap.tables.find((table) => table.tableId === t2);
    expect(t2Copy).toMatchObject({ name: s.tableNames[1], roomName: `Sala ${s.tableNames[1].split(" ")[1]}` });
    expect(t2Copy).toMatchObject({ seatCount: 6, shape: "rectangular", x: 0.2, y: 0.5 });

    expect(await publishSeating(db)).toEqual({ status: "unchanged", snapshotId: first });

    await seatGuest(db, g1, t1, 2);
    const second = await publish();
    expect(second).toBeGreaterThan(first);
  });

  it("reports whether the TV is up to date", async () => {
    const { t1, g1, g2 } = await setup();
    await seatGuest(db, g1, t1, 1);
    await seatGuest(db, g2, t1, 2);
    await publish();
    expect((await getSeatingBoard(db)).upToDate).toBe(true);

    const changes: (() => Promise<unknown>)[] = [
      () => seatGuest(db, g1, t1, 3),
      async () =>
        db
          .from("guest")
          .update({ display_name: `Nowa ${testTag()}` })
          .eq("id", g2),
      async () => db.from("guest").update({ is_absent: true }).eq("id", g1),
      async () => db.from("venue_table").update({ pos_x: 0.77 }).eq("id", t1),
    ];
    for (const change of changes) {
      await change();
      const board = await getSeatingBoard(db);
      expect(board.upToDate).toBe(false);
      await publish();
      expect((await getSeatingBoard(db)).upToDate).toBe(true);
    }
    // Pinning changes nothing on the TV.
    await setPinned(db, g2, true);
    expect((await getSeatingBoard(db)).upToDate).toBe(true);
  });

  it("keeps a snapshot readable after its guest and table are deleted", async () => {
    const { s, t1, t2, g1, g2 } = await setup();
    await seatGuest(db, g1, t1, 1);
    await seatGuest(db, g2, t2, 2);
    const id = await publish();
    await db.from("guest").delete().eq("id", g1);
    await db.from("venue_table").delete().eq("id", t2);

    const snap = await snapshot(id);
    expect(snapshotNames(snap, s.tableNames)).toEqual(
      [`${s.tableNames[0]}#1=${s.guestNames[0]}`, `${s.tableNames[1]}#2=${s.guestNames[1]}`].sort(),
    );
    expect(snap.seats.find((seat) => seat.guestName === s.guestNames[0])?.guestId).toBeNull();
    expect(snap.tables.find((table) => table.name === s.tableNames[1])?.tableId).toBeNull();
    expect((await getSeatingBoard(db)).upToDate).toBe(false);
  });

  it("changes the TV version only on publish and shows the TV names without ids", async () => {
    const { s, t1, g1, g2 } = await setup();
    await seatGuest(db, g1, t1, 1);
    await publish();
    const version = await getSeatingVersion(db);
    const tv = await getTvSeating(db);
    expect(tv.version).toBe(version);

    // An unpublished change never reaches the TV.
    await seatGuest(db, g2, t1, 2);
    await seatGuest(db, g1, t1, 3);
    expect(await getSeatingVersion(db)).toBe(version);
    expect(await getTvSeating(db)).toEqual(tv);

    await publish();
    const after = await getTvSeating(db);
    expect(after.version).not.toBe(version);
    const myTable = after.tables.find((table) => table.name === s.tableNames[0]);
    expect(myTable?.seats).toEqual([
      { seat: 2, name: s.guestNames[1] },
      { seat: 3, name: s.guestNames[0] },
    ]);
    const json = JSON.stringify(after);
    expect(json).not.toContain("guestId");
    expect(json).not.toContain("pinned");
    expect(json).not.toContain("isAbsent");
  });

  it("lists who sits where for the venue page", async () => {
    const { s, t1, t2, g1, g4 } = await setup();
    await seatGuest(db, g1, t1, 7);
    await seatGuest(db, g4, t2, 6);
    const occupancy = (await getSeatOccupancy(db)).filter((occupant) => s.tableIds.includes(occupant.tableId));
    expect(occupancy).toEqual([
      { tableId: t1, seat: 7, guestName: s.guestNames[0] },
      { tableId: t2, seat: 6, guestName: s.guestNames[3] },
    ]);
  });
});
