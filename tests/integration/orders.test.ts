import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVENT_ID } from "@/lib/event";
import {
  addOrderItem,
  deleteOrderItem,
  getOrderBoard,
  getRestaurantView,
  rotateRestaurantKey,
  updateOrderItem,
} from "@/lib/orders";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import type { OrderBoardDto } from "@/types";
import {
  acquireTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestGuests,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  releaseEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

// The food order and the restaurant link (restaurant-orders) against the local DB. The suite works only on the
// lines, guests, tables and snapshot it creates and deletes them again; the restaurant key it rotates is put back.
describe.skipIf(!hasLocalDb)("restaurant orders", () => {
  let db: DbClient;
  let event: TestEvent;
  let seating: TestSeating | null = null;
  let snapshotId: number | null = null;
  let restaurantKey = "";
  const tag = testTag();
  const lineIds: number[] = [];

  async function readRestaurantKey(): Promise<string> {
    const { data, error } = await db.from("event").select("restaurant_key").eq("id", EVENT_ID).single();
    if (error) {
      throw new Error(error.message);
    }
    return data.restaurant_key;
  }

  function mine(board: OrderBoardDto) {
    return board.items.filter((item) => item.name.endsWith(tag));
  }

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    restaurantKey = await readRestaurantKey();
    seating = await createTestSeating(
      db,
      tag,
      [
        { seatCount: 4, shape: "round" },
        { seatCount: 4, shape: "rectangular" },
      ],
      3,
    );
    const [round] = seating.tableIds;
    expect((await seatGuest(db, seating.guestIds[0], round, 2)).status).toBe("seated");
    expect((await seatGuest(db, seating.guestIds[1], round, 1)).status).toBe("seated");
    const published = await publishSeating(db);
    snapshotId = published.status === "published" ? published.snapshotId : null;
  });

  afterAll(async () => {
    await db.from("order_item").delete().in("id", lineIds);
    await db.from("order_item").delete().like("name", `%${tag}`);
    if (snapshotId !== null) {
      await deleteTestSnapshots(db, [snapshotId]);
    }
    await cleanupTestSeating(db, seating);
    if (restaurantKey) {
      await db.from("event").update({ restaurant_key: restaurantKey }).eq("id", EVENT_ID);
    }
    await releaseEvent(db, event);
  });

  it("adds lines for a guest, a table and nobody, and places them by the published seating", async () => {
    if (!seating) {
      throw new Error("no seating");
    }
    const [first, second, third] = seating.guestIds;
    const [round, rectangular] = seating.tableIds;
    const add = (name: string, assignment: Parameters<typeof addOrderItem>[1]["assignment"], quantity = 1) =>
      addOrderItem(db, { name: `${name} ${tag}`, note: null, quantity, unitPriceGrosze: 4_900, assignment });

    expect(await add("Schabowy", { guestId: first })).toEqual({ status: "added" });
    expect(await add("Żurek", { guestId: second }, 2)).toEqual({ status: "added" });
    expect(await add("Woda", { tableId: round })).toEqual({ status: "added" });
    expect(await add("Pierogi", { guestId: third })).toEqual({ status: "added" });
    expect(await add("Wino", { tableId: rectangular })).toEqual({ status: "added" });
    expect(await add("Tort", null)).toEqual({ status: "added" });
    expect(await add("Zupa", { guestId: 2_000_000_000 })).toEqual({ status: "place-gone" });

    const board = await getOrderBoard(db);
    lineIds.push(...mine(board).map((item) => item.id));
    expect(mine(board)).toHaveLength(6);
    const table = board.placement.tables.find((placed) => placed.name === seating?.tableNames[0]);
    expect(table?.seats.map((seat) => [seat.seat, seat.guestName, seat.items.map((item) => item.name)])).toEqual([
      [1, seating.guestNames[1], [`Żurek ${tag}`]],
      [2, seating.guestNames[0], [`Schabowy ${tag}`]],
    ]);
    expect(table?.tableItems.map((item) => item.name)).toEqual([`Woda ${tag}`]);
    // Seated at an unpublished position: the third guest and the rectangular table's line wait for a seat.
    const rectangularTable = board.placement.tables.find((placed) => placed.name === seating?.tableNames[1]);
    expect(rectangularTable?.tableItems.map((item) => item.name)).toEqual([`Wino ${tag}`]);
    expect(board.placement.unplaced).toContainEqual(
      expect.objectContaining({ kind: "guest", name: seating.guestNames[2] }),
    );
    expect(board.placement.unassigned.map((item) => item.name)).toContain(`Tort ${tag}`);
    expect(board.guests.find((guest) => guest.id === first)?.seat).toEqual({ table: seating.tableNames[0], seat: 2 });
    expect(board.tables.find((option) => option.id === round)?.published).toBe(true);
  });

  it("ticks, edits, moves and deletes a line", async () => {
    if (!seating) {
      throw new Error("no seating");
    }
    const board = await getOrderBoard(db);
    const zurek = mine(board).find((item) => item.name.startsWith("Żurek"));
    if (!zurek) {
      throw new Error("no line");
    }
    const before = await getRestaurantView(db);
    expect(await updateOrderItem(db, zurek.id, { delivered: true })).toEqual({ status: "updated" });
    const after = await getRestaurantView(db);
    expect(after.version).not.toBe(before.version);
    expect(after.totals.toServe).toBe(before.totals.toServe - 2);

    expect(
      await updateOrderItem(db, zurek.id, { assignment: { tableId: seating.tableIds[1] }, unitPriceGrosze: 1_000 }),
    ).toEqual({ status: "updated" });
    const moved = mine(await getOrderBoard(db)).find((item) => item.id === zurek.id);
    expect(moved).toMatchObject({
      guestId: null,
      tableId: seating.tableIds[1],
      unitPriceGrosze: 1_000,
      delivered: true,
    });

    expect(await updateOrderItem(db, zurek.id, { assignment: { tableId: 2_000_000_000 } })).toEqual({
      status: "place-gone",
    });
    expect(await updateOrderItem(db, 2_000_000_000, { delivered: true })).toEqual({ status: "not-found" });
    expect(await deleteOrderItem(db, zurek.id)).toEqual({ status: "deleted" });
    expect(await deleteOrderItem(db, zurek.id)).toEqual({ status: "not-found" });
  });

  it("keeps a deleted guest's line, unassigned", async () => {
    if (!seating) {
      throw new Error("no seating");
    }
    const third = seating.guestIds[2];
    await deleteTestGuests(db, [third]);
    seating.guestIds = seating.guestIds.filter((id) => id !== third);
    const pierogi = mine(await getOrderBoard(db)).find((item) => item.name.startsWith("Pierogi"));
    expect(pierogi).toMatchObject({ guestId: null, tableId: null });
  });

  it("never gives the restaurant prices or ids", async () => {
    const view = await getRestaurantView(db);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/Grosze|guestId|tableId|"id"/);
    expect(json).not.toContain(event.organizerKey);
    expect(json).not.toContain(event.tvKey);
    expect(view.prep.some((line) => line.name === `Schabowy ${tag}`)).toBe(true);
  });

  it("refuses two places at once and out-of-range lines in the DB", async () => {
    if (!seating) {
      throw new Error("no seating");
    }
    const both = await db.from("order_item").insert({
      name: `Oba ${tag}`,
      quantity: 1,
      unit_price_grosze: 100,
      guest_id: seating.guestIds[0],
      table_id: seating.tableIds[0],
    });
    expect(both.error?.message).toContain("order_item_one_place");
    const zero = await db.from("order_item").insert({ name: `Zero ${tag}`, quantity: 0, unit_price_grosze: 100 });
    expect(zero.error?.message).toContain("order_item_quantity_range");
  });

  it("rotates the restaurant key", async () => {
    const before = await readRestaurantKey();
    const rotated = await rotateRestaurantKey(db);
    expect(rotated).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(rotated).not.toBe(before);
    expect(await readRestaurantKey()).toBe(rotated);
  });
});
