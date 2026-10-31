import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOCKED_AI_MESSAGE } from "../../../tests/setup/no-ai-network";
import { createAnthropicProvider } from "./anthropic-provider";

// The suite-wide guard (vitest setupFiles): nothing in the tests can reach the Anthropic API, so no test can cost money.
describe("AI network guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks every request to the Anthropic API host", async () => {
    await expect(fetch("https://api.anthropic.com/v1/messages", { method: "POST" })).rejects.toThrow(
      BLOCKED_AI_MESSAGE,
    );
    await expect(fetch(new URL("https://API.anthropic.com/v1/models"))).rejects.toThrow(BLOCKED_AI_MESSAGE);
    await expect(fetch(new Request("https://api.anthropic.com/v1/messages"))).rejects.toThrow(BLOCKED_AI_MESSAGE);
  });

  it("lets the adapter's default reach the global fetch at call time (a stub here, never the network)", async () => {
    const global = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ content: [{ type: "text", text: "Czy warto?" }], stop_reason: "end_turn" }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", global);
    const provider = createAnthropicProvider({ apiKey: "test-key-not-real", model: "claude-haiku-5-5" });
    await expect(
      provider.generate({ category: "generyczne", theme: "podróże" }, { signal: new AbortController().signal }),
    ).resolves.toEqual({ text: "Czy warto?", usage: null });
    expect(global).toHaveBeenCalledTimes(1);
  });
});
