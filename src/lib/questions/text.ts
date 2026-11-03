import { normalizeDisplayName, stripListMarker } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import type { QuestionSkipDto, QuestionSkipReason } from "@/types";
import { questionMessages } from "./messages";

// Question text rules shared by the DB service, the API routes and the organizer UI (PRD FR-014). Pure.
//
// A question is stored normalized exactly like a guest's display name (NFC, no invisible characters, single spaces,
// trimmed) and is 5–300 characters long, counted in code points like Postgres char_length(). Questions are unique
// per event regardless of letter case across all categories (questionKey mirrors lower(text) in the DB key).

export const MIN_QUESTION_LENGTH = 5;
export const MAX_QUESTION_LENGTH = 300;
// The base may grow to this many questions through pastes (the starter load is never refused). Together with the
// ~90 starter questions it stays well under PostgREST's max_rows (1000), so a draw reads a category in one request.
export const MAX_QUESTIONS = 500;
// Request body cap for one paste.
export const MAX_PASTE_CHARS = 100_000;

export type QuestionTextProblem = "too-short" | "too-long";

export interface ParsedQuestionPaste {
  // Questions to add, normalized, in paste order (1-based line numbers counting blank lines).
  items: { line: number; text: string }[];
  // Lines that will not be added because of the paste itself (repeats, length); duplicates of the base are found
  // later by the service.
  skipped: QuestionSkipDto[];
}

const LINE_BREAK = /\r\n|\n|\r/;
const PREVIEW_LENGTH = 50;

export function normalizeQuestionText(raw: string): string {
  return normalizeDisplayName(raw);
}

// Comparison key for the "same question" rule (mirrors lower(text) in the DB key).
export function questionKey(text: string): string {
  return normalizeQuestionText(text).toLocaleLowerCase("pl");
}

// Length in code points (an emoji counts once), like Postgres char_length().
export function questionLength(text: string): number {
  return Array.from(text).length;
}

// Expects a normalized text; an empty one is too short.
export function validateQuestionText(text: string): QuestionTextProblem | null {
  const length = questionLength(text);
  if (length < MIN_QUESTION_LENGTH) {
    return "too-short";
  }
  if (length > MAX_QUESTION_LENGTH) {
    return "too-long";
  }
  return null;
}

// Parses a pasted list, one question per line. Blank lines are skipped silently and one list marker ("1. ", "- ",
// "• ") is dropped. Lines that are too short or too long, and repeats of an earlier line, are reported as skipped.
export function parseQuestionPaste(text: string): ParsedQuestionPaste {
  const items: ParsedQuestionPaste["items"] = [];
  const skipped: QuestionSkipDto[] = [];
  const seen = new Set<string>();

  text.split(LINE_BREAK).forEach((rawLine, index) => {
    const line = index + 1;
    const question = stripListMarker(normalizeQuestionText(rawLine));
    if (question === "") {
      return;
    }
    const problem = validateQuestionText(question);
    if (problem) {
      skipped.push({ line, text: question, reason: problem });
      return;
    }
    const key = questionKey(question);
    if (seen.has(key)) {
      skipped.push({ line, text: question, reason: "repeated" });
      return;
    }
    seen.add(key);
    items.push({ line, text: question });
  });

  return { items, skipped };
}

export function describeQuestionProblem(problem: QuestionTextProblem, locale: Locale = "pl"): string {
  const t = questionMessages(locale);
  switch (problem) {
    case "too-short":
      return t.tooShort(MIN_QUESTION_LENGTH);
    case "too-long":
      return t.tooLong(MAX_QUESTION_LENGTH);
  }
}

function preview(text: string): string {
  const characters = Array.from(text);
  return characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join("")}…` : text;
}

function skipReason(reason: QuestionSkipReason, locale: Locale): string {
  const t = questionMessages(locale);
  switch (reason) {
    case "duplicate":
      return t.skipDuplicate;
    case "repeated":
      return t.skipRepeated;
    case "too-short":
      return t.skipTooShort(MIN_QUESTION_LENGTH);
    case "too-long":
      return t.skipTooLong(MAX_QUESTION_LENGTH);
  }
}

// „Linia 3: „Czy…” — już jest w bazie.”
export function describeSkip(skip: QuestionSkipDto, locale: Locale = "pl"): string {
  return questionMessages(locale).skipLine(skip.line, preview(skip.text), skipReason(skip.reason, locale));
}

// „Dodano 12 pytań.” / „Dodano 1 pytanie. Pominięto 2 linie.” / „Nic nie dodano — pominięto 3 linie.”
export function describePasteResult(added: number, skippedCount: number, locale: Locale = "pl"): string {
  const t = questionMessages(locale);
  if (added === 0) {
    return skippedCount === 0 ? t.nothingAdded : t.nothingAddedSkipped(skippedCount);
  }
  const addedText = t.added(added);
  return skippedCount === 0 ? addedText : `${addedText} ${t.skipped(skippedCount)}`;
}

// „Dodano 3 pytania.” for the starter load and similar counts.
export function describeAdded(added: number, locale: Locale = "pl"): string {
  const t = questionMessages(locale);
  return added === 0 ? t.nothingAdded : t.added(added);
}
