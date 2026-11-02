import { AI_MODEL, AI_PROVIDER, ANTHROPIC_API_KEY } from "astro:env/server";
import { aiProviderStatus, createAiProvider, parseAiConfig, type AiConfig } from "@/lib/ai-topics/config";
import type { AiTopicProvider } from "@/lib/ai-topics/provider";
import { createVenueVisionProvider } from "@/lib/venue-ai/config";
import type { VenueVisionProvider } from "@/lib/venue-ai/provider";
import type { AiProviderStatusDto } from "@/types";

// The only place that reads the AI configuration (S-08). Server-side only (API routes and pages). Default: the mock
// provider — no network, no cost. AI_PROVIDER=anthropic with ANTHROPIC_API_KEY switches to Claude.
export function getAiConfig(): AiConfig {
  return parseAiConfig({ provider: AI_PROVIDER, apiKey: ANTHROPIC_API_KEY, model: AI_MODEL });
}

export function getAiProvider(): AiTopicProvider {
  return createAiProvider(getAiConfig());
}

export function getAiProviderStatus(): AiProviderStatusDto {
  return aiProviderStatus(getAiConfig());
}

// The plan-photo reader (venue-drawing): the same switch and key, always the vision model.
export function getVenueVisionProvider(): VenueVisionProvider {
  return createVenueVisionProvider(getAiConfig());
}
