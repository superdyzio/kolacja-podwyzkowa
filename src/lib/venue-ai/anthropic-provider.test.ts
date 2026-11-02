import { describe, expect, it, vi } from "vitest";
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_VERSION, type FetchLike } from "@/lib/ai-topics/anthropic-provider";
import type { AiProviderError } from "@/lib/ai-topics/provider";
import { createAnthropicLayoutProvider } from "./anthropic-provider";
import { VENUE_LAYOUT_SYSTEM_PROMPT } from "./prompt";
import { VENUE_VISION_MODEL } from "./provider";
import { LAYOUT_JSON_SCHEMA } from "./schema";

// Every call here goes to a stub: no request ever leaves the process (and tests/setup/no-ai-network.ts would block it).
const KEY = "test-key-not-real";
const image = { mimeType: "image/jpeg" as const, base64: "/9j/AAAA" };
const venue = {
  rooms: [{ name: "Sala A" }],
  tables: [{ name: "Okno", shape: "round" as const, seatCount: 8, x: 0.2, y: 0.3, rotation: 0 }],
};
const LAYOUT = JSON.stringify({ chairPitch: 0.04, rooms: [], tables: [] });
const USAGE = { input_tokens: 1800, output_tokens: 420 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function message(content: unknown[], stopReason = "end_turn", usage: unknown = USAGE): Response {
  return json({ id: "msg_test", type: "message", role: "assistant", content, stop_reason: stopReason, usage });
}

function stub(response: Response | (() => Promise<Response>)) {
  return vi.fn<FetchLike>(() => (typeof response === "function" ? response() : Promise.resolve(response)));
}

function live() {
  return { signal: new AbortController().signal };
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    return error as AiProviderError;
  }
  throw new Error("expected a failure");
}

describe("Anthropic layout provider", () => {
  it("sends the image as a base64 block and forces the layout schema", async () => {
    const fetch = stub(
      message([
        { type: "thinking", thinking: "" },
        { type: "text", text: LAYOUT },
      ]),
    );
    const provider = createAnthropicLayoutProvider({ apiKey: KEY, fetch });
    expect(provider).toMatchObject({ kind: "anthropic", model: VENUE_VISION_MODEL, ready: true });
    const controller = new AbortController();
    await expect(provider.readLayout({ image, venue }, { signal: controller.signal })).resolves.toEqual({
      text: LAYOUT,
      usage: { inputTokens: 1800, outputTokens: 420 },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-sonnet-5-5",
      thinking: { type: "between_tools" },
      output_config: { effort: "low", format: { type: "json_schema", schema: LAYOUT_JSON_SCHEMA } },
      system: VENUE_LAYOUT_SYSTEM_PROMPT,
    });
    expect(body).not.toHaveProperty("temperature");
    const [user] = body.messages as { role: string; content: { type: string }[] }[];
    expect(user.role).toBe("user");
    expect(user.content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "/9j/AAAA" },
    });
    expect(user.content[1]).toMatchObject({ type: "text" });
    expect(JSON.stringify(user.content[1])).toContain("Okno");
  });

  it("maps refusals, cut-offs and empty answers to failures that keep the billed tokens", async () => {
    const cases: [Response, string][] = [
      [message([], "refusal"), "refusal"],
      [message([{ type: "text", text: "{" }], "max_tokens"), "truncated"],
      [message([{ type: "text", text: " " }]), "empty"],
      [message([{ type: "text", text: LAYOUT }], "pause_turn"), "unavailable"],
    ];
    for (const [response, kind] of cases) {
      const provider = createAnthropicLayoutProvider({ apiKey: KEY, fetch: stub(response) });
      const failure = await failureOf(provider.readLayout({ image, venue }, live()));
      expect(failure.kind).toBe(kind);
      expect(failure.usage).toEqual({ inputTokens: 1800, outputTokens: 420 });
    }
  });

  it("maps HTTP errors like the topic provider (credits first)", async () => {
    const cases: [Response, string][] = [
      [json({ type: "error", error: { type: "billing_error", message: "x" } }, 402), "no-credits"],
      [
        json(
          { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low" } },
          400,
        ),
        "no-credits",
      ],
      [json({ type: "error", error: { type: "authentication_error", message: "x" } }, 401), "auth"],
      [json({ type: "error", error: { type: "rate_limit_error", message: "x" } }, 429), "rate-limit"],
      [json({ type: "error", error: { type: "overloaded_error", message: "x" } }, 529), "overloaded"],
      [json({ type: "error", error: { type: "invalid_request_error", message: "image too big" } }, 413), "bad-request"],
    ];
    for (const [response, kind] of cases) {
      const provider = createAnthropicLayoutProvider({ apiKey: KEY, fetch: stub(response) });
      const failure = await failureOf(provider.readLayout({ image, venue }, live()));
      expect(failure.kind).toBe(kind);
      expect(failure.status).toBe(response.status);
    }
  });

  it("reports our own deadline as a timeout and other fetch errors as network", async () => {
    const controller = new AbortController();
    const hanging = stub(
      () =>
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = createAnthropicLayoutProvider({ apiKey: KEY, fetch: hanging }).readLayout(
      { image, venue },
      { signal: controller.signal },
    );
    controller.abort();
    expect((await failureOf(pending)).kind).toBe("timeout");

    const broken = stub(() => Promise.reject(new TypeError("fetch failed")));
    const failure = await failureOf(
      createAnthropicLayoutProvider({ apiKey: KEY, fetch: broken }).readLayout({ image, venue }, live()),
    );
    expect(failure.kind).toBe("network");
  });
});
