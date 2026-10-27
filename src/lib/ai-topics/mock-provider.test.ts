import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";
import { createMockProvider, mockFailureRequested } from "./mock-provider";
import { MOCK_TOPICS } from "./mock-topics";
import { AiProviderError } from "./provider";

const request = { category: "refleksyjne" as const, theme: "podróże" };

function live() {
  return { signal: new AbortController().signal };
}

describe("mock AI provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers a topic of the requested category", async () => {
    const provider = createMockProvider({ delayMs: () => 0, random: () => 0 });
    expect(provider).toMatchObject({ kind: "mock", model: null, ready: true });
    await expect(provider.generate(request, live())).resolves.toBe(MOCK_TOPICS.refleksyjne[0]);
    const last = createMockProvider({ delayMs: () => 0, random: () => 0.999_999 });
    await expect(last.generate({ ...request, category: "generyczne" }, live())).resolves.toBe(
      MOCK_TOPICS.generyczne.at(-1),
    );
  });

  it("fails when told to", async () => {
    const failing = createMockProvider({ delayMs: () => 0, fail: true });
    await expect(failing.generate(request, live())).rejects.toMatchObject({ kind: "unavailable" });
    const seam = createMockProvider({ delayMs: () => 0 });
    await expect(seam.generate(request, { ...live(), simulateFailure: true })).rejects.toBeInstanceOf(AiProviderError);
  });

  it("stops waiting as soon as the call is aborted", async () => {
    vi.useFakeTimers();
    const provider = createMockProvider({ delayMs: () => 60_000 });
    const controller = new AbortController();
    const pending = provider.generate(request, { signal: controller.signal });
    const outcome = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await outcome;

    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.generate(request, { signal: aborted.signal })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("takes a short while by default", async () => {
    vi.useFakeTimers();
    const provider = createMockProvider({ random: () => 0 });
    let done = false;
    const pending = provider.generate(request, live()).then((text) => {
      done = true;
      return text;
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(done).toBe(true);
    await expect(pending).resolves.toBe(MOCK_TOPICS.refleksyjne[0]);
  });

  it("honours the failure header only for the mock", () => {
    const mock = createMockProvider();
    const anthropic = createAnthropicProvider({ apiKey: "test-key-not-real", model: "m", fetch: vi.fn() });
    const failing = new Headers({ "x-ai-mock": "fail" });
    expect(mockFailureRequested(mock, failing)).toBe(true);
    expect(mockFailureRequested(mock, new Headers({ "x-ai-mock": " FAIL " }))).toBe(true);
    expect(mockFailureRequested(mock, new Headers())).toBe(false);
    expect(mockFailureRequested(mock, new Headers({ "x-ai-mock": "ok" }))).toBe(false);
    expect(mockFailureRequested(anthropic, failing)).toBe(false);
  });
});
