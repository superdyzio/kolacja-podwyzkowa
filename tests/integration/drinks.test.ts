import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVENT_ID } from "@/lib/event";
import {
  addDrinkItem,
  deleteDrinkItem,
  drinkTotals,
  getDrinkItems,
  getOrderBoard,
  getRestaurantView,
  MAX_DRINK_ITEMS,
  updateDrinkItem,
} from "@/lib/orders";
import type { DbClient } from "@/lib/supabase-client";
import type { DrinkItemDto } from "@/types";
import { acquireTestEvent, hasLocalDb, localDb, localDbEnv, releaseEvent, testTag, type TestEvent } from "./helpers";

// The drinks on the bill (bill-drinks) against the local DB. The suite works only on the drinks it creates (names end
// with its tag) and deletes them again.
describe.skipIf(!hasLocalDb)("drinks on the bill", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const tag = testTag();

  function mine(drinks: readonly DrinkItemDto[]): DrinkItemDto[] {
    return drinks.filter((drink) => drink.name.endsWith(tag));
  }

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterAll(async () => {
    await db.from("drink_item").delete().like("name", `%${tag}`);
    await releaseEvent(db, event);
  });

  it("adds, changes and deletes drinks; the board carries them and their sum", async () => {
    expect(await addDrinkItem(db, { name: `Piwo ${tag}`, quantity: 12, unitPriceGrosze: 1_400 })).toEqual({
      status: "added",
    });
    expect(await addDrinkItem(db, { name: `Wino ${tag}`, quantity: 2, unitPriceGrosze: 12_900 })).toEqual({
      status: "added",
    });
    const board = await getOrderBoard(db);
    const [piwo, wino] = mine(board.drinks);
    expect(piwo).toMatchObject({ name: `Piwo ${tag}`, quantity: 12, unitPriceGrosze: 1_400 });
    expect(wino).toMatchObject({ name: `Wino ${tag}`, quantity: 2, unitPriceGrosze: 12_900 });
    expect(board.drinkTotals).toEqual(drinkTotals(board.drinks));
    expect(drinkTotals([piwo, wino])).toEqual({ lines: 2, quantity: 14, totalGrosze: 12 * 1_400 + 2 * 12_900 });
    // The dishes' totals stay the dishes' own.
    expect(board.totals.totalGrosze).toBe(board.items.reduce((sum, i) => sum + i.quantity * i.unitPriceGrosze, 0));

    expect(await updateDrinkItem(db, piwo.id, { quantity: 15, unitPriceGrosze: 1_500 })).toEqual({ status: "updated" });
    expect(await updateDrinkItem(db, wino.id, { name: `Wino czerwone ${tag}` })).toEqual({ status: "updated" });
    const changed = mine(await getDrinkItems(db));
    expect(changed).toEqual([
      { id: piwo.id, name: `Piwo ${tag}`, quantity: 15, unitPriceGrosze: 1_500 },
      { id: wino.id, name: `Wino czerwone ${tag}`, quantity: 2, unitPriceGrosze: 12_900 },
    ]);

    expect(await deleteDrinkItem(db, wino.id)).toEqual({ status: "deleted" });
    expect(await deleteDrinkItem(db, wino.id)).toEqual({ status: "not-found" });
    expect(await updateDrinkItem(db, wino.id, { quantity: 1 })).toEqual({ status: "not-found" });
    expect(mine(await getDrinkItems(db)).map((drink) => drink.id)).toEqual([piwo.id]);
  });

  it("never reaches the restaurant's view", async () => {
    expect(await addDrinkItem(db, { name: `Wódka ${tag}`, quantity: 1, unitPriceGrosze: 9_900 })).toEqual({
      status: "added",
    });
    const view = JSON.stringify(await getRestaurantView(db));
    expect(view).not.toContain(tag);
    expect(view).not.toContain("drink");
  });

  it("stops at the line limit", async () => {
    const { count, error } = await db
      .from("drink_item")
      .select("id", { count: "exact", head: true })
      .eq("event_id", EVENT_ID);
    expect(error).toBeNull();
    const missing = MAX_DRINK_ITEMS - (count ?? 0);
    if (missing > 0) {
      const rows = Array.from({ length: missing }, (_, index) => ({
        name: `Woda ${String(index)} ${tag}`,
        quantity: 1,
        unit_price_grosze: 500,
      }));
      const filled = await db.from("drink_item").insert(rows);
      expect(filled.error).toBeNull();
    }
    expect(await addDrinkItem(db, { name: `Sok ${tag}`, quantity: 1, unitPriceGrosze: 900 })).toEqual({
      status: "too-many",
    });
    await db.from("drink_item").delete().like("name", `Woda % ${tag}`);
  });

  it("keeps the DB bounds", async () => {
    for (const row of [
      { name: "", quantity: 1, unit_price_grosze: 100 },
      { name: `Piwo ${tag}`, quantity: 0, unit_price_grosze: 100 },
      { name: `Piwo ${tag}`, quantity: 1_000, unit_price_grosze: 100 },
      { name: `Piwo ${tag}`, quantity: 1, unit_price_grosze: -1 },
      { name: `Piwo ${tag}`, quantity: 1, unit_price_grosze: 10_000_001 },
    ]) {
      const { error } = await db.from("drink_item").insert(row);
      expect(error?.code).toBe("23514");
    }
    const { error } = await db.from("drink_item").insert({ name: `Piwo ${tag}`, quantity: 999, unit_price_grosze: 0 });
    expect(error).toBeNull();
  });

  it("gives browser roles nothing", async () => {
    for (const headers of [{}, { apikey: "anything" }] as Record<string, string>[]) {
      const rows = await fetch(`${restUrl}/drink_item?select=*`, { headers });
      if (rows.ok) {
        expect(await rows.json()).toEqual([]);
      }
      const insert = await fetch(`${restUrl}/drink_item`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Wstrzyknięte", quantity: 1, unit_price_grosze: 100 }),
      });
      expect(insert.ok).toBe(false);
    }
  });
});
