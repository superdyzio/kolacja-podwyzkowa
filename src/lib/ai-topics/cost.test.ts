import { describe, expect, it } from "vitest";
import { estimateSpend, formatSpend, formatTokens, formatUsd, MODEL_PRICES } from "./cost";

const NBSP = " ";

describe("AI cost estimate", () => {
  it("prices the default model at Anthropic's list price", () => {
    // $0.10 / $0.50 per million tokens = 100 / 500 nano-dollars per token.
    expect(MODEL_PRICES["claude-haiku-5-5"]).toEqual({ input: 100, output: 500 });
  });

  it("sums the tokens and the cost per model", () => {
    expect(estimateSpend([])).toEqual({ inputTokens: 0, outputTokens: 0, costNanoUsd: 0 });
    expect(
      estimateSpend([
        { model: "claude-haiku-5-5", inputTokens: 30_000, outputTokens: 4000 },
        { model: "claude-sonnet-5-5", inputTokens: 1000, outputTokens: 100 },
      ]),
    ).toEqual({
      inputTokens: 31_000,
      outputTokens: 4100,
      // 30 000 × 100 + 4000 × 500 + 1000 × 2000 + 100 × 10 000
      costNanoUsd: 3_000_000 + 2_000_000 + 2_000_000 + 1_000_000,
    });
  });

  it("gives no estimate when a model without a price billed tokens", () => {
    expect(
      estimateSpend([
        { model: "claude-haiku-5-5", inputTokens: 300, outputTokens: 40 },
        { model: "claude-future-9", inputTokens: 300, outputTokens: 40 },
      ]),
    ).toEqual({ inputTokens: 600, outputTokens: 80, costNanoUsd: null });
    expect(estimateSpend([{ model: null, inputTokens: 1, outputTokens: 0 }]).costNanoUsd).toBeNull();
    expect(estimateSpend([{ model: "constructor", inputTokens: 1, outputTokens: 0 }]).costNanoUsd).toBeNull();
    // Rows that billed nothing never spoil the estimate.
    expect(estimateSpend([{ model: "claude-future-9", inputTokens: 0, outputTokens: 0 }]).costNanoUsd).toBe(0);
  });

  it("formats dollars in Polish", () => {
    expect(formatUsd(0)).toBe(`0${NBSP}USD`);
    expect(formatUsd(10_000)).toBe(`<${NBSP}0,0001${NBSP}USD`);
    expect(formatUsd(100_000)).toBe(`0,0001${NBSP}USD`);
    expect(formatUsd(12_345_678)).toBe(`0,0123${NBSP}USD`);
    expect(formatUsd(1_650_000)).toBe(`0,0017${NBSP}USD`);
    expect(formatUsd(80_000_000)).toBe(`0,0800${NBSP}USD`);
    expect(formatUsd(1_234_567_890)).toBe(`1,23${NBSP}USD`);
    // Just below a dollar but rounding to one: two decimals, not „1,0000”.
    expect(formatUsd(999_949_999)).toBe(`0,9999${NBSP}USD`);
    expect(formatUsd(999_960_000)).toBe(`1,00${NBSP}USD`);
  });

  it("formats tokens with the Polish plural", () => {
    expect(formatTokens(1)).toBe(`1${NBSP}token`);
    expect(formatTokens(3)).toBe(`3${NBSP}tokeny`);
    expect(formatTokens(12_400)).toBe(`12${NBSP}400${NBSP}tokenów`);
  });

  it("builds the organizer's cost line", () => {
    expect(formatSpend({ inputTokens: 10_000, outputTokens: 2400, costNanoUsd: 2_200_000 })).toBe(
      `≈${NBSP}0,0022${NBSP}USD (12${NBSP}400${NBSP}tokenów)`,
    );
    expect(formatSpend({ inputTokens: 0, outputTokens: 0, costNanoUsd: 0 })).toBe(
      `≈${NBSP}0${NBSP}USD (0${NBSP}tokenów)`,
    );
    expect(formatSpend({ inputTokens: 300, outputTokens: 40, costNanoUsd: null })).toBe(
      `340${NBSP}tokenów — brak cennika dla tego modelu`,
    );
  });
});
