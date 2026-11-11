import type { Locale } from "@/lib/i18n/locale";
import type { AiProviderStatusDto, AiTopicUsageDto, GuestAiQuotaDto } from "@/types";
import { formatUsd, type AiSpend } from "./cost";
import { aiTopicMessages } from "./messages";

// Limits and texts of AI conversation topics (S-08, PRD NFR-005), pure. The numbers are passed to the DB function
// reserve_ai_topic(), which enforces them atomically; the texts are what guests and the organizer read.

// A guest generates at most this many topics per evening (failed attempts do not count).
export const MAX_GUEST_TOPICS = 25;
// Everyone together, the organizer included, at most this many per evening (until the organizer resets the counter).
export const MAX_EVENT_TOPICS = 1000;
// The server aborts the AI call after this long, so a topic (or the failure message) shows within 10 s.
export const AI_PROVIDER_TIMEOUT_MS = 9000;
// The browser gives up on a generate request after this long (server deadline + DB time + network).
export const AI_CLIENT_TIMEOUT_MS = 13_000;
// A pending attempt older than this is dead and never counts (mirrors the interval in the migration).
export const STALE_PENDING_SECONDS = 60;

// What guests and the organizer read when a generation is refused or fails, in `locale` (i18n). Routes answer with
// aiTopicLimitMessages(locals.locale).guestLimit / .eventLimit / .busy / .failed.
export function aiTopicLimitMessages(locale: Locale = "pl"): {
  guestLimit: string;
  eventLimit: string;
  busy: string;
  failed: string;
} {
  const t = aiTopicMessages(locale);
  return {
    guestLimit: t.guestLimit(MAX_GUEST_TOPICS),
    eventLimit: t.eventLimit(MAX_EVENT_TOPICS),
    busy: t.busy,
    failed: t.failed,
  };
}

// The Polish texts (tests and older callers).
export const GUEST_LIMIT_MESSAGE = aiTopicLimitMessages("pl").guestLimit;
export const EVENT_LIMIT_MESSAGE = aiTopicLimitMessages("pl").eventLimit;
export const BUSY_MESSAGE = aiTopicLimitMessages("pl").busy;
export const FAILED_MESSAGE = aiTopicLimitMessages("pl").failed;

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

// „Zostało 3 z 25” — the guest's remaining topics.
export function formatRemaining(quota: GuestAiQuotaDto, locale: Locale = "pl"): string {
  return aiTopicMessages(locale).remaining(quota.remaining, quota.limit);
}

// „Wykorzystano 12 z 1000 · nieudane: 2” — the organizer's view of the evening.
export function formatUsage(usage: AiTopicUsageDto, locale: Locale = "pl"): string {
  const t = aiTopicMessages(locale);
  const base = t.usage(usage.used, usage.limit);
  return usage.failed > 0 ? `${base} · ${t.usageFailed(usage.failed)}` : base;
}

// Short provider name for the organizer: „atrapa AI”, „Claude (claude-haiku-5-5)” or what is wrong.
export function formatProvider(provider: AiProviderStatusDto, locale: Locale = "pl"): string {
  const t = aiTopicMessages(locale);
  if (!provider.ready) {
    return provider.kind === "anthropic" ? t.providerNoKey : t.providerInvalid;
  }
  if (provider.kind === "mock") {
    return t.providerMock;
  }
  return provider.model ? `Claude (${provider.model})` : "Claude";
}

// The shell card: „Tematy AI: 12 z 1000 · atrapa AI”, with the estimate once tokens were billed („· ≈ 0,0012 USD”)
// and a warning while the latest attempt failed.
export function formatAiTopicSummary(
  usage: AiTopicUsageDto,
  provider: AiProviderStatusDto,
  locale: Locale = "pl",
): string {
  const t = aiTopicMessages(locale);
  const parts = [t.summary(usage.used, usage.limit), formatProvider(provider, locale)];
  if (usage.costNanoUsd !== null && usage.inputTokens + usage.outputTokens > 0) {
    parts.push(`≈\u00a0${formatUsd(usage.costNanoUsd, locale)}`);
  }
  if (usage.lastFailureHint !== null) {
    parts.push(t.summaryLastFailed);
  }
  return parts.join(" · ");
}

// What the client link (/o/<key>) may know about AI (client-restaurant-split, FR-028): the counts only. Tokens, the
// cost estimate and the provider's failure hints are the venue's („Koszty AI” in the panel); the shape stays
// AiTopicUsageDto so the islands parse it as before.
export function clientAiUsage(usage: AiTopicUsageDto): AiTopicUsageDto {
  return { ...usage, inputTokens: 0, outputTokens: 0, costNanoUsd: 0, lastFailureHint: null };
}

// The client shell card: „Tematy AI: 12 z 1000” (no provider, no cost).
export function formatClientAiTopicSummary(usage: AiTopicUsageDto, locale: Locale = "pl"): string {
  return aiTopicMessages(locale).summary(usage.used, usage.limit);
}
