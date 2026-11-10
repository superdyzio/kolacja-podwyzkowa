import { describe, expect, it } from "vitest";
import type { DrinkItemDto } from "@/types";
import {
  billTotalGrosze,
  drinkQuantityMessage,
  drinkTotals,
  isValidDrinkQuantity,
  MAX_DRINK_NAME_LENGTH,
  parseDrinkName,
  tooManyDrinksMessage,
} from "./drinks";
import { toDrinkInput, toDrinkPatch } from "./input";
import { dishSuggestions } from "./rules";
import { formatServedSummary } from "./summary";

function drink(id: number, fields: Partial<DrinkItemDto> = {}): DrinkItemDto {
  return { id, name: "Piwo", quantity: 1, unitPriceGrosze: 1_400, ...fields };
}

describe("drink rules (bill-drinks)", () => {
  it("normalizes and bounds the name", () => {
    expect(parseDrinkName("  Piwo   0,5 l ")).toEqual({ ok: true, value: "Piwo 0,5 l" });
    expect(parseDrinkName("   ")).toEqual({ ok: false, message: "Wpisz nazwę napoju." });
    expect(parseDrinkName(" ", "en")).toEqual({ ok: false, message: "Enter the drink name." });
    expect(parseDrinkName("a".repeat(MAX_DRINK_NAME_LENGTH)).ok).toBe(true);
    expect(parseDrinkName("a".repeat(MAX_DRINK_NAME_LENGTH + 1))).toEqual({
      ok: false,
      message: "Nazwa napoju może mieć najwyżej 80 znaków.",
    });
  });

  it("takes quantities from 1 to 999", () => {
    expect([1, 99, 100, 999].every(isValidDrinkQuantity)).toBe(true);
    expect([0, 1000, 1.5, -1, Number.NaN].some(isValidDrinkQuantity)).toBe(false);
    expect(drinkQuantityMessage()).toBe("Ilość to liczba od 1 do 999.");
    expect(tooManyDrinksMessage("en")).toBe("The drinks list can have at most 200 lines.");
  });

  it("adds up the drinks and the bill", () => {
    expect(drinkTotals([])).toEqual({ lines: 0, quantity: 0, totalGrosze: 0 });
    const totals = drinkTotals([drink(1, { quantity: 12 }), drink(2, { quantity: 2, unitPriceGrosze: 12_990 })]);
    expect(totals).toEqual({ lines: 2, quantity: 14, totalGrosze: 12 * 1_400 + 2 * 12_990 });
    expect(billTotalGrosze({ totalGrosze: 184_000 }, totals)).toBe(184_000 + 42_780);
  });

  it("suggests the drinks entered before with their newest price", () => {
    expect(
      dishSuggestions([drink(1), drink(3, { name: "piwo", unitPriceGrosze: 1_500 }), drink(2, { name: "Cola" })]),
    ).toEqual([
      { name: "Cola", unitPriceGrosze: 1_400 },
      { name: "piwo", unitPriceGrosze: 1_500 },
    ]);
  });

  it("turns request bodies into inputs, with the form's messages", () => {
    // No price in the body since client-restaurant-split: the route adds the venue's price of the name.
    expect(toDrinkInput({ name: " Piwo ", quantity: 6 })).toEqual({
      ok: true,
      value: { name: "Piwo", quantity: 6 },
    });
    expect(toDrinkInput({ name: "Piwo", quantity: 1000 }, "en")).toEqual({
      ok: false,
      message: "The quantity is a number from 1 to 999.",
    });
    expect(toDrinkInput({ name: "", quantity: 1 })).toEqual({
      ok: false,
      message: "Wpisz nazwę napoju.",
    });
    expect(toDrinkPatch({ quantity: 3 })).toEqual({ ok: true, value: { quantity: 3 } });
  });

  it("sums up the dishes under the bill without repeating their amount", () => {
    expect(formatServedSummary({ lines: 9, quantity: 10, deliveredQuantity: 1, totalGrosze: 51_000 })).toBe(
      "9 pozycji · wydane 1 z 10 szt.",
    );
    expect(formatServedSummary({ lines: 1, quantity: 2, deliveredQuantity: 2, totalGrosze: 100 }, "en")).toBe(
      "1 line · served 2 of 2 pcs",
    );
    expect(formatServedSummary({ lines: 0, quantity: 0, deliveredQuantity: 0, totalGrosze: 0 })).toBeNull();
  });
});
