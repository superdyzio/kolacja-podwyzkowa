import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setEventBrandName } from "@/lib/branding/service";
import { EMPTY_DIET_BOARD } from "@/lib/diets/board";
import { updateGuest } from "@/lib/guests";
import { boardEntries, getRoomPrintSource, staffList } from "@/lib/prints";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import { createVenueTemplate } from "@/lib/templates/service";
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

// room-prints (S-24; FR-038) against the local DB: the loader every print page uses reads the LATEST PUBLISHED
// seating (nothing before the first publish), says whether the working arrangement still matches it, reads the diets
// only when asked (the staff list), never another event's rows and never a venue template. Two events of their own;
// deleted afterwards (the template goes with its restaurant's cleanup: templates are event rows).
describe.skipIf(!hasLocalDb)("room prints against the local DB", () => {
  let db: DbClient;
  let eventA: TestEvent;
  let eventB: TestEvent;
  let seating: TestSeating;
  let seatingB: TestSeating;
  let templateId: number | null = null;
  const tag = testTag();
  const NOTE = `bez selera ${tag}`;

  beforeAll(async () => {
    db = localDb();
    eventA = await createTestEvent(db, "wydruki A");
    eventB = await createTestEvent(db, "wydruki B");
    seating = await createTestSeating(db, eventA.id, tag, [{ seatCount: 4, shape: "round" }], 3);
    seatingB = await createTestSeating(db, eventB.id, testTag(), [{ seatCount: 4, shape: "round" }], 2);
  });

  afterAll(async () => {
    if (templateId !== null) {
      await db.from("event").delete().eq("id", templateId);
    }
    await releaseTestEvent(db, eventA);
    await releaseTestEvent(db, eventB);
  });

  it("has nothing to print before the first publish", async () => {
    const source = await getRoomPrintSource(db, eventA.id, { diets: true });
    expect(source).not.toBeNull();
    expect(source?.event.name).toBe(eventA.name);
    expect(source?.event.purgedAt).toBeNull();
    expect(source?.published).toBeNull();
    expect(source?.diets).toMatchObject({ tables: [], counts: [] });
    expect(source?.branding?.client.name).toBeNull();
  });

  it("prints the published seating with the diets only when asked", async () => {
    const [ania, bartek, celina] = seating.guestIds;
    const table = seating.tableIds[0];
    expect(await seatGuest(db, eventA.id, ania, table, 1)).toMatchObject({ status: "seated" });
    expect(await seatGuest(db, eventA.id, bartek, table, 2)).toMatchObject({ status: "seated" });
    expect(await updateGuest(db, eventA.id, ania, { diets: ["nut-allergy"], dietNote: NOTE })).toMatchObject({
      status: "updated",
    });
    // A diet of a guest without a seat: the staff list's „with a diet but no seat”.
    expect(await updateGuest(db, eventA.id, celina, { diets: ["vegan"] })).toMatchObject({ status: "updated" });
    expect(await publishSeating(db, eventA.id)).toMatchObject({ status: "published" });
    await setEventBrandName(db, eventA.id, `Acme ${tag}`);

    const plain = await getRoomPrintSource(db, eventA.id, { diets: false });
    expect(plain?.upToDate).toBe(true);
    expect(plain?.diets).toBeNull();
    expect(plain?.branding?.client.name).toBe(`Acme ${tag}`);
    expect(plain?.published?.tables.map((t) => t.name)).toEqual(seating.tableNames);
    expect(boardEntries(plain?.published ?? null).map((entry) => entry.name)).toEqual(seating.guestNames.slice(0, 2));
    expect(JSON.stringify(plain)).not.toContain(NOTE);

    const withDiets = await getRoomPrintSource(db, eventA.id, { diets: true });
    expect(withDiets?.diets).not.toBeNull();
    const list = staffList(withDiets?.published ?? null, withDiets?.diets ?? EMPTY_DIET_BOARD);
    expect(list.tables).toHaveLength(1);
    expect(list.tables[0].seats).toEqual([
      { seat: 1, name: seating.guestNames[0], diets: ["nut-allergy"], note: NOTE, units: 1 },
      { seat: 2, name: seating.guestNames[1], diets: [], note: null, units: 1 },
    ]);
    expect(list.unplaced).toEqual([{ guestName: seating.guestNames[2], diets: ["vegan"], note: null }]);
    expect(list.withDiets).toBe(2);
  });

  it("keeps printing the published version while the working arrangement differs", async () => {
    const [ania] = seating.guestIds;
    expect(await updateGuest(db, eventA.id, ania, { isAbsent: true })).toMatchObject({ status: "updated" });
    const source = await getRoomPrintSource(db, eventA.id, { diets: true });
    expect(source?.upToDate).toBe(false);
    // The name stays as published (as on the TV), the diet goes: the kitchen cooks for who is here.
    const list = staffList(source?.published ?? null, source?.diets ?? EMPTY_DIET_BOARD);
    expect(list.tables[0].seats[0]).toMatchObject({ name: seating.guestNames[0], diets: [], note: null });
    expect(await updateGuest(db, eventA.id, ania, { isAbsent: false })).toMatchObject({ status: "updated" });
    expect((await getRoomPrintSource(db, eventA.id, { diets: false }))?.upToDate).toBe(true);
  });

  it("never reads another event's rows", async () => {
    expect(await seatGuest(db, eventB.id, seatingB.guestIds[0], seatingB.tableIds[0], 1)).toMatchObject({
      status: "seated",
    });
    expect(await publishSeating(db, eventB.id)).toMatchObject({ status: "published" });
    const a = await getRoomPrintSource(db, eventA.id, { diets: true });
    const b = await getRoomPrintSource(db, eventB.id, { diets: true });
    const aText = JSON.stringify(a);
    const bText = JSON.stringify(b);
    for (const name of seatingB.guestNames) {
      expect(aText).not.toContain(name);
    }
    for (const name of seating.guestNames) {
      expect(bText).not.toContain(name);
    }
    expect(bText).not.toContain(NOTE);
    expect(b?.event.name).toBe(eventB.name);
  });

  it("answers null for an unknown id and a venue template", async () => {
    expect(await getRoomPrintSource(db, 2_000_000_000, { diets: true })).toBeNull();
    const created = await createVenueTemplate(db, eventA.restaurantId, `Szablon ${tag}`, eventA.id);
    expect(created.status).toBe("created");
    if (created.status === "created") {
      templateId = created.template.id;
      expect(await getRoomPrintSource(db, templateId, { diets: true })).toBeNull();
    }
  });
});
