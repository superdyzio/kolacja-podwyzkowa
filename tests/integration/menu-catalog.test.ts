import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMenuItem,
  deleteMenuItem,
  getAvailableMenu,
  getEventMenu,
  getMenuCatalog,
  setEventMenu,
  updateMenuItem,
} from "@/lib/menu/service";
import { addOrderItem, getOrderBoard, getRestaurantView } from "@/lib/orders/service";
import { priceForNewLine } from "@/lib/orders/prices-service";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// menu-catalog-courses (S-16): the catalog is per restaurant, an event offers none / all / some of it, an item of
// another restaurant never reaches an event, and a catalog change never moves the bill of lines already ordered.

describe.skipIf(!hasLocalDb)("menu catalog (integration)", () => {
  let db: DbClient;
  let a: TestEvent;
  let b: TestEvent;
  const ids: Record<string, number> = {};

  async function add(
    event: TestEvent,
    name: string,
    course: "starter" | "soup" | "main" | "dessert" | "drinks",
    price: number,
  ) {
    const result = await addMenuItem(db, event.restaurantId, { name, course, priceGrosze: price });
    if (result.status !== "added") {
      throw new Error(`menu item ${name}: ${result.status}`);
    }
    return result.id;
  }

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "menu A");
    b = await createTestEvent(db, "menu B");
    ids.rosol = await add(a, "Rosół", "soup", 1_800);
    ids.tatar = await add(a, "Tatar", "starter", 3_200);
    ids.sernik = await add(a, "Sernik", "dessert", 1_500);
    ids.woda = await add(a, "Woda", "drinks", 900);
    ids.foreign = await add(b, "Pierogi", "main", 2_900);
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("keeps one catalog per restaurant, by course then name, names unique in any letter case", async () => {
    const catalog = await getMenuCatalog(db, a.restaurantId);
    expect(catalog.items.map((item) => item.name)).toEqual(["Tatar", "Rosół", "Sernik", "Woda"]);
    expect((await addMenuItem(db, a.restaurantId, { name: "rosół", course: "main", priceGrosze: 1 })).status).toBe(
      "duplicate",
    );
    // Another restaurant's item is unknown here.
    expect((await updateMenuItem(db, a.restaurantId, ids.foreign, { priceGrosze: 1 })).status).toBe("not-found");
    expect((await deleteMenuItem(db, a.restaurantId, ids.foreign)).status).toBe("not-found");
    expect((await getMenuCatalog(db, b.restaurantId)).items.map((item) => item.name)).toEqual(["Pierogi"]);
  });

  it("offers the whole catalog (full, the default of a new event), a subset (reduced) or nothing (off)", async () => {
    expect((await getAvailableMenu(db, a.id)).map((item) => item.name)).toEqual(["Tatar", "Rosół", "Sernik", "Woda"]);
    expect((await setEventMenu(db, a.id, "reduced", [ids.rosol, ids.woda])).status).toBe("updated");
    expect((await getAvailableMenu(db, a.id)).map((item) => item.name)).toEqual(["Rosół", "Woda"]);
    const menu = await getEventMenu(db, a.restaurantId, a.id);
    expect(menu?.mode).toBe("reduced");
    expect(menu?.items.filter((item) => item.available).map((item) => item.id)).toEqual([ids.rosol, ids.woda]);
    // Another restaurant's view of the event: unknown.
    expect(await getEventMenu(db, b.restaurantId, a.id)).toBeNull();
    expect((await setEventMenu(db, a.id, "off", [])).status).toBe("updated");
    expect(await getAvailableMenu(db, a.id)).toEqual([]);
    expect((await setEventMenu(db, a.id, "reduced", [ids.rosol, ids.woda])).status).toBe("updated");
  });

  it("refuses an item of another restaurant and changes nothing", async () => {
    expect((await setEventMenu(db, a.id, "reduced", [ids.tatar, ids.foreign])).status).toBe("not-found");
    expect((await getAvailableMenu(db, a.id)).map((item) => item.name)).toEqual(["Rosół", "Woda"]);
    // The composite key refuses it even past the function.
    const direct = await db
      .from("event_menu_item")
      .insert({ event_id: a.id, restaurant_id: a.restaurantId, menu_item_id: ids.foreign });
    expect(direct.error).not.toBeNull();
  });

  it("snapshots the price and course on the line: a catalog change never moves the bill", async () => {
    const price = await priceForNewLine(db, a.id, "dish", "Rosół", 1_800);
    expect(price).toBe(1_800);
    const added = await addOrderItem(db, a.id, {
      name: "Rosół",
      note: null,
      quantity: 2,
      unitPriceGrosze: price,
      assignment: null,
      course: "soup",
      menuItemId: ids.rosol,
    });
    expect(added.status).toBe("added");
    expect((await updateMenuItem(db, a.restaurantId, ids.rosol, { priceGrosze: 2_500, course: "main" })).status).toBe(
      "updated",
    );
    const board = await getOrderBoard(db, a.id);
    expect(board.items.map((item) => [item.name, item.course, item.unitPriceGrosze])).toEqual([
      ["Rosół", "soup", 1_800],
    ]);
    // The event's price of the name wins over the new catalog price for the next line too.
    expect(board.menu.active).toBe(true);
    expect(board.menu.items).toEqual([
      { name: "Rosół", course: "main", priceGrosze: 1_800 },
      { name: "Woda", course: "drinks", priceGrosze: 900 },
    ]);
    expect(board.prep.map((line) => [line.course, line.name])).toEqual([["soup", "Rosół"]]);
    const view = await getRestaurantView(db, a.id);
    expect(view.prep).toEqual([{ course: "soup", name: "Rosół", quantity: 2, toServe: 2, notes: [] }]);
    expect(JSON.stringify(view.prep)).not.toMatch(/Grosze|menu_item|"id"/);
    // Deleting the item keeps the line (name, course, price) and drops it from the event's menu.
    expect((await deleteMenuItem(db, a.restaurantId, ids.rosol)).status).toBe("deleted");
    const after = await getOrderBoard(db, a.id);
    expect(after.items.map((item) => [item.name, item.course, item.unitPriceGrosze])).toEqual([
      ["Rosół", "soup", 1_800],
    ]);
    expect(after.menu.items.map((item) => item.name)).toEqual(["Woda"]);
  });
});
