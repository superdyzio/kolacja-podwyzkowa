import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import {
  addOrderItem,
  getGuestOrders,
  getOrderBoard,
  getRestaurantView,
  markGuestPiece,
  markOrderPieces,
  updateOrderItem,
} from "@/lib/orders";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import type { OrderItemDto } from "@/types";
import {
  createTestEvent,
  cleanupTestSeating,
  createTestSeating,
  deleteTestSnapshots,
  hasLocalDb,
  localDb,
  releaseTestEvent,
  testTag,
  type TestEvent,
  type TestSeating,
} from "./helpers";

// Delivered pieces (guest-delivered) against the local DB: who may mark what (own lines and the lines of the guest's
// table in the latest snapshot), single pieces, who marked them, quantity changes, the order_item.delivered column kept
// in step, and the guest's polling token being the same on the 204 and the 200 path. Works only on its own guests,
// tables, lines and snapshot, and deletes them again.
describe.skipIf(!hasLocalDb)("delivered order pieces", () => {
  let db: DbClient;
  let event: TestEvent;
  let seating: TestSeating | null = null;
  let snapshotId: number | null = null;
  const tag = testTag();
  // Lines by short name.
  const line: Record<string, number> = {};

  function guest(index: number) {
    if (!seating) {
      throw new Error("no seating");
    }
    return { id: seating.guestIds[index], displayName: seating.guestNames[index] };
  }

  async function item(name: string): Promise<OrderItemDto> {
    const found = (await getOrderBoard(db, event.id)).items.find((one) => one.id === line[name]);
    if (!found) {
      throw new Error(`no line ${name}`);
    }
    return found;
  }

  async function deliveredColumn(name: string): Promise<boolean> {
    const { data, error } = await db.from("order_item").select("delivered").eq("id", line[name]).single();
    if (error) {
      throw new Error(error.message);
    }
    return data.delivered;
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db);
    seating = await createTestSeating(
      db,
      event.id,
      tag,
      [
        { seatCount: 4, shape: "round" },
        { seatCount: 4, shape: "rectangular" },
      ],
      4,
    );
    const [round, rectangular] = seating.tableIds;
    // Guests 0 and 1 at the round table, guest 2 at the rectangular one, guest 3 nowhere.
    expect((await seatGuest(db, event.id, seating.guestIds[0], round, 1)).status).toBe("seated");
    expect((await seatGuest(db, event.id, seating.guestIds[1], round, 2)).status).toBe("seated");
    expect((await seatGuest(db, event.id, seating.guestIds[2], rectangular, 1)).status).toBe("seated");
    const published = await publishSeating(db, event.id);
    snapshotId = published.status === "published" ? published.snapshotId : null;
    expect(snapshotId).not.toBeNull();

    const add = async (key: string, assignment: Parameters<typeof addOrderItem>[2]["assignment"], quantity = 1) => {
      const name = `${key} ${tag}`;
      expect(
        await addOrderItem(db, event.id, {
          name,
          note: key === "Schabowy" ? "bez cebuli" : null,
          quantity,
          unitPriceGrosze: 4_900,
          assignment,
        }),
      ).toEqual({ status: "added" });
      const added = (await getOrderBoard(db, event.id)).items.find((one) => one.name === name);
      if (!added) {
        throw new Error(`not added: ${name}`);
      }
      line[key] = added.id;
    };
    await add("Schabowy", { guestId: seating.guestIds[0] }, 2);
    await add("Woda", { tableId: round });
    await add("Pierogi", { guestId: seating.guestIds[1] });
    await add("Wino", { tableId: rectangular });
    await add("Tort", { guestId: seating.guestIds[3] });
  });

  afterAll(async () => {
    await db.from("order_item").delete().like("name", `%${tag}`);
    if (snapshotId !== null) {
      await deleteTestSnapshots(db, [snapshotId]);
    }
    await cleanupTestSeating(db, seating);
    await releaseTestEvent(db, event);
  });

  it("shows a guest their own lines and their table's, without prices or anyone's lines elsewhere", async () => {
    const lines = await getGuestOrders(db, guest(0).id);
    expect(lines.map((one) => [one.lineId, one.kind, one.quantity])).toEqual([
      [line.Schabowy, "own", 2],
      [line.Woda, "table", 1],
    ]);
    expect(lines[0]).toEqual({
      lineId: line.Schabowy,
      name: `Schabowy ${tag}`,
      note: "bez cebuli",
      quantity: 2,
      kind: "own",
      pieces: [
        { piece: 1, deliveredBy: null },
        { piece: 2, deliveredBy: null },
      ],
    });
    expect(JSON.stringify(lines)).not.toMatch(/Grosze|price|guestId|tableId/i);
    // Guest 2 sits at the other table; guest 3 is not seated and sees only their own line.
    expect((await getGuestOrders(db, guest(2).id)).map((one) => one.lineId)).toEqual([line.Wino]);
    expect((await getGuestOrders(db, guest(3).id)).map((one) => [one.lineId, one.kind])).toEqual([[line.Tort, "own"]]);
    expect((await getGuestState(db, event.id, guest(0))).orders).toEqual(lines);
  });

  it("marks single pieces, keeps who marked them and keeps the delivered column in step", async () => {
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Schabowy, 2, true)).toEqual({ status: "marked" });
    let schabowy = await item("Schabowy");
    expect(schabowy.deliveredPieces).toEqual([2]);
    expect(schabowy.marks).toEqual([{ piece: 2, by: "guest", guestId: guest(0).id }]);
    expect(schabowy.delivered).toBe(false);
    expect(await deliveredColumn("Schabowy")).toBe(false);
    const prep = (await getOrderBoard(db, event.id)).prep.find((one) => one.name === `Schabowy ${tag}`);
    expect(prep).toMatchObject({ quantity: 2, toServe: 1 });
    const restaurant = await getRestaurantView(db, event.id);
    const served = restaurant.placement.tables.flatMap((table) => table.seats.flatMap((seat) => seat.items));
    expect(served.find((one) => one.name === `Schabowy ${tag}`)).toMatchObject({
      delivered: false,
      deliveredPieces: [2],
    });

    // Marking an already marked piece again is a no-op (the first mark stays), the second piece completes the line.
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Schabowy, 2, true)).toEqual({ status: "marked" });
    expect(await markOrderPieces(db, event.id, line.Schabowy, [1], true)).toEqual({ status: "marked" });
    schabowy = await item("Schabowy");
    expect(schabowy.marks).toEqual([
      { piece: 1, by: "organizer", guestId: null },
      { piece: 2, by: "guest", guestId: guest(0).id },
    ]);
    expect(schabowy.delivered).toBe(true);
    expect(await deliveredColumn("Schabowy")).toBe(true);
    expect((await getGuestOrders(db, guest(0).id))[0].pieces).toEqual([
      { piece: 1, deliveredBy: "organizer" },
      { piece: 2, deliveredBy: "you" },
    ]);
  });

  it("lets a guest mark only their own lines and their table's", async () => {
    // A tablemate's personal dish, another table's line, an unknown line.
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Pierogi, 1, true)).toEqual({ status: "not-found" });
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Wino, 1, true)).toEqual({ status: "not-found" });
    expect(await markGuestPiece(db, event.id, guest(3).id, line.Woda, 1, true)).toEqual({ status: "not-found" });
    expect(await markGuestPiece(db, event.id, guest(0).id, 2_000_000_000, 1, true)).toEqual({ status: "not-found" });
    expect((await item("Pierogi")).deliveredPieces).toEqual([]);
    expect((await item("Wino")).deliveredPieces).toEqual([]);
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Schabowy, 3, true)).toEqual({ status: "out-of-range" });

    // The tablemate marks the table's water; guest 0 sees "another guest", guest 1 sees "you".
    expect(await markGuestPiece(db, event.id, guest(1).id, line.Woda, 1, true)).toEqual({ status: "marked" });
    expect((await getGuestOrders(db, guest(0).id))[1].pieces).toEqual([{ piece: 1, deliveredBy: "guest" }]);
    expect((await getGuestOrders(db, guest(1).id)).find((one) => one.lineId === line.Woda)?.pieces).toEqual([
      { piece: 1, deliveredBy: "you" },
    ]);
    // Any guest at the table may undo a guest's mark.
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Woda, 1, false)).toEqual({ status: "marked" });
    expect((await item("Woda")).deliveredPieces).toEqual([]);
  });

  it("never lets a guest undo the organizer's mark, while the organizer may undo anyone's", async () => {
    expect(await markOrderPieces(db, event.id, line.Wino, [1], true)).toEqual({ status: "marked" });
    expect((await getGuestOrders(db, guest(2).id))[0].pieces).toEqual([{ piece: 1, deliveredBy: "organizer" }]);
    expect(await markGuestPiece(db, event.id, guest(2).id, line.Wino, 1, false)).toEqual({
      status: "marked-by-organizer",
    });
    expect((await item("Wino")).delivered).toBe(true);

    expect(await markGuestPiece(db, event.id, guest(1).id, line.Pierogi, 1, true)).toEqual({ status: "marked" });
    expect(await markOrderPieces(db, event.id, line.Pierogi, [1], false)).toEqual({ status: "marked" });
    expect((await item("Pierogi")).deliveredPieces).toEqual([]);
    expect(await markOrderPieces(db, event.id, 2_000_000_000, null, true)).toEqual({ status: "not-found" });
  });

  it("drops marks above a lowered quantity and recomputes delivered when the quantity changes", async () => {
    // Schabowy: both pieces marked (piece 1 by the organizer, piece 2 by guest 0).
    expect(await updateOrderItem(db, event.id, line.Schabowy, { quantity: 1 })).toEqual({ status: "updated" });
    let schabowy = await item("Schabowy");
    expect(schabowy.marks).toEqual([{ piece: 1, by: "organizer", guestId: null }]);
    expect(schabowy.delivered).toBe(true);
    expect(await updateOrderItem(db, event.id, line.Schabowy, { quantity: 3 })).toEqual({ status: "updated" });
    schabowy = await item("Schabowy");
    expect(schabowy.deliveredPieces).toEqual([1]);
    expect(schabowy.delivered).toBe(false);
    expect(await deliveredColumn("Schabowy")).toBe(false);
  });

  it("ticks and unticks the whole line („Wydane”) without overwriting earlier marks", async () => {
    expect(await markGuestPiece(db, event.id, guest(0).id, line.Schabowy, 3, true)).toEqual({ status: "marked" });
    expect(await updateOrderItem(db, event.id, line.Schabowy, { delivered: true })).toEqual({ status: "updated" });
    let schabowy = await item("Schabowy");
    expect(schabowy.marks).toEqual([
      { piece: 1, by: "organizer", guestId: null },
      { piece: 2, by: "organizer", guestId: null },
      { piece: 3, by: "guest", guestId: guest(0).id },
    ]);
    expect(schabowy.delivered).toBe(true);
    expect(await deliveredColumn("Schabowy")).toBe(true);
    expect(await updateOrderItem(db, event.id, line.Schabowy, { delivered: false })).toEqual({ status: "updated" });
    schabowy = await item("Schabowy");
    expect(schabowy.marks).toEqual([]);
    expect(await deliveredColumn("Schabowy")).toBe(false);
  });

  it("gives the same polling token on the 204 and the 200 path, and a new one when a tablemate marks a piece", async () => {
    for (const index of [0, 1, 2, 3]) {
      expect(await getGuestStateVersion(db, event.id, guest(index))).toBe(
        (await getGuestState(db, event.id, guest(index))).version,
      );
    }
    const before = await getGuestStateVersion(db, event.id, guest(0));
    expect(await markGuestPiece(db, event.id, guest(1).id, line.Woda, 1, true)).toEqual({ status: "marked" });
    const after = await getGuestStateVersion(db, event.id, guest(0));
    expect(after).not.toBe(before);
    expect(after).toBe((await getGuestState(db, event.id, guest(0))).version);
    expect(after.length).toBeLessThanOrEqual(64);
    // A mark on another table's line does not touch this guest's token.
    expect(await markOrderPieces(db, event.id, line.Wino, [1], false)).toEqual({ status: "marked" });
    expect(await getGuestStateVersion(db, event.id, guest(0))).toBe(after);
  });
});
