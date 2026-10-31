import { describe, expect, it } from "vitest";
import type { AiProviderStatusDto } from "@/types";
import {
  EVENT_LIMIT_MESSAGE,
  FAILED_MESSAGE,
  formatAiTopicSummary,
  formatProvider,
  formatRemaining,
  formatUsage,
  GUEST_LIMIT_MESSAGE,
  MAX_EVENT_TOPICS,
  MAX_GUEST_TOPICS,
  toGuestQuota,
  toUsage,
} from "./limits";

const MOCK: AiProviderStatusDto = { kind: "mock", model: null, ready: true, problem: null };
const CLAUDE: AiProviderStatusDto = { kind: "anthropic", model: "claude-haiku-5-5", ready: true, problem: null };
const NO_KEY: AiProviderStatusDto = { kind: "anthropic", model: "claude-haiku-5-5", ready: false, problem: "x" };
const INVALID: AiProviderStatusDto = { kind: null, model: null, ready: false, problem: "x" };
const NO_SPEND = { inputTokens: 0, outputTokens: 0, costNanoUsd: 0, lastFailureHint: null };

function usage(used: number, failed: number, extras: Partial<typeof NO_SPEND> | object = {}) {
  return { used, limit: 300, failed, guestLimit: 5, ...NO_SPEND, ...extras };
}

describe("AI topic limits", () => {
  it("are the PRD numbers", () => {
    expect(MAX_GUEST_TOPICS).toBe(5);
    expect(MAX_EVENT_TOPICS).toBe(300);
  });

  it("maps a usage row to the guest's quota", () => {
    expect(toGuestQuota({ event_used: 10, event_failed: 2, guest_used: 2, guest_busy: false })).toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
      eventExhausted: false,
    });
    expect(toGuestQuota({ event_used: 300, event_failed: 0, guest_used: 7, guest_busy: false })).toEqual({
      limit: 5,
      used: 5,
      remaining: 0,
      eventExhausted: true,
    });
  });

  it("maps a usage row to the evening's usage", () => {
    const row = { event_used: 12, event_failed: 3, guest_used: 0, guest_busy: false };
    expect(toUsage(row)).toEqual({
      used: 12,
      limit: 300,
      failed: 3,
      guestLimit: 5,
      inputTokens: 0,
      outputTokens: 0,
      costNanoUsd: 0,
      lastFailureHint: null,
    });
    const extras = { inputTokens: 900, outputTokens: 150, costNanoUsd: 165_000, lastFailureHint: "Brak." };
    expect(toUsage(row, extras)).toEqual({ used: 12, limit: 300, failed: 3, guestLimit: 5, ...extras });
  });

  it("formats the remaining count, the usage and the shell summary in Polish", () => {
    expect(formatRemaining({ limit: 5, used: 2, remaining: 3, eventExhausted: false })).toBe("Zostało 3 z 5");
    expect(formatUsage(usage(12, 0))).toBe("Wykorzystano 12 z 300");
    expect(formatUsage(usage(12, 2))).toBe("Wykorzystano 12 z 300 · nieudane: 2");
    expect(formatAiTopicSummary(usage(4, 1), MOCK)).toBe("Tematy AI: 4 z 300 · atrapa AI");
    expect(formatProvider(CLAUDE)).toBe("Claude (claude-haiku-5-5)");
    expect(formatProvider(NO_KEY)).toBe("brak klucza API");
    expect(formatProvider(INVALID)).toBe("błędna konfiguracja AI");
  });

  it("adds the estimate and a failing AI to the shell summary", () => {
    const billed = { inputTokens: 9000, outputTokens: 1500, costNanoUsd: 1_650_000 };
    expect(formatAiTopicSummary(usage(12, 0, billed), CLAUDE)).toBe(
      "Tematy AI: 12 z 300 · Claude (claude-haiku-5-5) · ≈\u00a00,0017\u00a0USD",
    );
    expect(formatAiTopicSummary(usage(12, 3, { ...billed, lastFailureHint: "Skończyły się kredyty." }), CLAUDE)).toBe(
      "Tematy AI: 12 z 300 · Claude (claude-haiku-5-5) · ≈\u00a00,0017\u00a0USD · ostatnia próba nieudana",
    );
    // No price for the model: no estimate in the summary (the panel shows the tokens).
    expect(formatAiTopicSummary(usage(1, 0, { inputTokens: 10, outputTokens: 5, costNanoUsd: null }), CLAUDE)).toBe(
      "Tematy AI: 1 z 300 · Claude (claude-haiku-5-5)",
    );
  });

  it("says the limits and the failure rule clearly", () => {
    expect(GUEST_LIMIT_MESSAGE).toContain("5 z 5");
    expect(EVENT_LIMIT_MESSAGE).toContain("300");
    expect(FAILED_MESSAGE).toContain("nie zmniejszyła limitu");
    expect(FAILED_MESSAGE).toContain("Losuj pytanie");
  });
});
