import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { isWellFormedAccessKey } from "@/lib/access/keys";
import { resolveAccess } from "@/lib/access/resolve";
import {
  getGuestAccessEnabled,
  getGuestLinks,
  getGuestState,
  getGuestStateVersion,
  revokeGuestKey,
  setGuestAccess,
} from "@/lib/guest-links";
import { deleteGuest, updateGuest } from "@/lib/guests";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import {
  createTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  readGuestAccessEnabled,
  readGuestKeys,
  releaseTestEvent,
  testTag,
  writeGuestAccessEnabled,
  type TestEvent,
  type TestSeating,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;

// Guest link services (S-05) against the local DB. Publishing covers the whole event, so the snapshots a test
// publishes are deleted afterwards (as in seating.test.ts); the guest-access switch is put back after every test.
describe.skipIf(!hasLocalDb)("guest link services", () => {
  let db: DbClient;
  let event: TestEvent;
  let originalEnabled = false;
  let seating: TestSeating | null = null;
  const createdSnapshots: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db);
    originalEnabled = await readGuestAccessEnabled(db, event.id);
  });

  afterEach(async () => {
    await writeGuestAccessEnabled(db, event.id, originalEnabled);
    await deleteTestSnapshots(db, createdSnapshots.splice(0));
    await cleanupTestSeating(db, seating);
    seating = null;
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  // T1 round 6 seats; guests G1..G3.
  async function setup() {
    seating = await createTestSeating(db, event.id, testTag(), [{ seatCount: 6, shape: "round" }], 3);
    const [t1] = seating.tableIds;
    const [g1, g2, g3] = seating.guestIds;
    const [n1, n2, n3] = seating.guestNames;
    return { s: seating, t1, g1, g2, g3, n1, n2, n3 };
  }

  async function publish(): Promise<number> {
    const result = await publishSeating(db, event.id);
    if (result.status === "published") {
      createdSnapshots.push(result.snapshotId);
    }
    return result.snapshotId;
  }

  it("lists every guest's link in alphabetical order with the switch", async () => {
    const { g1, g2, g3, n1 } = await setup();
    const links = await getGuestLinks(db, event.id);
    expect(links.enabled).toBe(originalEnabled);
    const mine = links.guests.filter((guest) => [g1, g2, g3].includes(guest.id));
    expect(mine.map((guest) => guest.id)).toEqual([g1, g2, g3]);
    expect(mine[0]?.displayName).toBe(n1);
    const keyById = await readGuestKeys(db, [g1, g2, g3]);
    for (const guest of mine) {
      expect(isWellFormedAccessKey(guest.key)).toBe(true);
      expect(guest.key).toBe(keyById.get(guest.id));
    }
    const names = links.guests.map((guest) => guest.displayName);
    const collator = new Intl.Collator("pl");
    expect(names).toEqual([...names].sort((a, b) => collator.compare(a, b)));
  });

  it("turns guest access on and off", async () => {
    expect((await setGuestAccess(db, event.id, true)).enabled).toBe(true);
    expect(await readGuestAccessEnabled(db, event.id)).toBe(true);
    expect(await getGuestAccessEnabled(db, event.id)).toBe(true);
    expect((await setGuestAccess(db, event.id, false)).enabled).toBe(false);
    expect(await readGuestAccessEnabled(db, event.id)).toBe(false);
    expect(await getGuestAccessEnabled(db, event.id)).toBe(false);
  });

  it("revokes a link by issuing a new key; the old one stops working at once", async () => {
    const { g1, g2 } = await setup();
    await writeGuestAccessEnabled(db, event.id, true);
    const before = await readGuestKeys(db, [g1, g2]);
    const oldKey = before.get(g1) ?? "";
    expect((await resolveAccess(db, "guest", oldKey))?.role).toBe("guest");

    const result = await revokeGuestKey(db, event.id, g1);
    if (result.status !== "revoked") {
      throw new Error("expected revoked");
    }
    expect(isWellFormedAccessKey(result.key)).toBe(true);
    expect(result.key).not.toBe(oldKey);
    expect(await resolveAccess(db, "guest", oldKey)).toBeNull();
    expect(await resolveAccess(db, "guest", result.key)).toMatchObject({ role: "guest", guest: { id: g1 } });

    const after = await readGuestKeys(db, [g1, g2]);
    expect(after.get(g1)).toBe(result.key);
    expect(after.get(g2)).toBe(before.get(g2));
  });

  it("does not revoke an unknown guest", async () => {
    expect(await revokeGuestKey(db, event.id, UNKNOWN_ID)).toEqual({ status: "not-found" });
  });

  it("shows the guest's seat from the latest PUBLISHED arrangement only", async () => {
    const { s, t1, g1, g2, n1, n2 } = await setup();
    await seatGuest(db, event.id, g1, t1, 2);
    await publish();

    const seated = await getGuestState(db, event.id, { id: g1, displayName: n1 });
    expect(seated).toMatchObject({
      name: n1,
      status: "seated",
      seat: {
        table: s.tableNames[0],
        room: `Sala ${s.tableNames[0]?.split(" ")[1] ?? ""}`,
        seat: 2,
        shape: "round",
        seatCount: 6,
      },
    });
    expect(await getGuestState(db, event.id, { id: g2, displayName: n2 })).toMatchObject({
      status: "unseated",
      seat: null,
    });

    // An unpublished move changes nothing for the guest.
    await seatGuest(db, event.id, g1, t1, 5);
    expect((await getGuestState(db, event.id, { id: g1, displayName: n1 })).seat?.seat).toBe(2);

    // The next publish does.
    await publish();
    expect((await getGuestState(db, event.id, { id: g1, displayName: n1 })).seat?.seat).toBe(5);
  });

  it("lists who else sits at the guest's table in the same published snapshot, neighbours marked", async () => {
    // T1 rectangular 6 (side A 1..3, side B 4..6), T2 round 4; G1..G4.
    seating = await createTestSeating(
      db,
      event.id,
      testTag(),
      [
        { seatCount: 6, shape: "rectangular" },
        { seatCount: 4, shape: "round" },
      ],
      4,
    );
    const [t1, t2] = seating.tableIds;
    const [g1, g2, g3, g4] = seating.guestIds;
    const [n1, n2, n3, n4] = seating.guestNames;
    await seatGuest(db, event.id, g1, t1, 2);
    await seatGuest(db, event.id, g2, t1, 1);
    await seatGuest(db, event.id, g3, t1, 5);
    await seatGuest(db, event.id, g4, t2, 1);
    await publish();

    const expected = [
      { seat: 1, name: n2, relation: "side" },
      { seat: 5, name: n3, relation: "opposite" },
    ];
    expect((await getGuestState(db, event.id, { id: g1, displayName: n1 })).seat?.tablemates).toEqual(expected);
    expect((await getGuestState(db, event.id, { id: g3, displayName: n3 })).seat?.tablemates).toEqual([
      { seat: 1, name: n2, relation: null },
      { seat: 2, name: n1, relation: "opposite" },
    ]);
    // Another table's guests never show up.
    expect((await getGuestState(db, event.id, { id: g4, displayName: n4 })).seat?.tablemates).toEqual([]);

    // An unpublished move changes nothing; a guest deleted after the publish still shows on the TV, so here too.
    await seatGuest(db, event.id, g3, t1, 6);
    await deleteGuest(db, event.id, g2);
    expect((await getGuestState(db, event.id, { id: g1, displayName: n1 })).seat?.tablemates).toEqual(expected);
  });

  it("leaves absent guests out (they are not in the snapshot)", async () => {
    const { t1, g1, n1 } = await setup();
    await seatGuest(db, event.id, g1, t1, 1);
    await updateGuest(db, event.id, g1, { isAbsent: true });
    await publish();
    expect(await getGuestState(db, event.id, { id: g1, displayName: n1 })).toMatchObject({
      status: "unseated",
      seat: null,
    });
  });

  it("keeps the polling token until a publish or a rename", async () => {
    const { t1, g1, n1 } = await setup();
    await seatGuest(db, event.id, g1, t1, 3);
    await publish();
    const guest = { id: g1, displayName: n1 };
    const state = await getGuestState(db, event.id, guest);
    expect(await getGuestStateVersion(db, event.id, guest)).toBe(state.version);

    await seatGuest(db, event.id, g1, t1, 4);
    expect(await getGuestStateVersion(db, event.id, guest)).toBe(state.version);
    expect(await getGuestStateVersion(db, event.id, { ...guest, displayName: `${n1} K.` })).not.toBe(state.version);

    await publish();
    expect(await getGuestStateVersion(db, event.id, guest)).not.toBe(state.version);
    expect((await getGuestState(db, event.id, guest)).version).toBe(await getGuestStateVersion(db, event.id, guest));
  });
});
