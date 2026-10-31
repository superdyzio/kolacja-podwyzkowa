import { describe, expect, it } from "vitest";
import {
  AI_FAILURE_KINDS,
  AiProviderError,
  describeFailureForOrganizer,
  isAbortError,
  isAiFailureKind,
} from "./provider";

const KINDS = AI_FAILURE_KINDS;

describe("AI provider failures", () => {
  it("keeps the kind and the HTTP status", () => {
    const error = new AiProviderError("auth", 401);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("auth");
    expect(error.status).toBe(401);
    expect(error.message).toContain("401");
    expect(new AiProviderError("timeout").status).toBeUndefined();
    expect(new AiProviderError("timeout").usage).toBeNull();
    const usage = { inputTokens: 300, outputTokens: 12 };
    expect(new AiProviderError("refusal", undefined, undefined, usage).usage).toEqual(usage);
  });

  it("recognizes a stored failure kind", () => {
    for (const kind of KINDS) {
      expect(isAiFailureKind(kind)).toBe(true);
    }
    expect(isAiFailureKind("no-credits")).toBe(true);
    expect(isAiFailureKind("something-new")).toBe(false);
    expect(isAiFailureKind("")).toBe(false);
  });

  it("explains every kind to the organizer in Polish", () => {
    for (const kind of KINDS) {
      expect(describeFailureForOrganizer(kind).length).toBeGreaterThan(10);
    }
    expect(describeFailureForOrganizer("timeout")).toBe("Przekroczono czas 9 s.");
    expect(describeFailureForOrganizer("auth", 401)).toBe(
      "Klucz API odrzucony (HTTP 401) — sprawdź ANTHROPIC_API_KEY.",
    );
    expect(describeFailureForOrganizer("bad-request", 404)).toBe(
      "Model niedostępny lub złe parametry (HTTP 404) — sprawdź AI_MODEL.",
    );
    expect(describeFailureForOrganizer("bad-request", 400)).toBe(
      "Model niedostępny, złe parametry albo blokada rozliczeń (HTTP 400) — sprawdź AI_MODEL i Billing na platform.claude.com.",
    );
    expect(describeFailureForOrganizer("rate-limit", 429)).toBe("Limit zapytań u dostawcy (HTTP 429).");
    expect(describeFailureForOrganizer("overloaded", 529)).toBe("Dostawca przeciążony (HTTP 529).");
    expect(describeFailureForOrganizer("not-configured")).toContain("AI_PROVIDER=mock");
    expect(describeFailureForOrganizer("no-credits", 400)).toBe(
      "Skończyły się kredyty API Anthropic albo zadziałał limit wydatków (HTTP 400) — doładuj je w konsoli: platform.claude.com → Billing.",
    );
  });

  it("recognizes aborts", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
    expect(isAbortError(new DOMException("late", "TimeoutError"))).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
