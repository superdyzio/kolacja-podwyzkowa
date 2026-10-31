import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./anthropic-provider";
import { aiProviderStatus, createAiProvider, DEFAULT_AI_MODEL, MISSING_KEY_PROBLEM, parseAiConfig } from "./config";

const KEY = "test-key-not-real";

describe("AI configuration", () => {
  it("defaults to the mock", () => {
    expect(parseAiConfig({})).toEqual({ kind: "mock" });
    expect(parseAiConfig({ provider: "  " })).toEqual({ kind: "mock" });
    expect(parseAiConfig({ provider: " MOCK ", apiKey: KEY })).toEqual({ kind: "mock" });
  });

  it("reads the Anthropic key and model", () => {
    expect(parseAiConfig({ provider: "Anthropic", apiKey: ` ${KEY} ` })).toEqual({
      kind: "anthropic",
      apiKey: KEY,
      model: DEFAULT_AI_MODEL,
    });
    expect(DEFAULT_AI_MODEL).toBe("claude-haiku-5-5");
    expect(parseAiConfig({ provider: "anthropic", apiKey: "", model: " claude-sonnet-5-5 " })).toEqual({
      kind: "anthropic",
      apiKey: null,
      model: "claude-sonnet-5-5",
    });
  });

  it("keeps an unknown provider as a misconfiguration", () => {
    expect(parseAiConfig({ provider: " openai " })).toEqual({ kind: "invalid", value: "openai" });
  });

  it("tells the organizer what answers and what is wrong, never the key", () => {
    expect(aiProviderStatus(parseAiConfig({}))).toEqual({ kind: "mock", model: null, ready: true, problem: null });
    expect(aiProviderStatus(parseAiConfig({ provider: "anthropic", apiKey: KEY }))).toEqual({
      kind: "anthropic",
      model: DEFAULT_AI_MODEL,
      ready: true,
      problem: null,
    });
    expect(aiProviderStatus(parseAiConfig({ provider: "anthropic" }))).toEqual({
      kind: "anthropic",
      model: DEFAULT_AI_MODEL,
      ready: false,
      problem: MISSING_KEY_PROBLEM,
    });
    const invalid = aiProviderStatus(parseAiConfig({ provider: "openai", apiKey: KEY }));
    expect(invalid).toMatchObject({ kind: null, ready: false });
    expect(invalid.problem).toBe("Nieznana wartość AI_PROVIDER: „openai” — dozwolone: mock, anthropic.");
    expect(JSON.stringify(invalid)).not.toContain(KEY);
  });

  it("builds the matching provider", async () => {
    const fetch = vi.fn<FetchLike>();
    expect(createAiProvider(parseAiConfig({}), { fetch })).toMatchObject({ kind: "mock", ready: true });
    const claude = createAiProvider(parseAiConfig({ provider: "anthropic", apiKey: KEY }), { fetch });
    expect(claude).toMatchObject({ kind: "anthropic", model: DEFAULT_AI_MODEL, ready: true });

    for (const env of [{ provider: "anthropic" }, { provider: "openai" }]) {
      const broken = createAiProvider(parseAiConfig(env), { fetch });
      expect(broken.ready).toBe(false);
      await expect(
        broken.generate({ category: "generyczne", theme: "x" }, { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ kind: "not-configured" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
