import type { AiProviderStatusDto, AiTopicUsageDto, GuestAiQuotaDto } from "@/types";
import { formatUsd, type AiSpend } from "./cost";

// Limits and texts of AI conversation topics (S-08, PRD NFR-005), pure. The numbers are passed to the DB function
// reserve_ai_topic(), which enforces them atomically; the texts are what guests and the organizer read.

// A guest generates at most this many topics per evening (failed attempts do not count).
export const MAX_GUEST_TOPICS = 5;
// Everyone together, the organizer included, at most this many per evening.
export const MAX_EVENT_TOPICS = 300;
// The server aborts the AI call after this long, so a topic (or the failure message) shows within 10 s.
export const AI_PROVIDER_TIMEOUT_MS = 9000;
// The browser gives up on a generate request after this long (server deadline + DB time + network).
export const AI_CLIENT_TIMEOUT_MS = 13_000;
// A pending attempt older than this is dead and never counts (mirrors the interval in the migration).
export const STALE_PENDING_SECONDS = 60;

export const GUEST_LIMIT_MESSAGE = `Wykorzystano już wszystkie tematy AI na ten wieczór (${MAX_GUEST_TOPICS} z ${MAX_GUEST_TOPICS}). Losuj pytania z bazy powyżej.`;
export const EVENT_LIMIT_MESSAGE = `Tematy AI na ten wieczór się skończyły (${MAX_EVENT_TOPICS} z ${MAX_EVENT_TOPICS}). Losuj pytania z bazy powyżej.`;
export const BUSY_MESSAGE = "Poprzedni temat jeszcze się generuje — chwilę.";
export const FAILED_MESSAGE =
  "Nie udało się wygenerować tematu — ta próba nie zmniejszyła limitu. Spróbuj ponownie albo użyj „Losuj pytanie” powyżej.";

// One row of ai_topic_usage().
export interface AiTopicUsageRow {
  event_used: number;
  event_failed: number;
  guest_used: number;
  guest_busy: boolean;
}

export function toGuestQuota(
  row: AiTopicUsageRow,
  guestLimit = MAX_GUEST_TOPICS,
  eventLimit = MAX_EVENT_TOPICS,
): GuestAiQuotaDto {
  const used = Math.min(row.guest_used, guestLimit);
  return {
    limit: guestLimit,
    used,
    remaining: guestLimit - used,
    eventExhausted: row.event_used >= eventLimit,
  };
}

// What the organizer's usage adds to the counts: the billed tokens, the estimate and the latest failure.
export interface AiUsageExtras extends AiSpend {
  lastFailureHint: string | null;
}

export const NO_USAGE_EXTRAS: AiUsageExtras = {
  inputTokens: 0,
  outputTokens: 0,
  costNanoUsd: 0,
  lastFailureHint: null,
};

export function toUsage(
  row: AiTopicUsageRow,
  extras: AiUsageExtras = NO_USAGE_EXTRAS,
  eventLimit = MAX_EVENT_TOPICS,
  guestLimit = MAX_GUEST_TOPICS,
): AiTopicUsageDto {
  return {
    used: row.event_used,
    limit: eventLimit,
    failed: row.event_failed,
    guestLimit,
    inputTokens: extras.inputTokens,
    outputTokens: extras.outputTokens,
    costNanoUsd: extras.costNanoUsd,
    lastFailureHint: extras.lastFailureHint,
  };
}

// „Zostało 3 z 5” — the guest's remaining topics.
export function formatRemaining(quota: GuestAiQuotaDto): string {
  return `Zostało ${quota.remaining} z ${quota.limit}`;
}

// „Wykorzystano 12 z 300 · nieudane: 2” — the organizer's view of the evening.
export function formatUsage(usage: AiTopicUsageDto): string {
  const base = `Wykorzystano ${usage.used} z ${usage.limit}`;
  return usage.failed > 0 ? `${base} · nieudane: ${usage.failed}` : base;
}

// Short provider name for the organizer: „atrapa AI”, „Claude (claude-haiku-5-5)” or what is wrong.
export function formatProvider(provider: AiProviderStatusDto): string {
  if (!provider.ready) {
    return provider.kind === "anthropic" ? "brak klucza API" : "błędna konfiguracja AI";
  }
  if (provider.kind === "mock") {
    return "atrapa AI";
  }
  return provider.model ? `Claude (${provider.model})` : "Claude";
}

// The shell card: „Tematy AI: 12 z 300 · atrapa AI”, with the estimate once tokens were billed („· ≈ 0,0012 USD”)
// and a warning while the latest attempt failed.
export function formatAiTopicSummary(usage: AiTopicUsageDto, provider: AiProviderStatusDto): string {
  const parts = [`Tematy AI: ${usage.used} z ${usage.limit}`, formatProvider(provider)];
  if (usage.costNanoUsd !== null && usage.inputTokens + usage.outputTokens > 0) {
    parts.push(`≈\u00a0${formatUsd(usage.costNanoUsd)}`);
  }
  if (usage.lastFailureHint !== null) {
    parts.push("ostatnia próba nieudana");
  }
  return parts.join(" · ");
}
