import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  createAnthropicProvider,
  type FetchLike,
} from "./anthropic-provider";
import { AI_TOPIC_SYSTEM_PROMPT, buildTopicPrompt } from "./prompt";
import type { AiProviderError } from "./provider";

// Every call here goes to a stub: no request ever leaves the process (and tests/setup/no-ai-network.ts would block it).
const KEY = "test-key-not-real";
const request = { category: "kontrowersyjne" as const, theme: "podróże" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function message(content: unknown[], stopReason = "end_turn", usage?: unknown): Response {
  return json({ id: "msg_test", type: "message", role: "assistant", content, stop_reason: stopReason, usage });
}

const USAGE = { input_tokens: 312, output_tokens: 41, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

function stub(response: Response | (() => Promise<Response>)) {
  return vi.fn<FetchLike>(() => (typeof response === "function" ? response() : Promise.resolve(response)));
}

function live() {
  return { signal: new AbortController().signal };
}

function firstCall(fetch: ReturnType<typeof stub>): Parameters<FetchLike> {
  const call = fetch.mock.calls.at(0);
  if (!call) {
    throw new Error("fetch was not called");
  }
  return call;
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") {
    throw new Error("the request body is not a JSON string");
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    return error as AiProviderError;
  }
  throw new Error("expected a failure");
}

describe("Anthropic AI provider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends one Messages API request with the prompt and no sampling parameters", async () => {
    const fetch = stub(message([{ type: "text", text: "Czy warto?" }]));
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    expect(provider).toMatchObject({ kind: "anthropic", model: "claude-haiku-5-5", ready: true });
    const controller = new AbortController();
    await expect(provider.generate(request, { signal: controller.signal })).resolves.toEqual({
      text: "Czy warto?",
      usage: null,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = firstCall(fetch);
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    });
    const body = bodyOf(init);
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: AI_TOPIC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildTopicPrompt(request) }],
    });
    for (const sampling of ["temperature", "top_p", "top_k"]) {
      expect(body).not.toHaveProperty(sampling);
    }
  });

  it("runs another model on its own defaults", async () => {
    const fetch = stub(message([{ type: "text", text: "Czy warto?" }]));
    await createAnthropicProvider({ apiKey: KEY, model: "claude-sonnet-5-5", fetch }).generate(request, live());
    const body = bodyOf(firstCall(fetch)[1]);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(2048);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("output_config");
  });

  it("reads only the text blocks", async () => {
    const fetch = stub(
      message([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Pierwsza część." },
        { type: "text", text: "Czy się zgadzasz?" },
      ]),
    );
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    await expect(provider.generate(request, live())).resolves.toMatchObject({
      text: "Pierwsza część.\nCzy się zgadzasz?",
    });
  });

  it("reports the billed tokens of the answer", async () => {
    const fetch = stub(message([{ type: "text", text: "Czy warto?" }], "end_turn", USAGE));
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    await expect(provider.generate(request, live())).resolves.toEqual({
      text: "Czy warto?",
      usage: { inputTokens: 312, outputTokens: 41 },
    });
    for (const odd of [
      {},
      { input_tokens: 10 },
      { input_tokens: -1, output_tokens: 2 },
      { input_tokens: "10", output_tokens: 2 },
    ]) {
      const oddFetch = stub(message([{ type: "text", text: "Czy?" }], "end_turn", odd));
      const result = await createAnthropicProvider({ apiKey: KEY, model: "m", fetch: oddFetch }).generate(
        request,
        live(),
      );
      expect(result.usage).toBeNull();
    }
  });

  it("maps HTTP errors to failure kinds and keeps the status", async () => {
    const cases: [number, string][] = [
      [400, "bad-request"],
      [401, "auth"],
      [403, "auth"],
      [404, "bad-request"],
      [413, "bad-request"],
      [429, "rate-limit"],
      [500, "unavailable"],
      [503, "unavailable"],
      [529, "overloaded"],
    ];
    for (const [status, kind] of cases) {
      const fetch = stub(json({ type: "error", error: { type: "some_error", message: "nope" } }, status));
      const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
      const failure = await failureOf(provider.generate(request, live()));
      expect(failure.kind).toBe(kind);
      expect(failure.status).toBe(status);
      expect(failure.message).not.toContain(KEY);
    }
    const html = stub(new Response("<html>bad gateway</html>", { status: 502 }));
    const failure = await failureOf(
      createAnthropicProvider({ apiKey: KEY, model: "m", fetch: html }).generate(request, live()),
    );
    expect(failure).toMatchObject({ kind: "unavailable", status: 502 });
  });

  it("recognizes an empty credit balance or a spend limit", async () => {
    const cases: [number, unknown][] = [
      [402, { type: "error", error: { type: "billing_error", message: "Billing issue." } }],
      [
        400,
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.",
          },
        },
      ],
      [400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your spend limit." } }],
      [402, "not json"],
    ];
    for (const [status, body] of cases) {
      const response = typeof body === "string" ? new Response(body, { status }) : json(body, status);
      const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch: stub(response) });
      const failure = await failureOf(provider.generate(request, live()));
      expect(failure).toMatchObject({ kind: "no-credits", status });
      expect(failure.usage).toBeNull();
    }
    // Any other 400 is still a bad request.
    const other = json(
      { type: "error", error: { type: "invalid_request_error", message: "max_tokens: too big" } },
      400,
    );
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch: stub(other) });
    expect(await failureOf(provider.generate(request, live()))).toMatchObject({ kind: "bad-request", status: 400 });
  });

  it("treats refusals, cut-off and empty answers as failures", async () => {
    const cases: [Response, string][] = [
      [message([{ type: "text", text: "Nie mogę." }], "refusal"), "refusal"],
      [message([{ type: "text", text: "Czy" }], "max_tokens"), "truncated"],
      [message([], "end_turn"), "empty"],
      [message([{ type: "text", text: "   " }], "end_turn"), "empty"],
      [message([{ type: "text", text: "Czy?" }], "pause_turn"), "unavailable"],
      [new Response("not json", { status: 200 }), "unavailable"],
    ];
    for (const [response, kind] of cases) {
      const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch: stub(response) });
      expect((await failureOf(provider.generate(request, live()))).kind).toBe(kind);
    }
  });

  it("keeps the billed tokens of an unusable answer", async () => {
    const cases: [Response, string][] = [
      [message([{ type: "text", text: "Nie mogę." }], "refusal", USAGE), "refusal"],
      [message([{ type: "text", text: "Czy" }], "max_tokens", USAGE), "truncated"],
      [message([{ type: "text", text: "  " }], "end_turn", USAGE), "empty"],
      [message([{ type: "text", text: "Czy?" }], "pause_turn", USAGE), "unavailable"],
    ];
    for (const [response, kind] of cases) {
      const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch: stub(response) });
      const failure = await failureOf(provider.generate(request, live()));
      expect(failure.kind).toBe(kind);
      expect(failure.usage).toEqual({ inputTokens: 312, outputTokens: 41 });
    }
  });

  it("reports a network failure", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.reject(new TypeError("fetch failed")));
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    expect((await failureOf(provider.generate(request, live()))).kind).toBe("network");
  });

  it("reports a timeout when the deadline aborts the call", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 9000);
    const outcome = failureOf(provider.generate(request, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(9000);
    expect((await outcome).kind).toBe("timeout");
  });

  it("ignores the mock's failure switch and still asks the API", async () => {
    const fetch = stub(message([{ type: "text", text: "Czy warto?" }]));
    const provider = createAnthropicProvider({ apiKey: KEY, model: "claude-haiku-5-5", fetch });
    await expect(provider.generate(request, { ...live(), simulateFailure: true })).resolves.toMatchObject({
      text: "Czy warto?",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
