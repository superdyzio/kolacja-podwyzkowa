import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access";
import { getClientAccess } from "@/lib/client-routes/access";
import { getEventCard, updateEvent } from "@/lib/events";
import {
  addDrinkItem,
  addOrderItem,
  getOrderItems,
  getPriceList,
  priceForNewLine,
  priceForRenamedLine,
  setEventPrice,
} from "@/lib/orders";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, type TestEvent } from "./helpers";

// The client / venue split (client-restaurant-split, S-14) against the local DB: the „Lokal prowadzi” switch on the
// event card and in the organizer access, and the organizer access the panel builds for its own event only. The suite
// creates two restaurants with one event each and deletes them at the end.
describe.skipIf(!hasLocalDb)("client / venue split", () => {
  let db: DbClient;
  let a: TestEvent | undefined;
  let b: TestEvent | undefined;

  beforeAll(async () => {
    db = localDb();
    a = await createTestEvent(db, "split A");
    b = await createTestEvent(db, "split B");
  });

  afterAll(async () => {
    await releaseTestEvent(db, a);
    await releaseTestEvent(db, b);
  });

  it("starts client-led and flips „Lokal prowadzi” on and off", async () => {
    if (!a) throw new Error("no event");
    expect((await getEventCard(db, a.restaurantId, a.id, new Date()))?.venueLeads).toBe(false);
    expect(await updateEvent(db, a.restaurantId, a.id, { venueLeads: true })).toBe("updated");
    const card = await getEventCard(db, a.restaurantId, a.id, new Date());
    expect(card?.venueLeads).toBe(true);
    const access = await resolveAccess(db, "organizer", a.organizerKey);
    expect(access?.role === "organizer" && access.event.venueLeads).toBe(true);
    expect(await updateEvent(db, a.restaurantId, a.id, { venueLeads: false })).toBe("updated");
    expect((await getEventCard(db, a.restaurantId, a.id, new Date()))?.venueLeads).toBe(false);
  });

  it("never flips another restaurant's event", async () => {
    if (!a || !b) throw new Error("no event");
    expect(await updateEvent(db, a.restaurantId, b.id, { venueLeads: true })).toBe("not-found");
    expect((await getEventCard(db, b.restaurantId, b.id, new Date()))?.venueLeads).toBe(false);
  });

  it("builds the organizer access of its own event only", async () => {
    if (!a || !b) throw new Error("no event");
    const access = await getClientAccess(db, a.restaurantId, a.id);
    expect(access).toEqual(await resolveAccess(db, "organizer", a.organizerKey));
    expect(await getClientAccess(db, a.restaurantId, b.id)).toBeNull();
    expect(await getClientAccess(db, b.restaurantId, 2_000_000_000)).toBeNull();
  });

  it("prices lines by name per event and lets the venue set every line of a name at once", async () => {
    if (!a || !b) throw new Error("no event");
    const line = (name: string, unitPriceGrosze: number) => ({
      name,
      note: null,
      quantity: 1,
      unitPriceGrosze,
      assignment: null,
    });
    await addOrderItem(db, a.id, line("Pierogi", 3_200));
    await addOrderItem(db, a.id, line("pierogi", 3_400));
    await addOrderItem(db, b.id, line("Pierogi", 9_900));
    await addDrinkItem(db, a.id, { name: "Woda", quantity: 2, unitPriceGrosze: 800 });

    expect(await priceForNewLine(db, a.id, "dish", "PIEROGI")).toBe(3_400);
    expect(await priceForNewLine(db, a.id, "dish", "Barszcz")).toBe(0);
    expect(await priceForNewLine(db, a.id, "drink", "woda")).toBe(800);
    expect(await priceForNewLine(db, b.id, "dish", "pierogi")).toBe(9_900);

    expect(await setEventPrice(db, a.id, "dish", "PIEROGI", 3_600)).toEqual({ status: "updated" });
    expect((await getOrderItems(db, a.id)).map((item) => item.unitPriceGrosze)).toEqual([3_600, 3_600]);
    // Another event's lines of the same name keep their price; an unknown name changes nothing.
    expect((await getOrderItems(db, b.id)).map((item) => item.unitPriceGrosze)).toEqual([9_900]);
    expect(await setEventPrice(db, a.id, "dish", "Barszcz", 100)).toEqual({ status: "not-found" });
    expect(await setEventPrice(db, a.id, "drink", "Pierogi", 100)).toEqual({ status: "not-found" });

    const [first] = await getOrderItems(db, a.id);
    expect(await priceForRenamedLine(db, a.id, "dish", first.id, "pierogi")).toBeNull();
    expect(await priceForRenamedLine(db, a.id, "dish", first.id, "Woda")).toBe(0);
    expect(await getPriceList(db, a.id)).toEqual({
      rows: [
        { kind: "dish", name: "pierogi", priceGrosze: 3_600, mixed: false, lines: 2 },
        { kind: "drink", name: "Woda", priceGrosze: 800, mixed: false, lines: 1 },
      ],
    });
  });
});
