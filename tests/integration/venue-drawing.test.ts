import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getGuestState } from "@/lib/guest-links";
import {
  getAssignments,
  getSeatingBoard,
  getSnapshot,
  getTvSeating,
  publishSeating,
  seatGuest,
  setPinned,
} from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import {
  DEFAULT_CHAIR_PITCH,
  MAX_TABLES,
  applyVenueLayout,
  getVenue,
  setChairPitch,
  updateRoom,
  updateTable,
} from "@/lib/venue";
import type { SeatingSnapshot } from "@/types";
import {
  acquireTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  planExists,
  releaseEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;
const OUTLINE = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

// venue-drawing: rotations, room outlines and the chair pitch reach the snapshot, the TV and the guest's drawing;
// apply_venue_layout() writes a proposal in place and atomically, and never deletes.
describe.skipIf(!hasLocalDb)("venue drawing", () => {
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

  async function setup() {
    const tag = testTag();
    seating = await createTestSeating(
      db,
      tag,
      [
        { seatCount: 8, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      3,
    );
    return { tag, s: seating };
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

  it("publishes rotations, the pitch and outlined rooms, and shows them on the TV and the guest's drawing", async () => {
    const { s } = await setup();
    const [t1, t2] = s.tableIds;
    expect((await updateTable(db, t2, { rotation: -90 })).status).toBe("updated");
    expect((await updateRoom(db, s.roomId, { outline: OUTLINE })).status).toBe("updated");
    await seatGuest(db, s.guestIds[0], t1, 1);
    await seatGuest(db, s.guestIds[1], t1, 2);

    const venue = await getVenue(db);
    expect(venue.tables.find((table) => table.id === t2)?.rotation).toBe(270);
    expect(venue.rooms.find((room) => room.id === s.roomId)?.outline).toEqual(OUTLINE);

    const snap = await snapshot(await publish());
    expect(snap.tables.find((table) => table.tableId === t2)?.rotation).toBe(270);
    expect(snap.chairPitch).toBe(venue.chairPitch);
    expect(snap.rooms).toContainEqual({ name: `Sala ${s.tableNames[0].split(" ")[1]}`, ...OUTLINE });
    expect((await getSeatingBoard(db)).upToDate).toBe(true);

    const tv = await getTvSeating(db);
    expect(tv.tables.find((table) => table.name === s.tableNames[1])?.rotation).toBe(270);
    expect(tv.rooms.map((room) => room.name)).toContain(`Sala ${s.tableNames[0].split(" ")[1]}`);

    const state = await getGuestState(db, { id: s.guestIds[0], displayName: s.guestNames[0] });
    expect(state.status).toBe("seated");
    expect(state.drawing?.tables.find((table) => table.name === s.tableNames[1])).toMatchObject({
      shape: "rectangular",
      seatCount: 6,
      rotation: 270,
    });
    // The drawing carries table and room names only: never who sits where.
    const json = JSON.stringify(state.drawing);
    expect(json).not.toContain(s.guestNames[1]);
    expect(json).not.toMatch(/guestId|tableId|access_key|key/);

    // Any drawing change is an unpublished change.
    await updateTable(db, t2, { rotation: 0 });
    expect((await getSeatingBoard(db)).upToDate).toBe(false);
    await publish();
    await updateRoom(db, s.roomId, { outline: null });
    expect((await getSeatingBoard(db)).upToDate).toBe(false);
  });

  it("reads a snapshot published before the drawing as the defaults, so an untouched board stays up to date", async () => {
    await setup();
    const venue = await getVenue(db);
    const id = await publish();
    // What the migration leaves on older snapshots: no pitch, no rotations, no rooms.
    const nulled = await db.from("seating_snapshot").update({ chair_pitch: null }).eq("id", id);
    expect(nulled.error).toBeNull();
    const tables = await db.from("seating_snapshot_table").update({ rotation: null }).eq("snapshot_id", id);
    expect(tables.error).toBeNull();
    const rooms = await db.from("seating_snapshot_room").delete().eq("snapshot_id", id);
    expect(rooms.error).toBeNull();

    const snap = await snapshot(id);
    expect(snap.chairPitch).toBe(DEFAULT_CHAIR_PITCH);
    expect(snap.rooms).toEqual([]);
    expect(snap.tables.every((table) => table.rotation === 0)).toBe(true);

    const untouched =
      venue.chairPitch === DEFAULT_CHAIR_PITCH &&
      venue.rooms.every((room) => room.outline === null) &&
      venue.tables.every((table) => table.rotation === 0);
    // Only meaningful on a venue that was never drawn (fresh DB, demo data); a drawn local venue skips this check.
    if (untouched) {
      expect((await getSeatingBoard(db)).upToDate).toBe(true);
    }
  });

  it("applies a layout in place: tables move and turn, seats and pins stay, new tables are added", async () => {
    const { tag, s } = await setup();
    const [t1, t2] = s.tableIds;
    const [g1, g2] = s.guestIds;
    await seatGuest(db, g1, t1, 3);
    await setPinned(db, g1, true);
    await seatGuest(db, g2, t2, 4);
    const before = await getAssignments(db);
    const tableCount = (await getVenue(db)).tables.length;
    const originalPitch = (await getVenue(db)).chairPitch;
    const hasPlan = await planExists(db);

    const result = await applyVenueLayout(db, {
      tables: [
        { id: t1, x: 0.25, y: 0.75, rotation: 45 },
        { id: t2, x: 0.6, y: 0.4, rotation: 450 },
      ],
      newTables: [
        { roomId: s.roomId, name: `  Nowy  ${tag}`, seatCount: 4, shape: "round", x: 0.9, y: 0.9, rotation: 0 },
      ],
      rooms: [{ id: s.roomId, outline: OUTLINE }],
      chairPitch: hasPlan ? 0.04 : null,
    });
    try {
      expect(result).toEqual({ status: "applied" });
      const venue = await getVenue(db);
      expect(venue.tables.find((table) => table.id === t1)).toMatchObject({ x: 0.25, y: 0.75, rotation: 45 });
      expect(venue.tables.find((table) => table.id === t2)).toMatchObject({ x: 0.6, y: 0.4, rotation: 90 });
      expect(venue.tables.find((table) => table.name === `Nowy ${tag}`)).toMatchObject({
        seatCount: 4,
        roomId: s.roomId,
      });
      expect(venue.tables).toHaveLength(tableCount + 1);
      expect(venue.rooms.find((room) => room.id === s.roomId)?.outline).toEqual(OUTLINE);
      if (hasPlan) {
        expect(venue.chairPitch).toBe(0.04);
      }
      // Seat assignments and pins are untouched.
      expect(await getAssignments(db)).toEqual(before);
    } finally {
      if (hasPlan) {
        await setChairPitch(db, originalPitch);
      }
    }
  });

  it("refuses unknown ids, duplicate names and too many tables without writing anything", async () => {
    const { tag, s } = await setup();
    const [t1, t2] = s.tableIds;
    const venueBefore = await getVenue(db);
    const move = { id: t1, x: 0.01, y: 0.02, rotation: 10 };
    const newTable = (name: string) => ({
      roomId: s.roomId,
      name,
      seatCount: 4,
      shape: "round" as const,
      x: 0.5,
      y: 0.5,
      rotation: 0,
    });

    expect(
      await applyVenueLayout(db, {
        tables: [move, { id: UNKNOWN_ID, x: 0.5, y: 0.5, rotation: 0 }],
        newTables: [],
        rooms: [],
        chairPitch: null,
      }),
    ).toEqual({ status: "table-not-found" });
    expect(
      await applyVenueLayout(db, {
        tables: [move],
        newTables: [newTable(`Inny ${tag}`)],
        rooms: [{ id: UNKNOWN_ID, outline: OUTLINE }],
        chairPitch: null,
      }),
    ).toEqual({ status: "room-not-found" });
    expect(
      await applyVenueLayout(db, {
        tables: [move],
        newTables: [newTable(`Ok ${tag}`), newTable(s.tableNames[1].toUpperCase())],
        rooms: [],
        chairPitch: null,
      }),
    ).toEqual({ status: "duplicate" });
    const many = Array.from({ length: MAX_TABLES - venueBefore.tables.length + 1 }, (_, index) =>
      newTable(`Masa ${index} ${tag}`),
    );
    expect(await applyVenueLayout(db, { tables: [move], newTables: many, rooms: [], chairPitch: null })).toEqual({
      status: "too-many",
      limit: MAX_TABLES,
    });

    const venueAfter = await getVenue(db);
    expect(venueAfter).toEqual(venueBefore);
    expect(venueAfter.tables.find((table) => table.id === t2)?.rotation).toBe(0);
  });
});
