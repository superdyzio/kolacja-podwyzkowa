import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import { deleteGuest, getGuestList } from "@/lib/guests";
import { getRestaurantView } from "@/lib/orders/service";
import { getPublishedSeating, getSeatingBoard, publishSeating, seatGuest } from "@/lib/seating";
import { getPublishedVersion, getSeatingVersion } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { drawPersonOnTv, getTvScreen, getTvScreenVersion, getTvSpotlight } from "@/lib/tv-spotlight";
import { resetEvent } from "@/lib/reset";
import {
  createTestEvent,
  createTestSeating,
  hasLocalDb,
  localDb,
  releaseTestEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

// guest-erasure (the PR #4 review, the user's decision 1; GDPR art. 17): deleting a guest erases their name from every
// published snapshot of the event and from the TV in the same transaction (trigger guest_erase_published), and the
// TV, the guests' phones and the tablet notice it on their next poll without a republish (seating_snapshot.erased_seats
// in their tokens). Two events of their own (A changes, B must not); both deleted afterwards.
describe.skipIf(!hasLocalDb)("guest erasure", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  let seatingA: TestSeating;
  let seatingB: TestSeating;
  const snapshotsA: number[] = [];
  let snapshotB = 0;

  async function publish(eventId: number): Promise<number> {
    const result = await publishSeating(db, eventId);
    expect(result.status).toBe("published");
    return result.snapshotId;
  }

  async function seatRows(snapshotIds: readonly number[]) {
    const { data, error } = await db
      .from("seating_snapshot_seat")
      .select("snapshot_id, seat, guest_id, guest_name")
      .in("snapshot_id", [...snapshotIds]);
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  async function erasedSeats(snapshotId: number): Promise<number> {
    const { data, error } = await db.from("seating_snapshot").select("erased_seats").eq("id", snapshotId).single();
    if (error) {
      throw new Error(error.message);
    }
    return data.erased_seats;
  }

  async function everyToken(event: TestEvent, guest: { id: number; displayName: string }) {
    const [tv, tvScreen, guestVersion, guestState, tablet] = await Promise.all([
      getTvScreenVersion(db, event.id),
      getTvScreen(db, event.id),
      getGuestStateVersion(db, event.id, guest),
      getGuestState(db, event.id, guest),
      getRestaurantView(db, event.id),
    ]);
    // The 204 and the 200 path build the same token from the same reads.
    expect(tv).toBe(tvScreen.version);
    expect(guestVersion).toBe(guestState.version);
    return { tv, tvScreen, guestVersion, guestState, tablet };
  }

  const namesOnTv = (screen: Awaited<ReturnType<typeof getTvScreen>>) =>
    screen.tables.flatMap((table) => table.seats.map((seat) => seat.name));

  beforeAll(async () => {
    db = localDb();
    [a, b] = await Promise.all([createTestEvent(db, "erasure A"), createTestEvent(db, "erasure B")]);
    seatingA = await createTestSeating(db, a.id, testTag(), [{ seatCount: 6, shape: "round" }], 4);
    seatingB = await createTestSeating(db, b.id, testTag(), [{ seatCount: 6, shape: "round" }], 2);
    const [t1] = seatingA.tableIds;
    const [g1, g2, g3] = seatingA.guestIds;
    // G1, G2, G3 at T1 (G4 never seated); two snapshots, G2 in both.
    await seatGuest(db, a.id, g1, t1, 1);
    await seatGuest(db, a.id, g2, t1, 2);
    await seatGuest(db, a.id, g3, t1, 3);
    snapshotsA.push(await publish(a.id));
    await seatGuest(db, a.id, g3, t1, 4);
    snapshotsA.push(await publish(a.id));
    const [tb] = seatingB.tableIds;
    await seatGuest(db, b.id, seatingB.guestIds[0], tb, 1);
    await seatGuest(db, b.id, seatingB.guestIds[1], tb, 2);
    snapshotB = await publish(b.id);
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("starts with untouched snapshots and the two-part tokens", async () => {
    expect(await erasedSeats(snapshotsA[1])).toBe(0);
    const published = await getPublishedVersion(db, a.id);
    expect(published.erasedSeats).toBe(0);
    expect(await getSeatingVersion(db, a.id)).toBe(published.version);
  });

  it("changes no token for a guest without a published seat", async () => {
    const [g1, , , g4] = seatingA.guestIds;
    const [n1] = seatingA.guestNames;
    const before = await everyToken(a, { id: g1, displayName: n1 });
    expect(await deleteGuest(db, a.id, g4)).toEqual({ status: "deleted" });
    const after = await everyToken(a, { id: g1, displayName: n1 });
    expect(after.tv).toBe(before.tv);
    // Only the last part moves: the highest place a guest may predict (one guest fewer).
    const withoutMaxPlace = (version: string) => version.slice(0, version.lastIndexOf("."));
    expect(withoutMaxPlace(after.guestVersion)).toBe(withoutMaxPlace(before.guestVersion));
    expect(after.tablet.version).toBe(before.tablet.version);
    expect(await erasedSeats(snapshotsA[1])).toBe(0);
  });

  it("erases a deleted guest's name from every snapshot and the TV, and every screen notices without a republish", async () => {
    const [g1, g2, g3] = seatingA.guestIds;
    const [n1, n2, n3] = seatingA.guestNames;
    const [b1] = seatingB.guestIds;
    const [nb1, nb2] = seatingB.guestNames;

    // G2 drawn as the person on the TV (three present guests: the draw never repeats the person on screen).
    for (let attempt = 0; attempt < 40 && (await getTvSpotlight(db, a.id))?.text !== n2; attempt++) {
      await drawPersonOnTv(db, a.id);
    }
    expect(await getTvSpotlight(db, a.id)).toMatchObject({ kind: "person", text: n2 });
    const { data: personRow } = await db.from("tv_spotlight").select("guest_id").eq("event_id", a.id).single();
    expect(personRow?.guest_id).toBe(g2);

    const before = await everyToken(a, { id: g1, displayName: n1 });
    const beforeB = await everyToken(b, { id: b1, displayName: nb1 });
    expect(namesOnTv(before.tvScreen)).toContain(n2);
    expect(before.guestState.seat?.tablemates.map((mate) => mate.name)).toContain(n2);
    expect((await getSeatingBoard(db, a.id)).upToDate).toBe(true);

    expect(await deleteGuest(db, a.id, g2)).toEqual({ status: "deleted" });

    // The database: no seat row and no name of G2 in any snapshot, both snapshots counted once; the person row gone.
    const rows = await seatRows(snapshotsA);
    expect(rows.some((row) => row.guest_id === g2 || row.guest_name === n2)).toBe(false);
    expect(rows.filter((row) => row.snapshot_id === snapshotsA[1]).map((row) => row.guest_id)).toEqual(
      expect.arrayContaining([g1, g3]),
    );
    expect(await erasedSeats(snapshotsA[0])).toBe(1);
    expect(await erasedSeats(snapshotsA[1])).toBe(1);
    expect(await getTvSpotlight(db, a.id)).toBeNull();

    // Every screen: new tokens (still equal on the 204 and the 200 path), no name of G2.
    const after = await everyToken(a, { id: g1, displayName: n1 });
    expect(after.tv).not.toBe(before.tv);
    expect(after.tv).toContain(`${String(snapshotsA[1])}-1.`);
    expect(after.tvScreen.spotlight).toBeNull();
    expect(namesOnTv(after.tvScreen)).toEqual(expect.arrayContaining([n1, n3]));
    expect(namesOnTv(after.tvScreen)).not.toContain(n2);
    expect(after.guestVersion).not.toBe(before.guestVersion);
    // The guests' token keeps its two-part seating prefix (the erasure is in its hashed part).
    expect(after.guestVersion.startsWith(`${(await getPublishedVersion(db, a.id)).version}.`)).toBe(true);
    expect(after.guestState.seat?.tablemates).toEqual([{ seat: 4, name: n3, relation: null }]);
    const drawingNames = (after.guestState.drawing?.tables ?? []).flatMap((table) => table.seats.map((s) => s.name));
    expect(drawingNames).not.toContain(n2);
    expect(drawingNames).toEqual(expect.arrayContaining([n1, n3]));
    expect(after.tablet.version).not.toBe(before.tablet.version);
    expect(JSON.stringify(after.tablet)).not.toContain(n2);
    expect(JSON.stringify(await getPublishedSeating(db, a.id))).not.toContain(n2);
    // The working arrangement lost G2 too, so the board stays up to date (a publish would change nothing).
    const board = await getSeatingBoard(db, a.id);
    expect(board.upToDate).toBe(true);
    expect(board.guestList.guests.map((guest) => guest.id).sort()).toEqual([g1, g3].sort());

    // Event B is untouched.
    const afterB = await everyToken(b, { id: b1, displayName: nb1 });
    expect(afterB.tv).toBe(beforeB.tv);
    expect(afterB.guestVersion).toBe(beforeB.guestVersion);
    expect(afterB.tablet.version).toBe(beforeB.tablet.version);
    expect(namesOnTv(afterB.tvScreen)).toEqual(expect.arrayContaining([nb1, nb2]));
    expect(await erasedSeats(snapshotB)).toBe(0);
  });

  it("deletes a person row of the old code (no guest id) by the guest's name, never a question with that text", async () => {
    const [g1] = seatingA.guestIds;
    const [n1] = seatingA.guestNames;
    const inserted = await db
      .from("tv_spotlight")
      .insert([
        { event_id: a.id, kind: "question", text: n1 },
        { event_id: b.id, kind: "person", text: n1 },
        { event_id: a.id, kind: "person", text: n1.toUpperCase() },
      ])
      .select("id, event_id, kind");
    expect(inserted.error).toBeNull();
    expect(await deleteGuest(db, a.id, g1)).toEqual({ status: "deleted" });
    const { data } = await db
      .from("tv_spotlight")
      .select("id, event_id, kind")
      .in(
        "id",
        (inserted.data ?? []).map((row) => row.id),
      );
    expect((data ?? []).map((row) => `${row.event_id === a.id ? "A" : "B"}:${row.kind}`).sort()).toEqual([
      "A:question",
      "B:person",
    ]);
    expect(await erasedSeats(snapshotsA[1])).toBe(2);
    await db.from("tv_spotlight").delete().in("event_id", [a.id, b.id]);
  });

  it("leaves the reset of the guests working (it deletes the snapshots first)", async () => {
    const result = await resetEvent(db, a.id, ["guests"]);
    expect(result.status).toBe("reset");
    expect((await getGuestList(db, a.id)).guests).toEqual([]);
    expect(await seatRows(snapshotsA)).toEqual([]);
  });
});
