import { displayNameLength } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import type { DrinkItemDto, DrinkTotalsDto, OrderTotalsDto } from "@/types";
import { drinkMessages, orderMessages } from "./messages";
import { normalizeOrderText, type TextResult } from "./rules";

// Drink-line rules (bill-drinks), shared by the DB service, the API routes and the organizer's form. Pure functions
// only: no DB, no `astro:*`. The DB checks the same bounds (migration 20261108120000_bill_drinks.sql). The name is
// normalized like a dish name; the price is the dishes' unit price (parseUnitPrice, same cap); the quantity goes higher
// than a dish's (a round of beers for 40 people is one line).

export const MAX_DRINK_ITEMS = 200;
export const MAX_DRINK_NAME_LENGTH = 80;
export const MIN_DRINK_QUANTITY = 1;
export const MAX_DRINK_QUANTITY = 999;

export function parseDrinkName(raw: string, locale: Locale = "pl"): TextResult {
  const value = normalizeOrderText(raw);
  if (value === "") {
    return { ok: false, message: drinkMessages(locale).nameEmpty };
  }
  if (displayNameLength(value) > MAX_DRINK_NAME_LENGTH) {
    return { ok: false, message: drinkMessages(locale).nameTooLong(MAX_DRINK_NAME_LENGTH) };
  }
  return { ok: true, value };
}

export function isValidDrinkQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= MIN_DRINK_QUANTITY && quantity <= MAX_DRINK_QUANTITY;
}

export function drinkQuantityMessage(locale: Locale = "pl"): string {
  return orderMessages(locale).quantity(MIN_DRINK_QUANTITY, MAX_DRINK_QUANTITY);
}

export function tooManyDrinksMessage(locale: Locale = "pl"): string {
  return drinkMessages(locale).tooMany(MAX_DRINK_ITEMS);
}

export function drinkTotals(drinks: readonly DrinkItemDto[]): DrinkTotalsDto {
  let quantity = 0;
  let totalGrosze = 0;
  for (const drink of drinks) {
    quantity += drink.quantity;
    totalGrosze += drink.quantity * drink.unitPriceGrosze;
  }
  return { lines: drinks.length, quantity, totalGrosze };
}

// What the restaurant's bill should say: every dish line plus every drink line.
export function billTotalGrosze(
  totals: Pick<OrderTotalsDto, "totalGrosze">,
  drinks: Pick<DrinkTotalsDto, "totalGrosze">,
): number {
  return totals.totalGrosze + drinks.totalGrosze;
}
