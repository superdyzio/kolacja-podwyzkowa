import type { Locale } from "@/lib/i18n/locale";
import type { AiProviderKind, QuestionCategory } from "@/types";
import { AI_PROVIDER_TIMEOUT_MS } from "./limits";
import { aiTopicMessages } from "./messages";

// The contract every AI topic provider fulfils (S-08): the mock (default) and Claude over the Anthropic Messages API.
// A provider returns the raw text and the tokens it was billed for; sanitizing, the content check and the limits are
// the service's job. Every failure is an AiProviderError with a kind the service and the organizer's hint understand.

export interface AiTopicRequest {
  category: QuestionCategory;
  theme: string;
  // The language the topic is written in (i18n): the requester's. Default "pl".
  locale?: Locale;
}

// The provider's own token counts for one answer (what it bills); feeds the organizer's cost estimate.
export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiGeneration {
  text: string;
  // null = nothing billed (the mock).
  usage: AiTokenUsage | null;
}

export interface AiGenerateOptions {
  signal: AbortSignal;
  // Only the mock honours it (the smoke's failure seam); a real provider ignores it.
  simulateFailure?: boolean;
}

export interface AiTopicProvider {
  readonly kind: AiProviderKind;
  readonly model: string | null;
  // False when the configuration cannot work (no key, unknown AI_PROVIDER): the service fails such an attempt before
  // it reserves anything, and generate() rejects "not-configured" without network.
  readonly ready: boolean;
  generate(request: AiTopicRequest, options: AiGenerateOptions): Promise<AiGeneration>;
}

export const AI_FAILURE_KINDS = [
  "not-configured",
  "timeout",
  "network",
  "auth",
  "no-credits",
  "bad-request",
  "rate-limit",
  "overloaded",
  "unavailable",
  "refusal",
  "truncated",
  "empty",
  "off-limits",
] as const;

export type AiFailureKind = (typeof AI_FAILURE_KINDS)[number];

// A failure kind read back from the DB (ai_topic.failure_kind).
export function isAiFailureKind(value: string): value is AiFailureKind {
  return (AI_FAILURE_KINDS as readonly string[]).includes(value);
}

export class AiProviderError extends Error {
  readonly kind: AiFailureKind;
  readonly status: number | undefined;
  // Tokens billed although the answer is unusable (refusal, cut-off, empty); null when nothing was billed.
  readonly usage: AiTokenUsage | null;

  constructor(kind: AiFailureKind, status?: number, message?: string, usage: AiTokenUsage | null = null) {
    super(message ?? (status === undefined ? `AI: ${kind}` : `AI: ${kind} (HTTP ${String(status)})`));
    this.name = "AiProviderError";
    this.kind = kind;
    this.status = status;
    this.usage = usage;
  }
}

// Why the last attempt failed, for the organizer only (guests see the `failed` message), in `locale`. Never contains
// the key.
export function describeFailureForOrganizer(kind: AiFailureKind, status?: number, locale: Locale = "pl"): string {
  const t = aiTopicMessages(locale);
  switch (kind) {
    case "not-configured":
      return t.missingKey;
    case "timeout":
      return t.hintTimeout(AI_PROVIDER_TIMEOUT_MS / 1000);
    case "network":
      return t.hintNetwork;
    case "auth":
      return t.hintAuth(status);
    case "no-credits":
      return t.hintNoCredits(status);
    case "bad-request":
      // A 400 is also what a spend limit (or a billing block whose text we did not recognize) looks like.
      return status === 400 ? t.hintBadRequestBilling(status) : t.hintBadRequest(status);
    case "rate-limit":
      return t.hintRateLimit(status);
    case "overloaded":
      return t.hintOverloaded(status);
    case "unavailable":
      return t.hintUnavailable(status);
    case "refusal":
      return t.hintRefusal;
    case "truncated":
      return t.hintTruncated;
    case "empty":
      return t.hintEmpty;
    case "off-limits":
      return t.hintOffLimits;
  }
}

// True for the abort of our own deadline (AbortController.abort() → DOMException "AbortError"/"TimeoutError").
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
}
