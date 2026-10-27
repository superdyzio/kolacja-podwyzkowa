import { describe, expect, it } from "vitest";
import { AiProviderError, describeFailureForOrganizer, isAbortError, type AiFailureKind } from "./provider";

const KINDS: AiFailureKind[] = [
  "not-configured",
  "timeout",
  "network",
  "auth",
  "bad-request",
  "rate-limit",
  "overloaded",
  "unavailable",
  "refusal",
  "truncated",
  "empty",
  "off-limits",
];

describe("AI provider failures", () => {
  it("keeps the kind and the HTTP status", () => {
    const error = new AiProviderError("auth", 401);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("auth");
    expect(error.status).toBe(401);
    expect(error.message).toContain("401");
    expect(new AiProviderError("timeout").status).toBeUndefined();
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
    expect(describeFailureForOrganizer("rate-limit", 429)).toBe("Limit zapytań u dostawcy (HTTP 429).");
    expect(describeFailureForOrganizer("overloaded", 529)).toBe("Dostawca przeciążony (HTTP 529).");
    expect(describeFailureForOrganizer("not-configured")).toContain("AI_PROVIDER=mock");
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
