import type { FetchLike } from "@/lib/ai-topics/anthropic-provider";
import type { AiConfig } from "@/lib/ai-topics/config";
import { AiProviderError } from "@/lib/ai-topics/provider";
import { createAnthropicLayoutProvider } from "./anthropic-provider";
import { createMockLayoutProvider, type MockLayoutOptions } from "./mock-provider";
import type { VenueVisionProvider } from "./provider";

// Which provider reads the plan photo (venue-drawing): the same AI_PROVIDER switch and key as the AI topics, but
// always the vision model (VENUE_VISION_MODEL), whatever AI_MODEL says — that one is tuned for one-line topics.

export interface VenueVisionDeps {
  fetch?: FetchLike;
  mock?: MockLayoutOptions;
}

export function createVenueVisionProvider(config: AiConfig, deps: VenueVisionDeps = {}): VenueVisionProvider {
  if (config.kind === "mock") {
    return createMockLayoutProvider(deps.mock);
  }
  if (config.kind === "anthropic" && config.apiKey) {
    return createAnthropicLayoutProvider({ apiKey: config.apiKey, fetch: deps.fetch });
  }
  return {
    kind: "anthropic",
    model: null,
    ready: false,
    readLayout() {
      return Promise.reject(new AiProviderError("not-configured"));
    },
  };
}
