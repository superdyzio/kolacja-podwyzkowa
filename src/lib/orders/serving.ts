import type { Locale } from "@/lib/i18n/locale";
import type { OrderPlacementDto } from "@/types";
import { servingMessages } from "./messages";
import { dishKey } from "./rules";

// Where each dish goes, for highlighting on the drawn plan (serving-highlight), pure. A "spot" is one order line at its
// place (the placement of placement.ts flattened in its own order); an "instance" is ONE piece of a dish — a line of
// quantity 3 is three instances at the same place — numbered 1..n per dish in placement order, so the kitchen can pick
// each piece on its own. Only seats and tables of the published seating can be highlighted.

export interface ServingLine {
  name: string;
  note: string | null;
  quantity: number;
  delivered: boolean;
}

export type ServingPlace =
  | { kind: "seat"; table: string; room: string; seat: number; guestName: string }
  | { kind: "table"; table: string; room: string }
  | { kind: "unplaced"; group: "guest" | "table"; name: string }
  | { kind: "unassigned" };

export interface ServingSpot<T> {
  // Unique per placement (see servingSpots).
  key: string;
  item: T;
  place: ServingPlace;
}

export interface DishInstance<T> {
  // 1-based within the dish, in placement order.
  number: number;
  spotKey: string;
  item: T;
  place: ServingPlace;
}

export interface DishInstances<T> {
  dish: string;
  // The first-seen spelling.
  name: string;
  instances: DishInstance<T>[];
}

// A highlight on the drawing: a chair (seat) or the middle of a table (seat null), with the instance numbers to show.
export interface ServingMark {
  table: string;
  seat: number | null;
  label: string | null;
  // Everything here was already served.
  done: boolean;
}

export type ServingSelection = { kind: "dish"; dish: string; instance: number | null } | { kind: "spot"; key: string };

// Every line at its place, in placement order. keyOf gives a stable key (the organizer's line ids); without it the key
// is the line's position (the restaurant's lines carry no ids), which is enough to find it again after a refresh.
export function servingSpots<T>(placement: OrderPlacementDto<T>, keyOf?: (item: T) => string): ServingSpot<T>[] {
  const spots: ServingSpot<T>[] = [];
  const add = (position: string, item: T, place: ServingPlace) => {
    spots.push({ key: keyOf ? keyOf(item) : position, item, place });
  };
  for (const table of placement.tables) {
    for (const seat of table.seats) {
      seat.items.forEach((item, index) => {
        add(`seat:${table.name}:${String(seat.seat)}:${String(index)}`, item, {
          kind: "seat",
          table: table.name,
          room: table.room,
          seat: seat.seat,
          guestName: seat.guestName,
        });
      });
    }
    table.tableItems.forEach((item, index) => {
      add(`table:${table.name}:${String(index)}`, item, { kind: "table", table: table.name, room: table.room });
    });
  }
  for (const group of placement.unplaced) {
    group.items.forEach((item, index) => {
      add(`unplaced:${group.kind}:${group.name}:${String(index)}`, item, {
        kind: "unplaced",
        group: group.kind,
        name: group.name,
      });
    });
  }
  placement.unassigned.forEach((item, index) => {
    add(`unassigned:${String(index)}`, item, { kind: "unassigned" });
  });
  return spots;
}

// The instances of every dish (case-insensitive by name, like the prep list), keyed by dishKey. names: spellings to
// show (the prep list's, which takes the oldest line's); otherwise the first in placement order.
export function dishInstances<T extends ServingLine>(
  spots: readonly ServingSpot<T>[],
  names: readonly string[] = [],
): Map<string, DishInstances<T>> {
  const preferred = new Map(names.map((name) => [dishKey(name), name]));
  const dishes = new Map<string, DishInstances<T>>();
  for (const spot of spots) {
    const dish = dishKey(spot.item.name);
    let found = dishes.get(dish);
    if (!found) {
      found = { dish, name: preferred.get(dish) ?? spot.item.name, instances: [] };
      dishes.set(dish, found);
    }
    for (let piece = 0; piece < spot.item.quantity; piece += 1) {
      found.instances.push({
        number: found.instances.length + 1,
        spotKey: spot.key,
        item: spot.item,
        place: spot.place,
      });
    }
  }
  return dishes;
}

export function isOnPlan(place: ServingPlace): place is Extract<ServingPlace, { kind: "seat" | "table" }> {
  return place.kind === "seat" || place.kind === "table";
}

// "1–3, 5" from [1, 2, 3, 5] (any order).
export function formatInstanceNumbers(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  for (let index = 1; index <= sorted.length; index += 1) {
    if (index === sorted.length || sorted[index] !== sorted[index - 1] + 1) {
      const first = sorted[start];
      const last = sorted[index - 1];
      parts.push(last === first ? String(first) : `${String(first)}${last === first + 1 ? "," : "–"}${String(last)}`);
      start = index;
    }
  }
  return parts.join(",");
}

// The marks of some instances: one per place (and served state), labelled with their numbers when `numbered`.
export function instanceMarks<T extends ServingLine>(
  instances: readonly DishInstance<T>[],
  numbered: boolean,
): ServingMark[] {
  const marks = new Map<string, { table: string; seat: number | null; numbers: number[]; done: boolean }>();
  for (const instance of instances) {
    const { place } = instance;
    if (!isOnPlan(place)) {
      continue;
    }
    const seat = place.kind === "seat" ? place.seat : null;
    const done = instance.item.delivered;
    const key = `${place.table}\u0000${String(seat)}\u0000${String(done)}`;
    const mark = marks.get(key) ?? { table: place.table, seat, numbers: [], done };
    mark.numbers.push(instance.number);
    marks.set(key, mark);
  }
  return [...marks.values()].map(({ numbers, ...mark }) => ({
    ...mark,
    label: numbered ? formatInstanceNumbers(numbers) : null,
  }));
}

export type ResolvedSelection<T> =
  | {
      kind: "dish";
      name: string;
      // The chosen instance, or null for all of them.
      instance: DishInstance<T> | null;
      instances: DishInstance<T>[];
      marks: ServingMark[];
      // Chosen instances that have no place on the plan.
      offPlan: number;
    }
  | { kind: "spot"; spot: ServingSpot<T>; marks: ServingMark[] };

// What a selection points at in the current view, or null when it is gone (the dish or line no longer exists).
export function resolveSelection<T extends ServingLine>(
  selection: ServingSelection | null,
  spots: readonly ServingSpot<T>[],
  dishes: ReadonlyMap<string, DishInstances<T>>,
): ResolvedSelection<T> | null {
  if (selection === null) {
    return null;
  }
  if (selection.kind === "spot") {
    const spot = spots.find((candidate) => candidate.key === selection.key);
    if (!spot) {
      return null;
    }
    const marks = isOnPlan(spot.place)
      ? [
          {
            table: spot.place.table,
            seat: spot.place.kind === "seat" ? spot.place.seat : null,
            label: null,
            done: spot.item.delivered,
          },
        ]
      : [];
    return { kind: "spot", spot, marks };
  }
  const dish = dishes.get(selection.dish);
  if (!dish) {
    return null;
  }
  const instance =
    selection.instance === null ? null : (dish.instances.find((one) => one.number === selection.instance) ?? null);
  const chosen = instance ? [instance] : dish.instances;
  return {
    kind: "dish",
    name: dish.name,
    instance,
    instances: dish.instances,
    marks: instanceMarks(chosen, dish.instances.length > 1),
    offPlan: chosen.filter((one) => !isOnPlan(one.place)).length,
  };
}

// The tables a selection touches (the drawing fades the others).
export function markedTables(marks: readonly ServingMark[]): Set<string> {
  return new Set(marks.map((mark) => mark.table));
}

// Where a place is, in words: the caption over the plan…
export function describePlace(place: ServingPlace, locale: Locale = "pl"): string {
  const t = servingMessages(locale);
  switch (place.kind) {
    case "seat":
      return t.placeSeat(place.table, place.seat, place.guestName);
    case "table":
      return t.placeTable(place.table);
    case "unplaced":
      return t.placeUnplaced(place.name);
    case "unassigned":
      return t.placeUnassigned;
  }
}

// …and on a piece's button.
export function describePlaceShort(place: ServingPlace, locale: Locale = "pl"): string {
  const t = servingMessages(locale);
  switch (place.kind) {
    case "seat":
      return t.chipSeat(place.table, place.seat, place.guestName);
    case "table":
      return t.chipTable(place.table);
    case "unplaced":
      return t.chipUnplaced(place.name);
    case "unassigned":
      return t.chipUnassigned;
  }
}

// The caption of a selection: "Rosół — wszystkie (6)", "Rosół 2/6 → Stolik Okno · miejsce 3 · Bartek",
// "Rosół × 2 → …" (a line), "(wydane)" when served.
export function describeSelection<T extends ServingLine>(
  resolved: ResolvedSelection<T>,
  locale: Locale = "pl",
): string {
  const t = servingMessages(locale);
  const served = (item: ServingLine) => (item.delivered ? ` (${t.served})` : "");
  if (resolved.kind === "spot") {
    const { item, place } = resolved.spot;
    return `${item.name} × ${String(item.quantity)} → ${describePlace(place, locale)}${served(item)}`;
  }
  const { instances } = resolved;
  const one = resolved.instance ?? (instances.length === 1 ? instances[0] : null);
  if (!one) {
    return t.dishAll(resolved.name, instances.length);
  }
  const counter = instances.length > 1 ? ` ${String(one.number)}/${String(instances.length)}` : "";
  return `${resolved.name}${counter} → ${describePlace(one.place, locale)}${served(one.item)}`;
}
