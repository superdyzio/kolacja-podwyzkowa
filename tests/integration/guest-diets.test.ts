import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestState } from "@/lib/guest-links/service";
import { addGuests, getGuestList, updateGuest } from "@/lib/guests";
import { getOrderBoard, getRestaurantView } from "@/lib/orders";
import { resetEvent } from "@/lib/reset/service";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import { getTvScreen } from "@/lib/tv-spotlight/service";
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

// guest-import-diets (S-23; FR-035, FR-036, NFR-021) against the local DB: the diet columns and their CHECKs, the
// all-or-nothing add with diets, the diet edit (another event's id = unknown), the diets at the published seat on the
// order board and the tablet (whose polling token covers them), and the boundary — the guest's state (their own and a
// tablemate's) and the TV never contain a diet. Two events of their own; deleted afterwards.
describe.skipIf(!hasLocalDb)("guest diets and the import against the local DB", () => {
  let db: DbClient;
  let eventA: TestEvent;
  let eventB: TestEvent;
  let seating: TestSeating;
  const tag = testTag();
  const NOTE = `alergia na seler ${tag}`;

  beforeAll(async () => {
    db = localDb();
    eventA = await createTestEvent(db, "diety A");
    eventB = await createTestEvent(db, "diety B");
    seating = await createTestSeating(db, eventA.id, tag, [{ seatCount: 4, shape: "round" }], 3);
  });

  afterAll(async () => {
    await releaseTestEvent(db, eventA);
    await releaseTestEvent(db, eventB);
  });

  it("gives existing guests no diet and refuses unknown tags and long notes in the DB", async () => {
    const list = await getGuestList(db, eventA.id);
    expect(list.guests.every((guest) => guest.diets.length === 0 && guest.dietNote === null)).toBe(true);
    const unknown = await db
      .from("guest")
      .insert({ event_id: eventA.id, display_name: `Keto ${tag}`, diets: ["keto"] });
    expect(unknown.error?.message).toMatch(/guest_diets_known/);
    const long = await db
      .from("guest")
      .insert({ event_id: eventA.id, display_name: `Długa ${tag}`, diet_note: "x".repeat(121) });
    expect(long.error?.message).toMatch(/guest_diet_note_length/);
    const empty = await db.from("guest").insert({ event_id: eventA.id, display_name: `Pusta ${tag}`, diet_note: "" });
    expect(empty.error?.message).toMatch(/guest_diet_note_length/);
  });

  it("adds guests with diets all-or-nothing", async () => {
    const before = (await getGuestList(db, eventA.id)).guests.length;
    const refused = await addGuests(db, eventA.id, [
      { name: `Nowa ${tag}`, diets: ["vegan"] },
      { name: `G1 ${tag}`, diets: [] },
    ]);
    expect(refused.status).toBe("duplicates");
    expect((await getGuestList(db, eventA.id)).guests).toHaveLength(before);

    const added = await addGuests(db, eventA.id, [
      { name: `Wega ${tag}`, diets: ["no-pork", "vegan", "vegan"], dietNote: "  bez  cebuli " },
      `Zwykły ${tag}`,
    ]);
    expect(added.status).toBe("added");
    const list = await getGuestList(db, eventA.id);
    const wega = list.guests.find((guest) => guest.displayName === `Wega ${tag}`);
    expect(wega).toMatchObject({ diets: ["vegan", "no-pork"], dietNote: "bez cebuli" });
    expect(list.guests.find((guest) => guest.displayName === `Zwykły ${tag}`)).toMatchObject({
      diets: [],
      dietNote: null,
    });
  });

  it("edits a diet; another event's id is unknown; a long note is refused", async () => {
    const [g1] = seating.guestIds;
    const updated = await updateGuest(db, eventA.id, g1, { diets: ["nut-allergy", "vegetarian"], dietNote: NOTE });
    expect(updated).toMatchObject({
      status: "updated",
      guest: { diets: ["vegetarian", "nut-allergy"], dietNote: NOTE },
    });
    expect(await updateGuest(db, eventB.id, g1, { diets: ["vegan"] })).toEqual({ status: "not-found" });
    expect(await updateGuest(db, eventA.id, g1, { dietNote: "x".repeat(121) })).toEqual({
      status: "invalid",
      reason: "note-too-long",
    });
    const cleared = await updateGuest(db, eventA.id, seating.guestIds[2], { diets: [], dietNote: "   " });
    expect(cleared).toMatchObject({ status: "updated", guest: { diets: [], dietNote: null } });
  });

  it("shows the diet at the published seat on the board and the tablet, never to guests or the TV", async () => {
    const [g1, g2] = seating.guestIds;
    const [round] = seating.tableIds;
    expect((await seatGuest(db, eventA.id, g1, round, 1)).status).toBe("seated");
    expect((await seatGuest(db, eventA.id, g2, round, 2)).status).toBe("seated");
    expect((await publishSeating(db, eventA.id)).status).toBe("published");

    const view = await getRestaurantView(db, eventA.id);
    expect(view.diets.tables).toEqual([
      {
        name: `T1 ${tag}`,
        room: `Sala ${tag}`,
        seats: [{ seat: 1, guestName: `G1 ${tag}`, diets: ["vegetarian", "nut-allergy"], note: NOTE }],
      },
    ]);
    expect(view.diets.unplaced.map((entry) => entry.guestName)).toEqual([`Wega ${tag}`]);
    expect(view.diets.counts).toEqual([
      { tag: "vegetarian", count: 1 },
      { tag: "vegan", count: 1 },
      { tag: "nut-allergy", count: 1 },
      { tag: "no-pork", count: 1 },
    ]);
    const board = await getOrderBoard(db, eventA.id);
    expect(board.diets).toEqual(view.diets);

    // A diet-only change is a new tablet version (the 204 path must notice it).
    await updateGuest(db, eventA.id, g2, { diets: ["halal"] });
    const after = await getRestaurantView(db, eventA.id);
    expect(after.version).not.toBe(view.version);
    expect(after.diets.tables[0]?.seats.map((seat) => seat.guestName)).toEqual([`G1 ${tag}`, `G2 ${tag}`]);

    // The boundary: the guest's own state, a tablemate's (tablemates, the drawing) and the TV carry no diet.
    for (const [id, name] of [
      [g1, `G1 ${tag}`],
      [g2, `G2 ${tag}`],
    ] as const) {
      const state = JSON.stringify(await getGuestState(db, eventA.id, { id, displayName: name }));
      expect(state).toContain(`T1 ${tag}`);
      expect(state).not.toMatch(/vegetarian|nut-allergy|halal|diet/);
      expect(state).not.toContain(NOTE);
    }
    const tv = JSON.stringify(await getTvScreen(db, eventA.id));
    expect(tv).toContain(`G1 ${tag}`);
    expect(tv).not.toMatch(/vegetarian|nut-allergy|halal|diet/);
    expect(tv).not.toContain(NOTE);
  });

  it("keeps an absent guest out of the counts", async () => {
    const [g1] = seating.guestIds;
    await updateGuest(db, eventA.id, g1, { isAbsent: true });
    const view = await getRestaurantView(db, eventA.id);
    expect(view.diets.counts.find((count) => count.tag === "nut-allergy")).toBeUndefined();
    expect(view.diets.tables[0]?.seats.map((seat) => seat.guestName)).toEqual([`G2 ${tag}`]);
    await updateGuest(db, eventA.id, g1, { isAbsent: false });
  });

  it("loses the diets with the guests in the reset", async () => {
    const result = await resetEvent(db, eventA.id, ["guests"]);
    expect(result.status).toBe("reset");
    const { count } = await db
      .from("guest")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventA.id)
      .or("diet_note.not.is.null,diets.neq.{}");
    expect(count).toBe(0);
    expect((await getRestaurantView(db, eventA.id)).diets.guests).toBe(0);
  });
});
