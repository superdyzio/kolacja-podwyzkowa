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
    expect(toDrinkInput({ name: " Piwo ", price: "14,50 zł", quantity: 6 })).toEqual({
      ok: true,
      value: { name: "Piwo", quantity: 6, unitPriceGrosze: 1_450 },
    });
    expect(toDrinkInput({ name: "Piwo", price: "abc", quantity: 1 })).toEqual({
      ok: false,
      message: "Wpisz kwotę w złotych, np. 1500 albo 1499,99.",
    });
    expect(toDrinkInput({ name: "Piwo", price: "14", quantity: 1000 }, "en")).toEqual({
      ok: false,
      message: "The quantity is a number from 1 to 999.",
    });
    expect(toDrinkInput({ name: "", price: "14", quantity: 1 })).toEqual({
      ok: false,
      message: "Wpisz nazwę napoju.",
    });
    expect(toDrinkPatch({ quantity: 3 })).toEqual({ ok: true, value: { quantity: 3 } });
    expect(toDrinkPatch({ price: "0" })).toEqual({ ok: true, value: { unitPriceGrosze: 0 } });
  });
});
