import { formatAmount, parseAmount } from "@/lib/guesses/amount";
import { displayNameKey, displayNameLength, normalizeDisplayName } from "@/lib/guests/names";
import type { OrderItemDto, OrderTotalsDto } from "@/types";

// Order-line rules shared by the DB service, the API routes and the organizer UI (restaurant-orders). Pure functions
// only: no DB, no `astro:*`. The DB checks the same bounds (migration 20261102120000_restaurant_orders.sql).
//
// A dish name and a note are stored normalized like guest names (NFC, no invisible characters, single spaces,
// trimmed); lengths count code points like Postgres char_length(). Prices are integer grosze, typed like the guesses
// („49”, „49,90”, „49,90 zł”).

export const MAX_ORDER_ITEMS = 400;
export const MAX_DISH_LENGTH = 80;
export const MAX_NOTE_LENGTH = 120;
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;
// 100 000 zł for one portion is plenty; the DB allows the same.
export const MAX_UNIT_PRICE_GROSZE = 10_000_000;

export const DISH_EMPTY_MESSAGE = "Wpisz nazwę dania.";
export const DISH_TOO_LONG_MESSAGE = `Nazwa dania może mieć najwyżej ${MAX_DISH_LENGTH} znaków.`;
export const NOTE_TOO_LONG_MESSAGE = `Uwaga może mieć najwyżej ${MAX_NOTE_LENGTH} znaków.`;
export const QUANTITY_MESSAGE = `Ilość to liczba od ${MIN_QUANTITY} do ${MAX_QUANTITY}.`;
export const PRICE_TOO_LARGE_MESSAGE = `Cena może wynieść najwyżej ${formatAmount(MAX_UNIT_PRICE_GROSZE)}.`;
export const TOO_MANY_ITEMS_MESSAGE = `Zamówienie może mieć najwyżej ${MAX_ORDER_ITEMS} pozycji.`;
export const ORDER_ITEM_NOT_FOUND_MESSAGE = "Nie znaleziono pozycji zamówienia.";
export const PLACE_GONE_MESSAGE = "Nie ma już takiego gościa albo stolika.";

export const normalizeOrderText = normalizeDisplayName;

// The same dish however it is capitalised: „Schabowy” and „schabowy” are one line of the prep list.
export const dishKey = displayNameKey;

export type TextResult = { ok: true; value: string } | { ok: false; message: string };
export type NoteResult = { ok: true; value: string | null } | { ok: false; message: string };
export type PriceResult = { ok: true; grosze: number } | { ok: false; message: string };

export function parseDishName(raw: string): TextResult {
  const value = normalizeOrderText(raw);
  if (value === "") {
    return { ok: false, message: DISH_EMPTY_MESSAGE };
  }
  if (displayNameLength(value) > MAX_DISH_LENGTH) {
    return { ok: false, message: DISH_TOO_LONG_MESSAGE };
  }
  return { ok: true, value };
}

// An empty note is no note (null).
export function parseNote(raw: string | null): NoteResult {
  const value = normalizeOrderText(raw ?? "");
  if (value === "") {
    return { ok: true, value: null };
  }
  if (displayNameLength(value) > MAX_NOTE_LENGTH) {
    return { ok: false, message: NOTE_TOO_LONG_MESSAGE };
  }
  return { ok: true, value };
}

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;
}

export function parseUnitPrice(text: string): PriceResult {
  const parsed = parseAmount(text);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.grosze > MAX_UNIT_PRICE_GROSZE) {
    return { ok: false, message: PRICE_TOO_LARGE_MESSAGE };
  }
  return parsed;
}

export function lineTotal(item: Pick<OrderItemDto, "quantity" | "unitPriceGrosze">): number {
  return item.quantity * item.unitPriceGrosze;
}

export function orderTotals(items: readonly OrderItemDto[]): OrderTotalsDto {
  let quantity = 0;
  let deliveredQuantity = 0;
  let totalGrosze = 0;
  for (const item of items) {
    quantity += item.quantity;
    totalGrosze += lineTotal(item);
    if (item.delivered) {
      deliveredQuantity += item.quantity;
    }
  }
  return { lines: items.length, quantity, deliveredQuantity, totalGrosze };
}

const dishCollator = new Intl.Collator("pl", { numeric: true });

export interface DishSuggestion {
  name: string;
  unitPriceGrosze: number;
}

// The dishes already on the order for the form's autocomplete, each with the price of its newest line (highest id),
// in Polish order.
export function dishSuggestions(items: readonly OrderItemDto[]): DishSuggestion[] {
  const newest = new Map<string, OrderItemDto>();
  for (const item of items) {
    const key = dishKey(item.name);
    const known = newest.get(key);
    if (!known || item.id > known.id) {
      newest.set(key, item);
    }
  }
  return [...newest.values()]
    .map((item) => ({ name: item.name, unitPriceGrosze: item.unitPriceGrosze }))
    .sort((a, b) => dishCollator.compare(a.name, b.name));
}

export function compareDishNames(a: string, b: string): number {
  return dishCollator.compare(a, b);
}

// The suggestion whose name matches what was typed (any letter case), or null.
export function findDish(suggestions: readonly DishSuggestion[], typed: string): DishSuggestion | null {
  const key = dishKey(typed);
  return key === "" ? null : (suggestions.find((dish) => dishKey(dish.name) === key) ?? null);
}
