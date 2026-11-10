import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addGuests } from "@/lib/guests";
import { addMenuItem } from "@/lib/menu/service";
import { getRestaurantView } from "@/lib/orders";
import { saveRsvpByOrganizer, updateRsvpSettings } from "@/lib/rsvp/service";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// The kitchen tablet's RSVP summary (the PR #4 review's decision; guest-rsvp-menu extras): RestaurantViewDto.rsvp is
// null until the event has dish options, then the coming guests' dish counts by course — no names, ids or prices —
// inside the tablet's polling token; another event's answers never count.

describe.skipIf(!hasLocalDb)("RSVP dish counts on the kitchen tablet (integration)", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  const guest: Record<string, number> = {};
  let foreignGuest = 0;

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "rsvp kitchen A");
    b = await createTestEvent(db, "rsvp kitchen B");
    const added = await addGuests(db, a.id, ["Ania Kuchnia", "Bartek Kuchnia", "Celina Kuchnia", "Darek Kuchnia"]);
    if (added.status !== "added") {
      throw new Error(added.status);
    }
    for (const row of added.added) {
      guest[row.displayName.split(" ")[0]] = row.id;
    }
    const other = await addGuests(db, b.id, ["Obcy Kuchnia"]);
    if (other.status !== "added") {
      throw new Error(other.status);
    }
    foreignGuest = other.added[0].id;
    for (const [event, name, course] of [
      [a, "Schab Kuchnia", "main"],
      [a, "Tatar Kuchnia", "starter"],
      [b, "Schab Kuchnia", "main"],
    ] as const) {
      const result = await addMenuItem(db, event.restaurantId, { name, course, priceGrosze: 5_900 });
      if (result.status !== "added") {
        throw new Error(result.status);
      }
    }
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("is null while the event has no dish options, even with answers", async () => {
    expect((await saveRsvpByOrganizer(db, a.id, guest.Ania, true, null)).status).toBe("saved");
    const view = await getRestaurantView(db, a.id);
    expect(view.rsvp).toBeNull();
  });

  it("counts the coming guests' dishes by course, without names, and changes the token with an answer", async () => {
    const now = new Date();
    expect((await updateRsvpSettings(db, a.id, { options: ["Schab Kuchnia", "Tatar Kuchnia"] }, now)).status).toBe(
      "updated",
    );
    const before = await getRestaurantView(db, a.id);
    expect(before.rsvp).toEqual({ coming: 1, noDish: 1, dishes: [] });

    expect((await saveRsvpByOrganizer(db, a.id, guest.Ania, true, "schab kuchnia")).status).toBe("saved");
    expect((await saveRsvpByOrganizer(db, a.id, guest.Bartek, true, "Tatar Kuchnia")).status).toBe("saved");
    expect((await saveRsvpByOrganizer(db, a.id, guest.Celina, true, "Schab Kuchnia")).status).toBe("saved");
    // Not coming: never counted, whatever was chosen before.
    expect((await saveRsvpByOrganizer(db, a.id, guest.Darek, false, null)).status).toBe("saved");
    // Another event's guest with the same dish name never counts here.
    expect((await updateRsvpSettings(db, b.id, { options: ["Schab Kuchnia"] }, now)).status).toBe("updated");
    expect((await saveRsvpByOrganizer(db, b.id, foreignGuest, true, "Schab Kuchnia")).status).toBe("saved");

    const view = await getRestaurantView(db, a.id);
    expect(view.rsvp).toEqual({
      coming: 3,
      noDish: 0,
      dishes: [
        { course: "starter", name: "Tatar Kuchnia", count: 1 },
        { course: "main", name: "Schab Kuchnia", count: 2 },
      ],
    });
    expect(view.version).not.toBe(before.version);
    const json = JSON.stringify(view.rsvp);
    expect(json).not.toMatch(/Ania|Bartek|Celina|Darek|"id"|price|Grosze/);
    expect((await getRestaurantView(db, a.id)).version).toBe(view.version);

    // A changed answer is a new version (the tablet's poll gets a 200).
    expect((await saveRsvpByOrganizer(db, a.id, guest.Celina, true, "Tatar Kuchnia")).status).toBe("saved");
    const changed = await getRestaurantView(db, a.id);
    expect(changed.rsvp?.dishes).toEqual([
      { course: "starter", name: "Tatar Kuchnia", count: 2 },
      { course: "main", name: "Schab Kuchnia", count: 1 },
    ]);
    expect(changed.version).not.toBe(view.version);
  });

  it("is null again once the options are removed", async () => {
    expect((await updateRsvpSettings(db, a.id, { options: [] }, new Date())).status).toBe("updated");
    expect((await getRestaurantView(db, a.id)).rsvp).toBeNull();
  });
});
