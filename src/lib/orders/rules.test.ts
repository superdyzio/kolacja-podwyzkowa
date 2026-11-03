import { describe, expect, it } from "vitest";
import { formatAmount } from "@/lib/guesses/amount";
import type { OrderItemDto } from "@/types";
import { toOrderItemInput, toOrderItemPatch } from "./input";
import {
  DISH_EMPTY_MESSAGE,
  DISH_TOO_LONG_MESSAGE,
  dishSuggestions,
  findDish,
  isValidQuantity,
  lineTotal,
  NOTE_TOO_LONG_MESSAGE,
  orderTotals,
  parseDishName,
  parseNote,
  parseUnitPrice,
  PRICE_TOO_LARGE_MESSAGE,
  QUANTITY_MESSAGE,
} from "./rules";
import { describeToServe, formatOrderSummary } from "./summary";

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

describe("order texts", () => {
  it("normalizes dish names and refuses empty or too long ones", () => {
    expect(parseDishName("  Schabowy ​  z   ziemniakami ")).toEqual({ ok: true, value: "Schabowy z ziemniakami" });
    expect(parseDishName(" \t ")).toEqual({ ok: false, message: DISH_EMPTY_MESSAGE });
    expect(parseDishName("a".repeat(80)).ok).toBe(true);
    expect(parseDishName("a".repeat(81))).toEqual({ ok: false, message: DISH_TOO_LONG_MESSAGE });
  });

  it("turns an empty note into none and caps its length", () => {
    expect(parseNote("  ")).toEqual({ ok: true, value: null });
    expect(parseNote(null)).toEqual({ ok: true, value: null });
    expect(parseNote(" bez  cebuli ")).toEqual({ ok: true, value: "bez cebuli" });
    expect(parseNote("x".repeat(121))).toEqual({ ok: false, message: NOTE_TOO_LONG_MESSAGE });
  });

  it("accepts whole quantities from 1 to 99", () => {
    expect([0, 1, 99, 100, 1.5, Number.NaN].map(isValidQuantity)).toEqual([false, true, true, false, false, false]);
  });

  it("reads prices like the guesses and caps them at 100 000 zł", () => {
    expect(parseUnitPrice("49,90 zł")).toEqual({ ok: true, grosze: 4_990 });
    expect(parseUnitPrice("0")).toEqual({ ok: true, grosze: 0 });
    expect(parseUnitPrice("100000")).toEqual({ ok: true, grosze: 10_000_000 });
    expect(parseUnitPrice("100000,01")).toEqual({ ok: false, message: PRICE_TOO_LARGE_MESSAGE });
    expect(parseUnitPrice("abc").ok).toBe(false);
  });
});

describe("totals", () => {
  it("sums line totals, quantities and what was delivered", () => {
    const items = [line(1, { quantity: 2 }), line(2, { unitPriceGrosze: 1_250, quantity: 3, delivered: true })];
    expect(lineTotal(items[1])).toBe(3_750);
    expect(orderTotals(items)).toEqual({ lines: 2, quantity: 5, deliveredQuantity: 3, totalGrosze: 13_550 });
    expect(orderTotals([])).toEqual({ lines: 0, quantity: 0, deliveredQuantity: 0, totalGrosze: 0 });
  });

  it("describes the order for the shell and the restaurant", () => {
    expect(formatOrderSummary(orderTotals([]))).toBe("Brak zamówień");
    expect(formatOrderSummary(orderTotals([line(1, { quantity: 2 }), line(2, { delivered: true })]))).toBe(
      "2 pozycje · 147,00 zł · wydane 1 z 3 szt.",
    );
    expect(describeToServe(0, 0)).toBe("Brak zamówień");
    expect(describeToServe(0, 4)).toBe("Wszystko wydane");
    expect(describeToServe(3, 4)).toBe("Do wydania: 3 z 4 szt.");
  });
});

describe("dish suggestions", () => {
  it("lists each dish once with the price of its newest line, in Polish order", () => {
    const items = [
      line(1, { name: "Żurek", unitPriceGrosze: 2_000 }),
      line(3, { name: "schabowy", unitPriceGrosze: 5_200 }),
      line(2, { name: "Schabowy", unitPriceGrosze: 4_900 }),
    ];
    const suggestions = dishSuggestions(items);
    expect(suggestions).toEqual([
      { name: "schabowy", unitPriceGrosze: 5_200 },
      { name: "Żurek", unitPriceGrosze: 2_000 },
    ]);
    expect(findDish(suggestions, " SCHABOWY ")).toEqual({ name: "schabowy", unitPriceGrosze: 5_200 });
    expect(findDish(suggestions, "")).toBeNull();
    expect(findDish(suggestions, "Pierogi")).toBeNull();
  });
});

describe("English messages", () => {
  it("refuses in the request's language", () => {
    expect(parseDishName(" ", "en")).toEqual({ ok: false, message: "Enter the dish name." });
    expect(parseNote("x".repeat(121), "en")).toEqual({
      ok: false,
      message: "A note can be at most 120 characters long.",
    });
    expect(toOrderItemPatch({ quantity: 0 }, "en")).toEqual({
      ok: false,
      message: "The quantity is a number from 1 to 99.",
    });
    expect(parseUnitPrice("100000,01", "en")).toEqual({
      ok: false,
      message: `The price can be at most ${formatAmount(10_000_000)}.`,
    });
  });
});

describe("request bodies", () => {
  it("builds a full input with normalized texts and grosze", () => {
    expect(
      toOrderItemInput({ name: " Woda ", note: "", quantity: 2, price: "12", assignment: { tableId: 3 } }),
    ).toEqual({
      ok: true,
      value: { name: "Woda", note: null, quantity: 2, unitPriceGrosze: 1_200, assignment: { tableId: 3 } },
    });
    expect(toOrderItemInput({ name: "Woda", quantity: 1, price: "1" })).toMatchObject({
      ok: true,
      value: { assignment: null, note: null },
    });
  });

  it("returns the first form message", () => {
    expect(toOrderItemInput({ name: "", quantity: 1, price: "1" })).toEqual({ ok: false, message: DISH_EMPTY_MESSAGE });
    expect(toOrderItemPatch({ quantity: 0 })).toEqual({ ok: false, message: QUANTITY_MESSAGE });
    expect(toOrderItemPatch({ price: "-5" }).ok).toBe(false);
  });

  it("keeps a patch to the fields it names", () => {
    expect(toOrderItemPatch({ delivered: true })).toEqual({ ok: true, value: { delivered: true } });
    expect(toOrderItemPatch({ assignment: null, note: null })).toEqual({
      ok: true,
      value: { assignment: null, note: null },
    });
  });
});
