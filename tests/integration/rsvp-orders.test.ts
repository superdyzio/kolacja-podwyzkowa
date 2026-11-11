import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addGuests, deleteGuest } from "@/lib/guests";
import { addMenuItem, setEventMenu, updateMenuItem } from "@/lib/menu/service";
import { addOrderItem } from "@/lib/orders";
import { moveRsvpToOrders, previewRsvpOrders } from "@/lib/rsvp/orders-service";
import { saveRsvpByOrganizer, updateRsvpSettings } from "@/lib/rsvp/service";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// „Przenieś wybory do zamówień” (the PR #4 review's RSVP extras): one order line per coming guest with a dish, like
// POST /orders (menu gate, the venue's price, course and catalog item), skipping who already has the dish — idempotent,
// all or nothing; another event is never touched.

interface LineRow {
  name: string;
  quantity: number;
  unit_price_grosze: number;
  course: string | null;
  menu_item_id: number | null;
  guest_id: number | null;
  table_id: number | null;
  note: string | null;
}

describe.skipIf(!hasLocalDb)("RSVP choices to orders (integration)", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  const guest: Record<string, number> = {};
  const item: Record<string, number> = {};
  let foreignGuest = 0;

  async function lines(eventId: number): Promise<LineRow[]> {
    const { data, error } = await db
      .from("order_item")
      .select("name, quantity, unit_price_grosze, course, menu_item_id, guest_id, table_id, note")
      .eq("event_id", eventId)
      .order("id");
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "rsvp orders A");
    b = await createTestEvent(db, "rsvp orders B");
    const added = await addGuests(db, a.id, [
      "Ania Zamówienie",
      "Bartek Zamówienie",
      "Celina Zamówienie",
      "Darek Zamówienie",
      "Ewa Zamówienie",
      "Franek Zamówienie",
    ]);
    if (added.status !== "added") {
      throw new Error(added.status);
    }
    for (const row of added.added) {
      guest[row.displayName.split(" ")[0]] = row.id;
    }
    const other = await addGuests(db, b.id, ["Obcy Zamówienie"]);
    if (other.status !== "added") {
      throw new Error(other.status);
    }
    foreignGuest = other.added[0].id;
    for (const [key, event, name, course, price] of [
      ["schab", a, "Schab Zamówienie", "main", 5_900],
      ["tatar", a, "Tatar Zamówienie", "starter", 3_200],
      ["foreign", b, "Schab Zamówienie", "main", 9_900],
    ] as const) {
      const result = await addMenuItem(db, event.restaurantId, { name, course, priceGrosze: price });
      if (result.status !== "added") {
        throw new Error(result.status);
      }
      item[key] = result.id;
    }
    const now = new Date();
    const options = ["Schab Zamówienie", "Tatar Zamówienie"];
    expect((await updateRsvpSettings(db, a.id, { options }, now)).status).toBe("updated");
    expect((await updateRsvpSettings(db, b.id, { options: ["Schab Zamówienie"] }, now)).status).toBe("updated");
    for (const [name, attending, dish] of [
      ["Ania", true, "schab zamówienie"],
      ["Bartek", true, "Tatar Zamówienie"],
      ["Celina", true, null],
      ["Darek", false, null],
      ["Franek", true, "Schab Zamówienie"],
    ] as const) {
      expect((await saveRsvpByOrganizer(db, a.id, guest[name], attending, dish)).status).toBe("saved");
    }
    expect((await saveRsvpByOrganizer(db, b.id, foreignGuest, true, "Schab Zamówienie")).status).toBe("saved");
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("previews, then adds one line per coming guest with a dish (menu spelling, course, item, the venue's price)", async () => {
    // Bartek already has his dish; a line of the schab at a table gives the event's price of the schab.
    expect(
      (
        await addOrderItem(db, a.id, {
          name: "Tatar Zamówienie",
          note: null,
          quantity: 1,
          unitPriceGrosze: 3_200,
          assignment: { guestId: guest.Bartek },
        })
      ).status,
    ).toBe("added");
    expect(
      (
        await addOrderItem(db, a.id, {
          name: "SCHAB ZAMÓWIENIE",
          note: null,
          quantity: 2,
          unitPriceGrosze: 7_000,
          assignment: null,
        })
      ).status,
    ).toBe("added");

    expect(await previewRsvpOrders(db, a.id)).toEqual({ added: 2, skipped: 1, notOnMenu: [] });
    expect(await lines(a.id)).toHaveLength(2);

    const moved = await moveRsvpToOrders(db, a.id);
    expect(moved).toEqual({ status: "moved", summary: { added: 2, skipped: 1, notOnMenu: [] } });
    const after = await lines(a.id);
    expect(after.slice(2)).toEqual([
      {
        name: "Schab Zamówienie",
        quantity: 1,
        unit_price_grosze: 7_000,
        course: "main",
        menu_item_id: item.schab,
        guest_id: guest.Ania,
        table_id: null,
        note: null,
      },
      {
        name: "Schab Zamówienie",
        quantity: 1,
        unit_price_grosze: 7_000,
        course: "main",
        menu_item_id: item.schab,
        guest_id: guest.Franek,
        table_id: null,
        note: null,
      },
    ]);
  });

  it("is idempotent: a second run adds nothing", async () => {
    expect(await previewRsvpOrders(db, a.id)).toEqual({ added: 0, skipped: 3, notOnMenu: [] });
    expect(await moveRsvpToOrders(db, a.id)).toEqual({
      status: "moved",
      summary: { added: 0, skipped: 3, notOnMenu: [] },
    });
    expect(await lines(a.id)).toHaveLength(4);
  });

  it("stays idempotent after the venue renames the catalog item: a line of the same item counts (review2-fixes)", async () => {
    // Ania's and Franek's lines say „Schab Zamówienie” (item schab); their RSVP dish now reads the new name.
    expect((await updateMenuItem(db, a.restaurantId, item.schab, { name: "Kotlet Zamówienie" })).status).toBe(
      "updated",
    );
    expect(await previewRsvpOrders(db, a.id)).toEqual({ added: 0, skipped: 3, notOnMenu: [] });
    expect(await moveRsvpToOrders(db, a.id)).toEqual({
      status: "moved",
      summary: { added: 0, skipped: 3, notOnMenu: [] },
    });
    const after = await lines(a.id);
    expect(after).toHaveLength(4);
    expect(after.filter((line) => line.menu_item_id === item.schab).map((line) => line.name)).toEqual([
      "Schab Zamówienie",
      "Schab Zamówienie",
    ]);
    expect((await updateMenuItem(db, a.restaurantId, item.schab, { name: "Schab Zamówienie" })).status).toBe("updated");
  });

  it("refuses the whole move while a chosen dish is not on the active menu, then adds it when it is", async () => {
    expect((await saveRsvpByOrganizer(db, a.id, guest.Ewa, true, "Tatar Zamówienie")).status).toBe("saved");
    expect((await saveRsvpByOrganizer(db, a.id, guest.Celina, true, "Schab Zamówienie")).status).toBe("saved");
    // The venue reduces the event's menu to the tatar: Celina's schab is off the menu.
    expect((await setEventMenu(db, a.id, "reduced", [item.tatar])).status).toBe("updated");
    expect(await previewRsvpOrders(db, a.id)).toEqual({ added: 1, skipped: 3, notOnMenu: ["Schab Zamówienie"] });
    expect(await moveRsvpToOrders(db, a.id)).toEqual({ status: "not-on-menu", names: ["Schab Zamówienie"] });
    expect(await lines(a.id)).toHaveLength(4);

    expect((await setEventMenu(db, a.id, "full", [])).status).toBe("updated");
    expect(await moveRsvpToOrders(db, a.id)).toEqual({
      status: "moved",
      summary: { added: 2, skipped: 3, notOnMenu: [] },
    });
    const after = await lines(a.id);
    expect(after.slice(4).map((line) => [line.guest_id, line.name, line.unit_price_grosze])).toEqual([
      [guest.Celina, "Schab Zamówienie", 7_000],
      [guest.Ewa, "Tatar Zamówienie", 3_200],
    ]);
  });

  it("without an active menu makes free-text lines (no course or item), like POST /orders", async () => {
    expect((await deleteGuest(db, a.id, guest.Ania)).status).toBe("deleted");
    const added = await addGuests(db, a.id, ["Gosia Zamówienie"]);
    if (added.status !== "added") {
      throw new Error(added.status);
    }
    expect((await saveRsvpByOrganizer(db, a.id, added.added[0].id, true, "Tatar Zamówienie")).status).toBe("saved");
    expect((await setEventMenu(db, a.id, "off", [])).status).toBe("updated");
    expect(await moveRsvpToOrders(db, a.id)).toMatchObject({ status: "moved", summary: { added: 1 } });
    const last = (await lines(a.id)).at(-1);
    expect(last).toMatchObject({
      name: "Tatar Zamówienie",
      course: null,
      menu_item_id: null,
      unit_price_grosze: 3_200,
      guest_id: added.added[0].id,
    });
  });

  it("never touches another event", async () => {
    expect(await lines(b.id)).toEqual([]);
    expect(await previewRsvpOrders(db, b.id)).toEqual({ added: 1, skipped: 0, notOnMenu: [] });
    expect(await moveRsvpToOrders(db, b.id)).toMatchObject({ status: "moved", summary: { added: 1 } });
    const foreign = await lines(b.id);
    expect(foreign).toHaveLength(1);
    expect(foreign[0]).toMatchObject({ guest_id: foreignGuest, unit_price_grosze: 9_900, menu_item_id: item.foreign });
    // A's lines are unchanged by B's move.
    expect((await previewRsvpOrders(db, a.id)).added).toBe(0);
  });
});
