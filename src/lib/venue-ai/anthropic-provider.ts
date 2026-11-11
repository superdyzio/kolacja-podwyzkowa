import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  apiError,
  defaultFetch,
  kindFor,
  textOf,
  usageOf,
  type FetchLike,
  type MessageResponse,
} from "@/lib/ai-topics/anthropic-provider";
import { AiProviderError, isAbortError } from "@/lib/ai-topics/provider";
import { VENUE_LAYOUT_SYSTEM_PROMPT, buildLayoutPrompt } from "./prompt";
import { VENUE_VISION_MODEL, type VenueVisionProvider } from "./provider";
import { LAYOUT_JSON_SCHEMA } from "./schema";

// The plan image read by Claude over the Anthropic Messages API (venue-drawing): the same plain-fetch request style and
// error mapping as the AI topics (src/lib/ai-topics/anthropic-provider.ts), with the image as a base64 block and the
// answer forced into LAYOUT_JSON_SCHEMA by structured outputs. Tests inject a fetch stub (the real host is blocked).

export interface AnthropicLayoutOptions {
  apiKey: string;
  model?: string;
  fetch?: FetchLike;
}

// A layout of 40 tables is about 2 000 output tokens, 60 tables (MAX_TABLES) about 3 000; the rest is room to spare.
const MAX_TOKENS = 8000;

export function createAnthropicLayoutProvider(options: AnthropicLayoutOptions): VenueVisionProvider {
  const send = options.fetch ?? defaultFetch;
  const model = options.model ?? VENUE_VISION_MODEL;
  return {
    kind: "anthropic",
    model,
    ready: true,
    async readLayout({ image, venue }, { signal }) {
      let response: Response;
      try {
        response = await send(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            // The lowest thinking setting of Sonnet 5.5 ("disabled" is a 400 there): the answer must arrive well
            // within the Lambda's 30 s.
            thinking: { type: "between_tools" },
            output_config: { effort: "low", format: { type: "json_schema", schema: LAYOUT_JSON_SCHEMA } },
            system: VENUE_LAYOUT_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
                  { type: "text", text: buildLayoutPrompt(venue) },
                ],
              },
            ],
          }),
          signal,
        });
      } catch (error) {
        throw new AiProviderError(signal.aborted || isAbortError(error) ? "timeout" : "network");
      }

      if (!response.ok) {
        const error = await apiError(response);
        const kind = kindFor(response.status, error);
        throw new AiProviderError(
          kind,
          response.status,
          `AI: ${kind} (HTTP ${String(response.status)}, ${error.type})`,
        );
      }

      let body: MessageResponse;
      try {
        body = (await response.json()) as MessageResponse;
      } catch (error) {
        throw new AiProviderError(signal.aborted || isAbortError(error) ? "timeout" : "unavailable", response.status);
      }

      const usage = usageOf(body);
      if (body.stop_reason === "refusal") {
        throw new AiProviderError("refusal", undefined, undefined, usage);
      }
      if (body.stop_reason === "max_tokens") {
        throw new AiProviderError("truncated", undefined, undefined, usage);
      }
      if (body.stop_reason !== "end_turn" && body.stop_reason !== "stop_sequence") {
        throw new AiProviderError(
          "unavailable",
          undefined,
          `AI: unexpected stop_reason ${String(body.stop_reason)}`,
          usage,
        );
      }
      const text = textOf(body);
      if (text.trim() === "") {
        throw new AiProviderError("empty", undefined, undefined, usage);
      }
      return { text, usage };
    },
  };
}
