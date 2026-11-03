import type { Locale } from "@/lib/i18n/locale";
import type { AiProviderStatusDto } from "@/types";
import { createAnthropicProvider, type FetchLike } from "./anthropic-provider";
import { aiTopicMessages } from "./messages";
import { createMockProvider, type MockProviderOptions } from "./mock-provider";
import { AiProviderError, type AiTopicProvider } from "./provider";

// Which AI provider answers (S-08), pure: parsed from the server-only env vars AI_PROVIDER, ANTHROPIC_API_KEY and
// AI_MODEL (read only by src/lib/ai.ts). AI_PROVIDER is a plain optional string, not an env enum: an unknown value
// must not throw on read (that would break the guest page), it becomes a misconfiguration the organizer sees.

export const DEFAULT_AI_MODEL = "claude-haiku-5-5";

export interface AiEnv {
  provider?: string | undefined;
  apiKey?: string | undefined;
  model?: string | undefined;
}

export type AiConfig =
  { kind: "mock" } | { kind: "anthropic"; apiKey: string | null; model: string } | { kind: "invalid"; value: string };

// Polish (tests); aiProviderStatus answers in the locale it is given.
export const MISSING_KEY_PROBLEM = aiTopicMessages("pl").missingKey;

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function parseAiConfig(env: AiEnv): AiConfig {
  const provider = blankToNull(env.provider)?.toLowerCase() ?? "mock";
  if (provider === "mock") {
    return { kind: "mock" };
  }
  if (provider === "anthropic") {
    return { kind: "anthropic", apiKey: blankToNull(env.apiKey), model: blankToNull(env.model) ?? DEFAULT_AI_MODEL };
  }
  return { kind: "invalid", value: blankToNull(env.provider) ?? "" };
}

// What the organizer sees about the provider, `problem` in `locale`; never the key itself.
export function aiProviderStatus(config: AiConfig, locale: Locale = "pl"): AiProviderStatusDto {
  const t = aiTopicMessages(locale);
  switch (config.kind) {
    case "mock":
      return { kind: "mock", model: null, ready: true, problem: null };
    case "anthropic":
      return config.apiKey
        ? { kind: "anthropic", model: config.model, ready: true, problem: null }
        : { kind: "anthropic", model: config.model, ready: false, problem: t.missingKey };
    case "invalid":
      return {
        kind: null,
        model: null,
        ready: false,
        problem: t.unknownProvider(config.value),
      };
  }
}

export interface AiProviderDeps {
  fetch?: FetchLike;
  mock?: MockProviderOptions;
}

// A provider that fails every attempt at once, without network (anthropic without a key, unknown AI_PROVIDER). An
// unknown AI_PROVIDER has no kind of its own; "anthropic" keeps the mock's failure seam off for it.
function unavailableProvider(config: AiConfig): AiTopicProvider {
  return {
    kind: "anthropic",
    model: config.kind === "anthropic" ? config.model : null,
    ready: false,
    generate() {
      return Promise.reject(new AiProviderError("not-configured"));
    },
  };
}

export function createAiProvider(config: AiConfig, deps: AiProviderDeps = {}): AiTopicProvider {
  if (config.kind === "mock") {
    return createMockProvider(deps.mock);
  }
  if (config.kind === "anthropic" && config.apiKey) {
    return createAnthropicProvider({ apiKey: config.apiKey, model: config.model, fetch: deps.fetch });
  }
  return unavailableProvider(config);
}
