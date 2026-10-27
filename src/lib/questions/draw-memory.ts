import type { QuestionCategory, QuestionDrawDto, QuestionDto } from "@/types";
import { isQuestionCategory } from "./categories";
import { MAX_RECENT } from "./draw";

// What a phone remembers about its own question draws (S-07, FR-015): the chosen category, the ids it drew lately
// (oldest first, sent along with each draw so the same question does not come back soon) and the last question, so a
// reload keeps it on screen. It lives in the browser's localStorage only — nobody else ever sees it. Storage is
// untrusted (old versions, hand edits), so parsing keeps what is valid and drops the rest. Pure: no window access here.

export const GUEST_DRAW_STORAGE_KEY = "kolacja-podwyzkowa:pytania:gosc";
export const ORGANIZER_DRAW_STORAGE_KEY = "kolacja-podwyzkowa:pytania:organizator";

export interface DrawMemory {
  // null = every category („Wszystkie”).
  category: QuestionCategory | null;
  recent: number[];
  last: QuestionDto | null;
}

export const EMPTY_DRAW_MEMORY: DrawMemory = { category: null, recent: [], last: null };

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// A question from storage or from a draw answer: exactly the DTO fields, with a known category and some text.
export function toQuestionDto(value: unknown): QuestionDto | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { id, category, text } = value as Record<string, unknown>;
  if (!isPositiveId(id) || typeof category !== "string" || !isQuestionCategory(category)) {
    return null;
  }
  if (typeof text !== "string" || text.trim() === "") {
    return null;
  }
  return { id, category, text };
}

// The draw route's answer, or null when the body is not one (a proxy page, a changed API).
export function parseDrawAnswer(data: unknown): QuestionDrawDto | null {
  if (typeof data !== "object" || data === null || !("question" in data)) {
    return null;
  }
  const { question } = data;
  if (question === null) {
    return { question: null };
  }
  const parsed = toQuestionDto(question);
  return parsed ? { question: parsed } : null;
}

export function parseDrawMemory(raw: string | null): DrawMemory {
  if (raw === null) {
    return EMPTY_DRAW_MEMORY;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_DRAW_MEMORY;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return EMPTY_DRAW_MEMORY;
  }
  const { category, recent, last } = data as Record<string, unknown>;
  const ids = Array.isArray(recent) ? recent.filter(isPositiveId) : [];
  return {
    category: typeof category === "string" && isQuestionCategory(category) ? category : null,
    // Without duplicates (the newest position wins), the newest MAX_RECENT.
    recent: ids.filter((id, index) => ids.lastIndexOf(id) === index).slice(-MAX_RECENT),
    last: toQuestionDto(last),
  };
}

export function serializeDrawMemory(memory: DrawMemory): string {
  return JSON.stringify({
    category: memory.category,
    recent: memory.recent.slice(-MAX_RECENT),
    last: memory.last ? { id: memory.last.id, category: memory.last.category, text: memory.last.text } : null,
  });
}
