import { formatAmount, parseAmount } from "@/lib/guesses/amount";
import { displayNameKey, displayNameLength, normalizeDisplayName } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import type { OrderItemDto, OrderTotalsDto } from "@/types";
import { orderMessages } from "./messages";
import { deliveredCount } from "./pieces";

// Order-line rules shared by the DB service, the API routes and the organizer UI (restaurant-orders). Pure functions
// only: no DB, no `astro:*`. The DB checks the same bounds (migration 20261102120000_restaurant_orders.sql).
//
// A dish name and a note are stored normalized like guest names (NFC, no invisible characters, single spaces,
// trimmed); lengths count code points like Postgres char_length(). Prices are integer grosze, typed like the guesses
// („49”, „49,90”, „49,90 zł”).

// scale-150: four lines per guest at MAX_GUESTS = 150, as v1 had at 100.
export const MAX_ORDER_ITEMS = 600;
export const MAX_DISH_LENGTH = 80;
export const MAX_NOTE_LENGTH = 120;
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;
// 100 000 zł for one portion is plenty; the DB allows the same.
export const MAX_UNIT_PRICE_GROSZE = 10_000_000;

// The Polish texts as constants (tests import them); the routes and the form use orderMessages(locale).
const pl = orderMessages("pl");
export const DISH_EMPTY_MESSAGE = pl.dishEmpty;
export const DISH_TOO_LONG_MESSAGE = pl.dishTooLong(MAX_DISH_LENGTH);
export const NOTE_TOO_LONG_MESSAGE = pl.noteTooLong(MAX_NOTE_LENGTH);
export const QUANTITY_MESSAGE = pl.quantity(MIN_QUANTITY, MAX_QUANTITY);
export const PRICE_TOO_LARGE_MESSAGE = pl.priceTooLarge(formatAmount(MAX_UNIT_PRICE_GROSZE));
export const TOO_MANY_ITEMS_MESSAGE = pl.tooManyItems(MAX_ORDER_ITEMS);
export const ORDER_ITEM_NOT_FOUND_MESSAGE = pl.itemNotFound;
export const PLACE_GONE_MESSAGE = pl.placeGone;

export function quantityMessage(locale: Locale = "pl"): string {
  return orderMessages(locale).quantity(MIN_QUANTITY, MAX_QUANTITY);
}

export function tooManyItemsMessage(locale: Locale = "pl"): string {
  return orderMessages(locale).tooManyItems(MAX_ORDER_ITEMS);
}

export const normalizeOrderText = normalizeDisplayName;

// The same dish however it is capitalised: „Schabowy” and „schabowy” are one line of the prep list.
export const dishKey = displayNameKey;

export type TextResult = { ok: true; value: string } | { ok: false; message: string };
export type NoteResult = { ok: true; value: string | null } | { ok: false; message: string };
export type PriceResult = { ok: true; grosze: number } | { ok: false; message: string };

export function parseDishName(raw: string, locale: Locale = "pl"): TextResult {
  const value = normalizeOrderText(raw);
  if (value === "") {
    return { ok: false, message: orderMessages(locale).dishEmpty };
  }
  if (displayNameLength(value) > MAX_DISH_LENGTH) {
    return { ok: false, message: orderMessages(locale).dishTooLong(MAX_DISH_LENGTH) };
  }
  return { ok: true, value };
}

// An empty note is no note (null).
export function parseNote(raw: string | null, locale: Locale = "pl"): NoteResult {
  const value = normalizeOrderText(raw ?? "");
  if (value === "") {
    return { ok: true, value: null };
  }
  if (displayNameLength(value) > MAX_NOTE_LENGTH) {
    return { ok: false, message: orderMessages(locale).noteTooLong(MAX_NOTE_LENGTH) };
  }
  return { ok: true, value };
}

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;
}

export function parseUnitPrice(text: string, locale: Locale = "pl"): PriceResult {
  const parsed = parseAmount(text, locale);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.grosze > MAX_UNIT_PRICE_GROSZE) {
    return { ok: false, message: orderMessages(locale).priceTooLarge(formatAmount(MAX_UNIT_PRICE_GROSZE)) };
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
    deliveredQuantity += deliveredCount(item);
  }
  return { lines: items.length, quantity, deliveredQuantity, totalGrosze };
}

const dishCollator = new Intl.Collator("pl", { numeric: true });

export interface DishSuggestion {
  name: string;
  unitPriceGrosze: number;
}

type PricedLine = Pick<OrderItemDto, "id" | "name" | "unitPriceGrosze">;

// The dishes already on the order for the form's autocomplete, each with the price of its newest line (highest id),
// in Polish order. bill-drinks: the drinks form uses it for the drinks the same way.
export function dishSuggestions(items: readonly PricedLine[]): DishSuggestion[] {
  const newest = new Map<string, PricedLine>();
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
