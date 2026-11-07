import { describe, expect, it } from "vitest";
import type { OrderPlacementDto, RestaurantItemDto } from "@/types";
import {
  describePlaceShort,
  describeSelection,
  dishInstances,
  formatInstanceNumbers,
  instanceMarks,
  isInstanceServed,
  markedTables,
  resolveSelection,
  servingSpots,
} from "./serving";

function item(name: string, quantity = 1, fields: Partial<RestaurantItemDto> = {}): RestaurantItemDto {
  const deliveredPieces = fields.delivered ? Array.from({ length: quantity }, (_, index) => index + 1) : [];
  return { name, note: null, quantity, delivered: false, deliveredPieces, ...fields };
}

// Okno: Ania (seat 1) has a soup, Bartek (seat 3) two soups and a cutlet, two soups in the middle; Kominek: Celina
// (seat 2) a served soup; Daria is not on the plan (a soup), and one soup is for nobody.
const placement: OrderPlacementDto<RestaurantItemDto> = {
  tables: [
    {
      name: "Okno",
      room: "Sala A",
      seats: [
        { seat: 1, guestName: "Ania", items: [item("Rosół")] },
        { seat: 3, guestName: "Bartek", items: [item("rosół", 2), item("Schabowy")] },
      ],
      tableItems: [item("Rosół", 2)],
    },
    {
      name: "Kominek",
      room: "Sala A",
      seats: [{ seat: 2, guestName: "Celina", items: [item("Rosół", 1, { delivered: true })] }],
      tableItems: [],
    },
  ],
  unplaced: [{ kind: "guest", name: "Daria", items: [item("Rosół")] }],
  unassigned: [item("Rosół")],
};

describe("servingSpots", () => {
  it("lists every line at its place in placement order, keyed by position", () => {
    const spots = servingSpots(placement);
    expect(spots.map((spot) => spot.key)).toEqual([
      "seat:Okno:1:0",
      "seat:Okno:3:0",
      "seat:Okno:3:1",
      "table:Okno:0",
      "seat:Kominek:2:0",
      "unplaced:guest:Daria:0",
      "unassigned:0",
    ]);
    expect(spots[1].place).toEqual({ kind: "seat", table: "Okno", room: "Sala A", seat: 3, guestName: "Bartek" });
    expect(spots[3].place).toEqual({ kind: "table", table: "Okno", room: "Sala A" });
    expect(spots[5].place).toEqual({ kind: "unplaced", group: "guest", name: "Daria" });
    expect(spots[6].place).toEqual({ kind: "unassigned" });
  });

  it("uses the given key when there is one", () => {
    const keyed: OrderPlacementDto<RestaurantItemDto & { id: number }> = {
      tables: [],
      unplaced: [],
      unassigned: [{ ...item("Rosół"), id: 12 }],
    };
    expect(servingSpots(keyed, (line) => `line-${String(line.id)}`)[0].key).toBe("line-12");
  });
});

describe("dishInstances", () => {
  it("numbers every piece of a dish in placement order, whatever the capitalisation", () => {
    const dishes = dishInstances(servingSpots(placement));
    const soup = dishes.get("rosół");
    expect(soup?.name).toBe("Rosół");
    expect(
      soup?.instances.map((one) => [
        one.number,
        one.place.kind === "seat" ? `${one.place.table}/${String(one.place.seat)}` : one.place.kind,
      ]),
    ).toEqual([
      [1, "Okno/1"],
      [2, "Okno/3"],
      [3, "Okno/3"],
      [4, "table"],
      [5, "table"],
      [6, "Kominek/2"],
      [7, "unplaced"],
      [8, "unassigned"],
    ]);
    expect(dishes.get("schabowy")?.instances).toHaveLength(1);
  });

  it("shows the given spelling of a dish", () => {
    expect(dishInstances(servingSpots(placement), ["ROSÓŁ"]).get("rosół")?.name).toBe("ROSÓŁ");
  });
});

describe("single delivered pieces (guest-delivered)", () => {
  // Bartek's two soups: only the SECOND piece arrived (deliveredPieces are 1-based, an instance's piece 0-based).
  const half: OrderPlacementDto<RestaurantItemDto> = {
    tables: [
      {
        name: "Okno",
        room: "Sala",
        seats: [{ seat: 3, guestName: "Bartek", items: [item("Rosół", 2, { deliveredPieces: [2] })] }],
        tableItems: [],
      },
    ],
    unplaced: [],
    unassigned: [],
  };
  const spots = servingSpots(half);
  const soup = dishInstances(spots).get("rosół");

  it("serves exactly the marked piece", () => {
    expect(soup?.instances.map((one) => [one.number, one.piece, isInstanceServed(one)])).toEqual([
      [1, 0, false],
      [2, 1, true],
    ]);
  });

  it("greys out only the served piece's mark and names it in the caption", () => {
    expect(instanceMarks(soup?.instances ?? [], true)).toEqual([
      { table: "Okno", seat: 3, label: "1", done: false },
      { table: "Okno", seat: 3, label: "2", done: true },
    ]);
    const dishes = dishInstances(spots);
    const second = resolveSelection(
      { kind: "dish", dish: "rosół", instance: { spotKey: spots[0].key, piece: 1 } },
      spots,
      dishes,
    );
    const first = resolveSelection(
      { kind: "dish", dish: "rosół", instance: { spotKey: spots[0].key, piece: 0 } },
      spots,
      dishes,
    );
    expect(second && describeSelection(second)).toMatch(/\(wydane\)$/);
    expect(first && describeSelection(first)).not.toMatch(/wydane/);
  });
});

describe("formatInstanceNumbers", () => {
  it("joins runs into ranges", () => {
    expect(formatInstanceNumbers([3])).toBe("3");
    expect(formatInstanceNumbers([2, 1])).toBe("1,2");
    expect(formatInstanceNumbers([5, 1, 2, 3, 7, 8])).toBe("1–3,5,7,8");
  });
});

describe("instanceMarks", () => {
  it("puts one mark per place and served state, with the numbers", () => {
    const soup = dishInstances(servingSpots(placement)).get("rosół")?.instances ?? [];
    expect(instanceMarks(soup, true)).toEqual([
      { table: "Okno", seat: 1, label: "1", done: false },
      { table: "Okno", seat: 3, label: "2,3", done: false },
      { table: "Okno", seat: null, label: "4,5", done: false },
      { table: "Kominek", seat: 2, label: "6", done: true },
    ]);
    expect(instanceMarks(soup.slice(0, 1), false)).toEqual([{ table: "Okno", seat: 1, label: null, done: false }]);
  });
});

// The selection of the piece with this number now.
function pieceOf(dishes: ReturnType<typeof dishInstances>, dish: string, number: number) {
  const one = dishes.get(dish)?.instances.find((candidate) => candidate.number === number);
  return one ? { spotKey: one.spotKey, piece: one.piece } : { spotKey: "gone", piece: 0 };
}

describe("resolveSelection", () => {
  const spots = servingSpots(placement);
  const dishes = dishInstances(spots);

  it("is null without a selection or when it points at nothing", () => {
    expect(resolveSelection(null, spots, dishes)).toBeNull();
    expect(resolveSelection({ kind: "dish", dish: "pierogi", instance: null }, spots, dishes)).toBeNull();
    expect(resolveSelection({ kind: "spot", key: "seat:Okno:9:0" }, spots, dishes)).toBeNull();
  });

  it("marks every instance of a dish, counting those off the plan", () => {
    const resolved = resolveSelection({ kind: "dish", dish: "rosół", instance: null }, spots, dishes);
    expect(resolved?.kind).toBe("dish");
    if (resolved?.kind !== "dish") return;
    expect(resolved.instance).toBeNull();
    expect(resolved.marks).toHaveLength(4);
    expect(resolved.offPlan).toBe(2);
    expect(markedTables(resolved.marks)).toEqual(new Set(["Okno", "Kominek"]));
  });

  it("marks one instance on its own", () => {
    const resolved = resolveSelection(
      { kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 5) },
      spots,
      dishes,
    );
    if (resolved?.kind !== "dish") throw new Error("expected a dish");
    expect(resolved.instance?.number).toBe(5);
    expect(resolved.marks).toEqual([{ table: "Okno", seat: null, label: "5", done: false }]);
    expect(resolved.offPlan).toBe(0);

    const offPlan = resolveSelection(
      { kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 7) },
      spots,
      dishes,
    );
    if (offPlan?.kind !== "dish") throw new Error("expected a dish");
    expect(offPlan.marks).toEqual([]);
    expect(offPlan.offPlan).toBe(1);
  });

  it("keeps a picked piece on the same plate when lines are added before it", () => {
    const picked = pieceOf(dishes, "rosół", 6); // Kominek, seat 2, Celina
    const earlier: OrderPlacementDto<RestaurantItemDto> = {
      ...placement,
      tables: [
        {
          name: "Altana",
          room: "Sala A",
          seats: [{ seat: 1, guestName: "Ela", items: [item("Rosół", 2)] }],
          tableItems: [],
        },
        ...placement.tables,
      ],
    };
    const laterSpots = servingSpots(earlier);
    const resolved = resolveSelection(
      { kind: "dish", dish: "rosół", instance: picked },
      laterSpots,
      dishInstances(laterSpots),
    );
    if (resolved?.kind !== "dish") throw new Error("expected a dish");
    expect(resolved.instance?.number).toBe(8);
    expect(resolved.marks).toEqual([{ table: "Kominek", seat: 2, label: "8", done: true }]);
  });

  it("falls back to all instances when the chosen piece is gone", () => {
    const resolved = resolveSelection(
      { kind: "dish", dish: "schabowy", instance: pieceOf(dishes, "schabowy", 4) },
      spots,
      dishes,
    );
    if (resolved?.kind !== "dish") throw new Error("expected a dish");
    expect(resolved.instance).toBeNull();
    expect(resolved.marks).toEqual([{ table: "Okno", seat: 3, label: null, done: false }]);
  });

  it("marks a line's place", () => {
    const resolved = resolveSelection({ kind: "spot", key: "table:Okno:0" }, spots, dishes);
    expect(resolved?.marks).toEqual([{ table: "Okno", seat: null, label: null, done: false }]);
    const unplaced = resolveSelection({ kind: "spot", key: "unplaced:guest:Daria:0" }, spots, dishes);
    expect(unplaced?.marks).toEqual([]);
  });
});

describe("describeSelection", () => {
  const spots = servingSpots(placement);
  const dishes = dishInstances(spots);
  const caption = (selection: Parameters<typeof resolveSelection>[0], locale: "pl" | "en" = "pl") => {
    const resolved = resolveSelection(selection, spots, dishes);
    return resolved ? describeSelection(resolved, locale) : null;
  };

  it("names the dish, the piece and its place in both languages", () => {
    expect(caption({ kind: "dish", dish: "rosół", instance: null })).toBe("Rosół — wszystkie (8)");
    expect(caption({ kind: "dish", dish: "rosół", instance: null }, "en")).toBe("Rosół — all 8");
    expect(caption({ kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 2) })).toBe(
      "Rosół 2/8 → Stolik Okno · miejsce 3 · Bartek",
    );
    expect(caption({ kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 4) }, "en")).toBe(
      "Rosół 4/8 → Table Okno · middle of the table",
    );
    expect(caption({ kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 6) }, "en")).toBe(
      "Rosół 6/8 → Table Kominek · seat 2 · Celina (served)",
    );
    expect(caption({ kind: "dish", dish: "rosół", instance: pieceOf(dishes, "rosół", 7) })).toBe(
      "Rosół 7/8 → Daria — nie ma na planie",
    );
    expect(caption({ kind: "dish", dish: "schabowy", instance: null })).toBe(
      "Schabowy → Stolik Okno · miejsce 3 · Bartek",
    );
    expect(caption({ kind: "spot", key: "seat:Okno:3:0" }, "en")).toBe("rosół × 2 → Table Okno · seat 3 · Bartek");
    expect(caption({ kind: "spot", key: "unassigned:0" }, "en")).toBe("Rosół × 1 → No place assigned");
  });

  it("has short place names for the pieces", () => {
    const soup = dishes.get("rosół")?.instances ?? [];
    expect(soup.map((one) => describePlaceShort(one.place))).toEqual([
      "Okno · m. 1 · Ania",
      "Okno · m. 3 · Bartek",
      "Okno · m. 3 · Bartek",
      "Okno · środek stołu",
      "Okno · środek stołu",
      "Kominek · m. 2 · Celina",
      "Daria · poza planem",
      "bez miejsca",
    ]);
    expect(describePlaceShort(soup[3].place, "en")).toBe("Okno · middle");
  });
});
