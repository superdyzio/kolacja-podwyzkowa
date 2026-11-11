import { describe, expect, it } from "vitest";
import { priceMessages } from "./messages";
import { newestPriceFor, priceAfterRename, priceList, PRICE_KINDS } from "./prices";

const line = (id: number, name: string, unitPriceGrosze: number) => ({ id, name, unitPriceGrosze });
const drink = (id: number, name: string, unitPriceGrosze: number) => ({ id, name, quantity: 1, unitPriceGrosze });

describe("event prices (client-restaurant-split)", () => {
  const lines = [line(1, "Pierogi", 3_200), line(5, "pierogi", 3_600), line(3, "Żurek", 1_900)];

  it("prices a new line by the newest line of its name, any letter case, else 0", () => {
    expect(PRICE_KINDS).toEqual(["dish", "drink"]);
    expect(newestPriceFor(lines, "PIEROGI")).toBe(3_600);
    expect(newestPriceFor(lines, "  Żurek ")).toBe(1_900);
    expect(newestPriceFor(lines, "Pierogi ruskie")).toBe(0);
    expect(newestPriceFor(lines, "")).toBe(0);
    expect(newestPriceFor([], "Pierogi")).toBe(0);
    // The line being renamed does not price itself.
    expect(newestPriceFor(lines, "pierogi", 5)).toBe(3_200);
  });

  it("keeps a renamed line's price for a spelling fix, else takes the new name's", () => {
    expect(priceAfterRename(lines, 5, "PIEROGI")).toBeNull();
    expect(priceAfterRename(lines, 3, "Pierogi")).toBe(3_600);
    expect(priceAfterRename(lines, 3, "Barszcz")).toBe(0);
    expect(priceAfterRename(lines, 99, "Pierogi")).toBeNull();
  });

  it("lists one row per name: dishes then drinks, Polish order, newest spelling and price, mixed prices flagged", () => {
    expect(priceList(lines, [drink(2, "Woda", 800), drink(4, "Cola", 900), drink(7, "woda", 800)])).toEqual([
      { kind: "dish", name: "pierogi", priceGrosze: 3_600, mixed: true, lines: 2 },
      { kind: "dish", name: "Żurek", priceGrosze: 1_900, mixed: false, lines: 1 },
      { kind: "drink", name: "Cola", priceGrosze: 900, mixed: false, lines: 1 },
      { kind: "drink", name: "woda", priceGrosze: 800, mixed: false, lines: 2 },
    ]);
    expect(priceList([], [])).toEqual([]);
  });

  it("speaks both languages", () => {
    expect(priceMessages().lines(5)).toBe("5 pozycji");
    expect(priceMessages("en").lines(1)).toBe("1 line");
    expect(priceMessages().fromList("36,00 zł")).toContain("cennika lokalu");
    expect(priceMessages("en").byVenue).toContain("venue");
  });
});
