import { isQuestionCategory } from "@/lib/questions/categories";
import type { AiTopicDto, AiTopicUsageDto, GuestAiQuotaDto, QuestionCategory } from "@/types";

// What a browser remembers about its own AI topics (S-08): the chosen category and the last topic, so a reload keeps
// it on screen. It lives in this browser's localStorage only — the server never stores a topic, nobody else sees it.
// Also the parsers of the AI routes' answers (topics, the guest's quota, the evening's usage). Storage and answers
// are untrusted, so parsing keeps what is valid and drops the rest. Pure: no window access here.

export const GUEST_TOPIC_STORAGE_KEY = "kolacja-podwyzkowa:tematy-ai:gosc";
export const ORGANIZER_TOPIC_STORAGE_KEY = "kolacja-podwyzkowa:tematy-ai:organizator";

export interface TopicMemory {
  // null = „Wszystkie” (the server picks a category).
  category: QuestionCategory | null;
  last: AiTopicDto | null;
}

export const EMPTY_TOPIC_MEMORY: TopicMemory = { category: null, last: null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// A topic: a known category and some text.
export function parseTopic(value: unknown): AiTopicDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const { category, text } = record;
  if (typeof category !== "string" || !isQuestionCategory(category) || typeof text !== "string") {
    return null;
  }
  return text.trim() === "" ? null : { category, text };
}

// The `quota` of a guest answer (success or error body), or null.
export function parseGuestQuota(data: unknown): GuestAiQuotaDto | null {
  const quota = asRecord(asRecord(data)?.quota);
  if (!quota) {
    return null;
  }
  const { limit, used, remaining, eventExhausted } = quota;
  if (!isCount(limit) || !isCount(used) || !isCount(remaining) || typeof eventExhausted !== "boolean") {
    return null;
  }
  return { limit, used, remaining, eventExhausted };
}

// The `usage` of an organizer answer (success, error or the board), or null.
export function parseUsage(data: unknown): AiTopicUsageDto | null {
  const usage = asRecord(asRecord(data)?.usage);
  if (!usage) {
    return null;
  }
  const { used, limit, failed, guestLimit, inputTokens, outputTokens, costNanoUsd, lastFailureHint } = usage;
  if (
    !isCount(used) ||
    !isCount(limit) ||
    !isCount(failed) ||
    !isCount(guestLimit) ||
    !isCount(inputTokens) ||
    !isCount(outputTokens) ||
    (costNanoUsd !== null && !isCount(costNanoUsd)) ||
    (lastFailureHint !== null && typeof lastFailureHint !== "string")
  ) {
    return null;
  }
  return { used, limit, failed, guestLimit, inputTokens, outputTokens, costNanoUsd, lastFailureHint };
}

export function parseTopicMemory(raw: string | null): TopicMemory {
  if (raw === null) {
    return EMPTY_TOPIC_MEMORY;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_TOPIC_MEMORY;
  }
  const record = asRecord(data);
  if (!record) {
    return EMPTY_TOPIC_MEMORY;
  }
  const { category, last } = record;
  return {
    category: typeof category === "string" && isQuestionCategory(category) ? category : null,
    last: parseTopic(last),
  };
}

export function serializeTopicMemory(memory: TopicMemory): string {
  return JSON.stringify({
    category: memory.category,
    last: memory.last ? { category: memory.last.category, text: memory.last.text } : null,
  });
}
