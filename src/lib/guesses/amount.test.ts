import { describe, expect, it } from "vitest";
import {
  AMOUNT_EMPTY_MESSAGE,
  AMOUNT_INVALID_MESSAGE,
  AMOUNT_NEGATIVE_MESSAGE,
  AMOUNT_TOO_LARGE_MESSAGE,
  MAX_AMOUNT_GROSZE,
  describeDifference,
  formatAmount,
  formatAmountInput,
  parseAmount,
} from "./amount";

const NBSP = "\u00a0";

function grosze(text: string): number | string {
  const result = parseAmount(text);
  return result.ok ? result.grosze : result.message;
}

describe("parseAmount", () => {
  it.each([
    ["1500", 150_000],
    ["1 500", 150_000],
    [`1${NBSP}500`, 150_000],
    ["1\u202f500", 150_000],
    ["1499,99", 149_999],
    ["1499.99", 149_999],
    ["1 499,99", 149_999],
    ["1 499,99 zł", 149_999],
    ["1 499,99zł", 149_999],
    ["1499,99 ZŁ", 149_999],
    ["1500 zl", 150_000],
    ["1500 PLN", 150_000],
    ["1500,-", 150_000],
    ["1500,- zł", 150_000],
    ["  1500  ", 150_000],
    ["0", 0],
    ["0,00", 0],
    ["0,5", 50],
    ["0.5", 50],
    ["4,35", 435],
    ["0,29", 29],
    ["1,1", 110],
    ["0,01", 1],
    ["007", 700],
    ["10 000 000", MAX_AMOUNT_GROSZE],
    ["10000000,00", MAX_AMOUNT_GROSZE],
  ])("reads %j as %i grosze", (text, expected) => {
    expect(grosze(text)).toBe(expected);
  });

  it.each([
    ["", AMOUNT_EMPTY_MESSAGE],
    ["   ", AMOUNT_EMPTY_MESSAGE],
    ["-5", AMOUNT_NEGATIVE_MESSAGE],
    ["- 5", AMOUNT_NEGATIVE_MESSAGE],
    ["\u22125", AMOUNT_NEGATIVE_MESSAGE],
    ["-0,01 zł", AMOUNT_NEGATIVE_MESSAGE],
    ["abc", AMOUNT_INVALID_MESSAGE],
    ["zł", AMOUNT_INVALID_MESSAGE],
    ["1.500", AMOUNT_INVALID_MESSAGE],
    ["1,999", AMOUNT_INVALID_MESSAGE],
    ["1.500,50", AMOUNT_INVALID_MESSAGE],
    ["1,2,3", AMOUNT_INVALID_MESSAGE],
    ["1500.", AMOUNT_INVALID_MESSAGE],
    [",50", AMOUNT_INVALID_MESSAGE],
    ["1e3", AMOUNT_INVALID_MESSAGE],
    ["+100", AMOUNT_INVALID_MESSAGE],
    ["12abc", AMOUNT_INVALID_MESSAGE],
    ["10000000,01", AMOUNT_TOO_LARGE_MESSAGE],
    ["10 000 001", AMOUNT_TOO_LARGE_MESSAGE],
    ["999999999999999999999", AMOUNT_TOO_LARGE_MESSAGE],
  ])("refuses %j with a Polish message", (text, message) => {
    expect(grosze(text)).toBe(message);
  });

  it("round-trips every edit-field prefill", () => {
    for (const value of [0, 1, 29, 50, 435, 99_999, 150_000, 149_999, 123_456, MAX_AMOUNT_GROSZE]) {
      expect(grosze(formatAmountInput(value))).toBe(value);
    }
  });

  it("parses back what formatAmount displays", () => {
    for (const value of [0, 7, 149_999, 777_777, MAX_AMOUNT_GROSZE]) {
      expect(grosze(formatAmount(value))).toBe(value);
    }
  });
});

describe("formatAmount", () => {
  it.each([
    [0, `0,00${NBSP}zł`],
    [5, `0,05${NBSP}zł`],
    [150_000, `1${NBSP}500,00${NBSP}zł`],
    [149_999, `1${NBSP}499,99${NBSP}zł`],
    [99_999, `999,99${NBSP}zł`],
    [12_345_678, `123${NBSP}456,78${NBSP}zł`],
    [MAX_AMOUNT_GROSZE, `10${NBSP}000${NBSP}000,00${NBSP}zł`],
  ])("formats %i grosze as %j", (value, expected) => {
    expect(formatAmount(value)).toBe(expected);
  });
});

describe("formatAmountInput", () => {
  it("drops ,00 for whole amounts and never groups", () => {
    expect(formatAmountInput(150_000)).toBe("1500");
    expect(formatAmountInput(149_999)).toBe("1499,99");
    expect(formatAmountInput(50)).toBe("0,50");
    expect(formatAmountInput(0)).toBe("0");
  });
});

describe("describeDifference", () => {
  it("says how far and in which direction", () => {
    expect(describeDifference(0)).toBe("dokładnie!");
    expect(describeDifference(-5_000)).toBe(`o 50,00${NBSP}zł za mało`);
    expect(describeDifference(150_001)).toBe(`o 1${NBSP}500,01${NBSP}zł za dużo`);
    expect(describeDifference(1)).toBe(`o 0,01${NBSP}zł za dużo`);
  });
});
