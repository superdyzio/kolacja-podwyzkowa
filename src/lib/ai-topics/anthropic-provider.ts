import { AI_TOPIC_SYSTEM_PROMPT, buildTopicPrompt } from "./prompt";
import { AiProviderError, isAbortError, type AiFailureKind, type AiTopicProvider } from "./provider";

// Claude over the Anthropic Messages API with plain fetch (S-08) — one request shape, so no SDK dependency. The key
// comes in as a parameter (src/lib/ai.ts reads it from the server env); this module never reads the environment, and
// tests always inject a fetch stub (tests/setup/no-ai-network.ts blocks the real host anyway).

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  fetch?: FetchLike;
}

interface ContentBlock {
  type?: unknown;
  text?: unknown;
}

interface MessageResponse {
  content?: unknown;
  stop_reason?: unknown;
}

interface ErrorResponse {
  error?: { type?: unknown };
}

// Workers throw "Illegal invocation" when a stored global fetch is called as a method, so the default is a wrapper.
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

// Haiku 5.5 (the default) thinks unless told not to, and thinking counts toward max_tokens and the 9 s budget: a
// one-line topic needs none. Other models reject or treat these fields differently (Sonnet/Opus 5.5 refuse
// thinking "disabled", Haiku 4.5 has no effort), so an AI_MODEL override runs on the model's defaults with more room.
function tuningFor(model: string): Record<string, unknown> {
  if (model.startsWith("claude-haiku-5")) {
    return { max_tokens: 400, thinking: { type: "disabled" }, output_config: { effort: "low" } };
  }
  return { max_tokens: 2048 };
}

function kindForStatus(status: number): AiFailureKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 400 || status === 404 || status === 413) {
    return "bad-request";
  }
  if (status === 429) {
    return "rate-limit";
  }
  if (status === 529) {
    return "overloaded";
  }
  return "unavailable";
}

async function errorType(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorResponse;
    return typeof body.error?.type === "string" ? body.error.type : "unknown";
  } catch {
    return "unknown";
  }
}

function textOf(body: MessageResponse): string {
  if (!Array.isArray(body.content)) {
    return "";
  }
  return (body.content as ContentBlock[])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

export function createAnthropicProvider(options: AnthropicProviderOptions): AiTopicProvider {
  const send = options.fetch ?? defaultFetch;
  const { apiKey, model } = options;
  return {
    kind: "anthropic",
    model,
    ready: true,
    async generate(request, { signal }) {
      let response: Response;
      try {
        response = await send(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            ...tuningFor(model),
            system: AI_TOPIC_SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildTopicPrompt(request) }],
          }),
          signal,
        });
      } catch (error) {
        throw new AiProviderError(signal.aborted || isAbortError(error) ? "timeout" : "network");
      }

      if (!response.ok) {
        const kind = kindForStatus(response.status);
        const type = await errorType(response);
        throw new AiProviderError(kind, response.status, `AI: ${kind} (HTTP ${String(response.status)}, ${type})`);
      }

      let body: MessageResponse;
      try {
        body = (await response.json()) as MessageResponse;
      } catch (error) {
        throw new AiProviderError(signal.aborted || isAbortError(error) ? "timeout" : "unavailable", response.status);
      }

      if (body.stop_reason === "refusal") {
        throw new AiProviderError("refusal");
      }
      if (body.stop_reason === "max_tokens") {
        throw new AiProviderError("truncated");
      }
      if (body.stop_reason !== "end_turn" && body.stop_reason !== "stop_sequence") {
        throw new AiProviderError("unavailable", undefined, `AI: unexpected stop_reason ${String(body.stop_reason)}`);
      }
      const text = textOf(body);
      if (text.trim() === "") {
        throw new AiProviderError("empty");
      }
      return text;
    },
  };
}
