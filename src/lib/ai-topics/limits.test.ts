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
    expect(toUsage({ event_used: 12, event_failed: 3, guest_used: 0, guest_busy: false })).toEqual({
      used: 12,
      limit: 300,
      failed: 3,
      guestLimit: 5,
    });
  });

  it("formats the remaining count, the usage and the shell summary in Polish", () => {
    expect(formatRemaining({ limit: 5, used: 2, remaining: 3, eventExhausted: false })).toBe("Zostało 3 z 5");
    expect(formatUsage({ used: 12, limit: 300, failed: 0, guestLimit: 5 })).toBe("Wykorzystano 12 z 300");
    expect(formatUsage({ used: 12, limit: 300, failed: 2, guestLimit: 5 })).toBe("Wykorzystano 12 z 300 · nieudane: 2");
    expect(formatAiTopicSummary({ used: 4, limit: 300, failed: 1, guestLimit: 5 }, MOCK)).toBe(
      "Tematy AI: 4 z 300 · atrapa AI",
    );
    expect(formatProvider(CLAUDE)).toBe("Claude (claude-haiku-5-5)");
    expect(formatProvider(NO_KEY)).toBe("brak klucza API");
    expect(formatProvider(INVALID)).toBe("błędna konfiguracja AI");
  });

  it("says the limits and the failure rule clearly", () => {
    expect(GUEST_LIMIT_MESSAGE).toContain("5 z 5");
    expect(EVENT_LIMIT_MESSAGE).toContain("300");
    expect(FAILED_MESSAGE).toContain("nie zmniejszyła limitu");
    expect(FAILED_MESSAGE).toContain("Losuj pytanie");
  });
});
