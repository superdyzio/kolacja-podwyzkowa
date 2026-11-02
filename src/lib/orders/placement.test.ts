import { describe, expect, it } from "vitest";
import type { OrderItemDto, SeatingSnapshot } from "@/types";
import { placeOrders, type PlacementSource } from "./placement";
import { organizerPrepList, prepList } from "./prep";
import { toRestaurantView } from "./restaurant";

function line(id: number, fields: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    id,
    name: "Schabowy",
    note: null,
    quantity: 1,
    unitPriceGrosze: 4_900,
    guestId: null,
    tableId: null,
    delivered: false,
    ...fields,
  };
}

// Two published tables (ids 10 „Okno” in Sala A, 11 „Kominek” in Sala A) and a third live table (12) added after the
// publish. Guests 1 and 2 sit at Okno, 3 at Kominek; guest 4 is not published.
const snapshot: SeatingSnapshot = {
  id: 7,
  publishedAt: "2026-11-08T18:00:00.000Z",
  chairPitch: 0.035,
  rooms: [],
  tables: [
    {
      snapshotTableId: 100,
      tableId: 10,
      roomName: "Sala A",
      name: "Okno",
      seatCount: 6,
      shape: "round",
      x: 0.2,
      y: 0.2,
      rotation: 0,
    },
    {
      snapshotTableId: 101,
      tableId: 11,
      roomName: "Sala A",
      name: "Kominek",
      seatCount: 6,
      shape: "round",
      x: 0.6,
      y: 0.2,
      rotation: 0,
    },
  ],
  seats: [
    { snapshotTableId: 100, seat: 3, guestId: 1, guestName: "Ania" },
    { snapshotTableId: 100, seat: 1, guestId: 2, guestName: "Bartek" },
    { snapshotTableId: 101, seat: 2, guestId: 3, guestName: "Celina" },
  ],
};

const source: PlacementSource = {
  guests: new Map([
    [1, "Ania"],
    [2, "Bartek"],
    [3, "Celina"],
    [4, "Darek"],
  ]),
  tables: new Map([
    [10, { name: "Okno", room: "Sala A" }],
    [11, { name: "Kominek", room: "Sala A" }],
    [12, { name: "Taras", room: "Ogród" }],
  ]),
  snapshot,
};

const items = [
  line(1, { guestId: 1, name: "Żurek" }),
  line(2, { guestId: 2 }),
  line(3, { guestId: 1, note: "bez cebuli" }),
  line(4, { tableId: 10, name: "Woda", quantity: 2, unitPriceGrosze: 1_200 }),
  line(5, { guestId: 4 }),
  line(6, { tableId: 12, name: "Woda" }),
  line(7, { name: "Tort", delivered: true }),
  line(8, { guestId: 3, name: "schabowy", note: "Bez cebuli", delivered: true }),
];

describe("placeOrders", () => {
  it("serves at the published seats and tables, in table and seat order", () => {
    const placement = placeOrders(items, source, (item) => item.id);
    expect(placement.tables).toEqual([
      { name: "Kominek", room: "Sala A", seats: [{ seat: 2, guestName: "Celina", items: [8] }], tableItems: [] },
      {
        name: "Okno",
        room: "Sala A",
        seats: [
          { seat: 1, guestName: "Bartek", items: [2] },
          { seat: 3, guestName: "Ania", items: [1, 3] },
        ],
        tableItems: [4],
      },
    ]);
  });

  it("puts what is not on the published plan aside, guests first, and lines for nobody last", () => {
    const placement = placeOrders(items, source, (item) => item.id);
    expect(placement.unplaced).toEqual([
      { kind: "guest", name: "Darek", items: [5] },
      { kind: "table", name: "Taras (Ogród)", items: [6] },
    ]);
    expect(placement.unassigned).toEqual([7]);
  });

  it("before the first publish nothing is placed", () => {
    const placement = placeOrders(items, { ...source, snapshot: null }, (item) => item.id);
    expect(placement.tables).toEqual([]);
    expect(placement.unplaced.map((group) => group.name)).toEqual([
      "Ania",
      "Bartek",
      "Celina",
      "Darek",
      "Okno (Sala A)",
      "Taras (Ogród)",
    ]);
  });
});

describe("prep list", () => {
  it("adds up each dish case-insensitively, with notes and what is left to serve", () => {
    expect(organizerPrepList(items)).toEqual([
      {
        name: "Schabowy",
        quantity: 4,
        toServe: 3,
        notes: [{ note: "bez cebuli", quantity: 2 }],
        totalGrosze: 19_600,
      },
      { name: "Tort", quantity: 1, toServe: 0, notes: [], totalGrosze: 4_900 },
      { name: "Woda", quantity: 3, toServe: 3, notes: [], totalGrosze: 7_300 },
      { name: "Żurek", quantity: 1, toServe: 1, notes: [], totalGrosze: 4_900 },
    ]);
    expect(prepList(items)[0]).toEqual({
      name: "Schabowy",
      quantity: 4,
      toServe: 3,
      notes: [{ note: "bez cebuli", quantity: 2 }],
    });
  });
});

describe("toRestaurantView", () => {
  it("has no prices or ids and a stable token that changes with any tick", () => {
    const view = toRestaurantView(items, source, 123);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/Grosze|guestId|tableId|"id"/);
    expect(view.totals).toEqual({ quantity: 9, toServe: 7 });
    expect(view.placement.unassigned).toEqual([{ name: "Tort", note: null, quantity: 1, delivered: true }]);
    expect(view.seating.tables.map((table) => table.name)).toEqual(["Kominek", "Okno"]);
    expect(toRestaurantView(items, source, 123).version).toBe(view.version);
    const ticked = items.map((item) => (item.id === 1 ? { ...item, delivered: true } : item));
    expect(toRestaurantView(ticked, source, 123).version).not.toBe(view.version);
    expect(toRestaurantView(items, source, 124).version).not.toBe(view.version);
  });
});
