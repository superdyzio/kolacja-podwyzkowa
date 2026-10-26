import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  addGuests,
  createGroup,
  deleteGuest,
  dissolveGroup,
  getGuestList,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GUESTS,
  parseGuestList,
  updateGuest,
} from "@/lib/guests";
import type { DbClient } from "@/lib/supabase-client";
import type { GuestDto, GuestListDto } from "@/types";
import {
  acquireTestEvent,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// FR-001..FR-003 and the group invariants against the real schema. The suite may run next to real guests: every
// name carries a per-run tag, and each test deletes only the guests it created.
describe.skipIf(!hasLocalDb)("guest list, groups and absences against the local DB", () => {
  let db: DbClient;
  let event: TestEvent;
  const tag = testTag();
  let created: number[] = [];

  const named = (base: string) => `${base} ${tag}`;
  const UNKNOWN_ID = 2_000_000_000;

  // Adds tagged guests and returns them in the order of `bases`.
  async function add(...bases: string[]): Promise<GuestDto[]> {
    const names = bases.map(named);
    const result = await addGuests(db, names);
    if (result.status !== "added") {
      throw new Error(`addGuests failed: ${JSON.stringify(result)}`);
    }
    created.push(...result.added.map((guest) => guest.id));
    return names.map((name) => {
      const guest = result.added.find((candidate) => candidate.displayName === name);
      if (!guest) {
        throw new Error(`missing ${name}`);
      }
      return guest;
    });
  }

  // The part of the list this run created (other guests may exist in a real local DB).
  async function ownList(): Promise<GuestListDto> {
    const list = await getGuestList(db);
    const ids = new Set(created);
    return {
      guests: list.guests.filter((guest) => ids.has(guest.id)),
      groups: list.groups.filter((group) => group.memberIds.some((id) => ids.has(id))),
    };
  }

  async function guestById(id: number): Promise<GuestDto | undefined> {
    return (await getGuestList(db)).guests.find((guest) => guest.id === id);
  }

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
  });

  afterEach(async () => {
    await deleteTestGuests(db, created);
    created = [];
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  describe("guest list (FR-001)", () => {
    it("turns 40 pasted lines into 40 guests that can each be renamed and deleted (US-01)", async () => {
      const lines = Array.from({ length: 40 }, (_, index) => named(`Gość ${index + 1}`));
      const parsed = parseGuestList(lines.join("\n"));
      expect(parsed.problems).toEqual([]);

      const result = await addGuests(db, parsed.names);
      expect(result.status).toBe("added");
      if (result.status !== "added") {
        return;
      }
      expect(result.added).toHaveLength(40);
      created.push(...result.added.map((guest) => guest.id));
      expect(new Set(result.added.map((guest) => guest.displayName))).toEqual(new Set(lines));

      for (const guest of result.added) {
        const renamed = await updateGuest(db, guest.id, { displayName: `${guest.displayName} x` });
        expect(renamed).toEqual({
          status: "updated",
          guest: { ...guest, displayName: `${guest.displayName} x` },
        });
      }
      for (const guest of result.added) {
        expect(await deleteGuest(db, guest.id)).toEqual({ status: "deleted" });
      }
      expect((await ownList()).guests).toEqual([]);
    });

    it("adds new guests present and without a group", async () => {
      const [ania] = await add("Ania");
      expect(ania).toEqual({ id: ania.id, displayName: named("Ania"), isAbsent: false, groupId: null });
    });

    it("rejects the whole batch when a name is already on the list (any letter case)", async () => {
      await add("Ania");
      const result = await addGuests(db, [named("Kuba"), named("ANIA")]);
      expect(result).toEqual({ status: "duplicates", names: [named("ANIA")] });
      expect((await ownList()).guests.map((guest) => guest.displayName)).toEqual([named("Ania")]);
      const all = await getGuestList(db);
      expect(all.guests.some((guest) => guest.displayName === named("Kuba"))).toBe(false);
    });

    it("rejects names repeated within the batch", async () => {
      const result = await addGuests(db, [named("Ola"), named("ola")]);
      expect(result).toEqual({ status: "duplicates", names: [named("ola")] });
      expect((await getGuestList(db)).guests.some((guest) => guest.displayName === named("Ola"))).toBe(false);
    });

    it("rejects a batch that would exceed the guest limit, adding nothing", async () => {
      const existing = (await getGuestList(db)).guests.length;
      const names = Array.from({ length: MAX_GUESTS - existing + 1 }, (_, index) => named(`T${index}`));
      expect(await addGuests(db, names)).toEqual({ status: "too-many", limit: MAX_GUESTS, existing });
      expect((await getGuestList(db)).guests).toHaveLength(existing);
    });

    it("renames with normalization and refuses duplicates or invalid names", async () => {
      const [ania, kuba] = await add("Ania", "Kuba");
      expect(await updateGuest(db, kuba.id, { displayName: named("ANIA") })).toEqual({ status: "duplicate" });
      expect(await updateGuest(db, kuba.id, { displayName: "  \t " })).toEqual({ status: "invalid", reason: "empty" });
      expect(await updateGuest(db, kuba.id, { displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1) })).toEqual({
        status: "invalid",
        reason: "too-long",
      });
      expect(await updateGuest(db, kuba.id, { displayName: `  Kuba \t  ${tag} M. ` })).toEqual({
        status: "updated",
        guest: { ...kuba, displayName: `Kuba ${tag} M.` },
      });
      // Changing only the letter case of one's own name is fine.
      expect(await updateGuest(db, ania.id, { displayName: named("ANIA") })).toEqual({
        status: "updated",
        guest: { ...ania, displayName: named("ANIA") },
      });
    });

    it("answers not-found for unknown guests", async () => {
      expect(await updateGuest(db, UNKNOWN_ID, { displayName: "Nikt" })).toEqual({ status: "not-found" });
      expect(await updateGuest(db, UNKNOWN_ID, { isAbsent: true })).toEqual({ status: "not-found" });
      expect(await updateGuest(db, UNKNOWN_ID, {})).toEqual({ status: "not-found" });
      expect(await deleteGuest(db, UNKNOWN_ID)).toEqual({ status: "not-found" });
    });

    it("lists guests in Polish alphabetical order", async () => {
      await add("Marek", "Żaneta", "Łucja", "Zenek", "Lena", "Ziemowit", "Lucjan");
      expect((await ownList()).guests.map((guest) => guest.displayName)).toEqual(
        ["Lena", "Lucjan", "Łucja", "Marek", "Zenek", "Ziemowit", "Żaneta"].map(named),
      );
    });
  });

  describe("absences (FR-003)", () => {
    it("marks a guest absent and present again without touching the group", async () => {
      const [ania, kuba] = await add("Ania", "Kuba");
      const group = await createGroup(db, [ania.id, kuba.id]);
      if (group.status !== "created") {
        throw new Error(JSON.stringify(group));
      }
      const absent = await updateGuest(db, ania.id, { isAbsent: true });
      expect(absent).toEqual({ status: "updated", guest: { ...ania, isAbsent: true, groupId: group.groupId } });
      expect((await guestById(ania.id))?.isAbsent).toBe(true);
      const present = await updateGuest(db, ania.id, { isAbsent: false });
      expect(present).toEqual({ status: "updated", guest: { ...ania, isAbsent: false, groupId: group.groupId } });
    });
  });

  describe("groups (FR-002)", () => {
    it("creates a pair and a group of five", async () => {
      const [a, b, c, d, e, f, g] = await add("A", "B", "C", "D", "E", "F", "G");
      const pair = await createGroup(db, [b.id, a.id]);
      const five = await createGroup(db, [c.id, d.id, e.id, f.id, g.id]);
      expect(pair.status).toBe("created");
      expect(five.status).toBe("created");
      if (pair.status !== "created" || five.status !== "created") {
        return;
      }
      const list = await ownList();
      expect(list.groups).toEqual([
        { id: pair.groupId, memberIds: [a.id, b.id] },
        { id: five.groupId, memberIds: [c.id, d.id, e.id, f.id, g.id] },
      ]);
      expect(list.guests.map((guest) => guest.groupId)).toEqual([
        pair.groupId,
        pair.groupId,
        five.groupId,
        five.groupId,
        five.groupId,
        five.groupId,
        five.groupId,
      ]);
    });

    it("refuses groups smaller than 2 or larger than 5", async () => {
      const guests = await add("A", "B", "C", "D", "E", "F");
      const ids = guests.map((guest) => guest.id);
      expect(await createGroup(db, [])).toEqual({ status: "invalid-size" });
      expect(await createGroup(db, [ids[0]])).toEqual({ status: "invalid-size" });
      expect(await createGroup(db, ids)).toEqual({ status: "invalid-size" });
      // A repeated id counts once.
      expect(await createGroup(db, [ids[0], ids[0]])).toEqual({ status: "invalid-size" });
      expect((await ownList()).groups).toEqual([]);
      const withRepeat = await createGroup(db, [ids[0], ids[0], ids[1]]);
      expect(withRepeat.status).toBe("created");
      expect((await ownList()).groups[0].memberIds).toEqual([ids[0], ids[1]]);
    });

    it("refuses unknown guests", async () => {
      const [a] = await add("A");
      expect(await createGroup(db, [a.id, UNKNOWN_ID])).toEqual({ status: "not-found" });
      expect((await guestById(a.id))?.groupId).toBeNull();
    });

    it("refuses a guest who is already in a group and leaves no partial group", async () => {
      const [a, b, c, d] = await add("A", "B", "C", "D");
      await createGroup(db, [a.id, b.id]);
      expect(await createGroup(db, [c.id, d.id, b.id])).toEqual({ status: "already-grouped" });
      const list = await ownList();
      expect(list.groups).toHaveLength(1);
      expect(list.guests.filter((guest) => guest.id === c.id || guest.id === d.id).map((g) => g.groupId)).toEqual([
        null,
        null,
      ]);
    });

    it("lets only one of two concurrent groups take the same guest", async () => {
      const [a, b, c] = await add("A", "B", "C");
      const outcomes = await Promise.all([createGroup(db, [a.id, b.id]), createGroup(db, [b.id, c.id])]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["already-grouped", "created"]);
      expect((await ownList()).groups).toHaveLength(1);
    });

    it("dissolves a group and keeps its members on the list", async () => {
      const [a, b, c] = await add("A", "B", "C");
      const group = await createGroup(db, [a.id, b.id, c.id]);
      if (group.status !== "created") {
        throw new Error(JSON.stringify(group));
      }
      expect(await dissolveGroup(db, group.groupId)).toEqual({ status: "dissolved" });
      const list = await ownList();
      expect(list.groups).toEqual([]);
      expect(list.guests.map((guest) => guest.groupId)).toEqual([null, null, null]);
      expect(await dissolveGroup(db, group.groupId)).toEqual({ status: "not-found" });
    });

    it("dissolves a pair when one member is deleted", async () => {
      const [a, b] = await add("A", "B");
      await createGroup(db, [a.id, b.id]);
      expect(await deleteGuest(db, b.id)).toEqual({ status: "deleted" });
      const list = await ownList();
      expect(list.groups).toEqual([]);
      expect(list.guests).toEqual([{ ...a, groupId: null }]);
    });

    it("keeps a triple as a pair when one member is deleted", async () => {
      const [a, b, c] = await add("A", "B", "C");
      const group = await createGroup(db, [a.id, b.id, c.id]);
      if (group.status !== "created") {
        throw new Error(JSON.stringify(group));
      }
      await deleteGuest(db, a.id);
      expect((await ownList()).groups).toEqual([{ id: group.groupId, memberIds: [b.id, c.id] }]);
    });

    it("lets a dissolved group's members form a new group", async () => {
      const [a, b] = await add("A", "B");
      const first = await createGroup(db, [a.id, b.id]);
      if (first.status !== "created") {
        throw new Error(JSON.stringify(first));
      }
      await dissolveGroup(db, first.groupId);
      expect((await createGroup(db, [a.id, b.id])).status).toBe("created");
    });
  });
});
