import type { AiProviderKind, QuestionCategory } from "@/types";
import { AI_PROVIDER_TIMEOUT_MS } from "./limits";

// The contract every AI topic provider fulfils (S-08): the mock (default) and Claude over the Anthropic Messages API.
// A provider returns the raw text and the tokens it was billed for; sanitizing, the content check and the limits are
// the service's job. Every failure is an AiProviderError with a kind the service and the organizer's hint understand.

export interface AiTopicRequest {
  category: QuestionCategory;
  theme: string;
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

function withStatus(text: string, status: number | undefined): string {
  return status === undefined ? text : `${text} (HTTP ${String(status)})`;
}

// Why the last attempt failed, in Polish, for the organizer only (guests see FAILED_MESSAGE). Never contains the key.
export function describeFailureForOrganizer(kind: AiFailureKind, status?: number): string {
  switch (kind) {
    case "not-configured":
      return "Brak ANTHROPIC_API_KEY — dodaj klucz albo ustaw AI_PROVIDER=mock.";
    case "timeout":
      return `Przekroczono czas ${String(AI_PROVIDER_TIMEOUT_MS / 1000)} s.`;
    case "network":
      return "Brak połączenia z dostawcą AI.";
    case "auth":
      return `${withStatus("Klucz API odrzucony", status)} — sprawdź ANTHROPIC_API_KEY.`;
    case "no-credits":
      return `${withStatus("Skończyły się kredyty API Anthropic albo zadziałał limit wydatków", status)} — doładuj je w konsoli: platform.claude.com → Billing.`;
    case "bad-request":
      return `${withStatus("Model niedostępny lub złe parametry", status)} — sprawdź AI_MODEL.`;
    case "rate-limit":
      return `${withStatus("Limit zapytań u dostawcy", status)}.`;
    case "overloaded":
      return `${withStatus("Dostawca przeciążony", status)}.`;
    case "unavailable":
      return `${withStatus("Dostawca AI niedostępny", status)}.`;
    case "refusal":
      return "AI odmówiło odpowiedzi.";
    case "truncated":
      return "Odpowiedź AI była za długa i została ucięta.";
    case "empty":
      return "AI zwróciło pustą odpowiedź.";
    case "off-limits":
      return "Temat wykraczał poza granice treści — odrzucony.";
  }
}

// True for the abort of our own deadline (AbortController.abort() → DOMException "AbortError"/"TimeoutError").
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
}
