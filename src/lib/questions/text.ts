import { normalizeDisplayName, stripListMarker } from "@/lib/guests/names";
import { pluralPl } from "@/lib/guests/summary";
import type { QuestionSkipDto, QuestionSkipReason } from "@/types";

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

export function describeQuestionProblem(problem: QuestionTextProblem): string {
  switch (problem) {
    case "too-short":
      return `Pytanie musi mieć co najmniej ${MIN_QUESTION_LENGTH} znaków.`;
    case "too-long":
      return `Pytanie może mieć najwyżej ${MAX_QUESTION_LENGTH} znaków.`;
  }
}

function preview(text: string): string {
  const characters = Array.from(text);
  return characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join("")}…` : text;
}

const SKIP_REASONS: Record<QuestionSkipReason, string> = {
  duplicate: "już jest w bazie.",
  repeated: "powtarza się we wklejce.",
  "too-short": `za krótkie (min. ${MIN_QUESTION_LENGTH} znaków).`,
  "too-long": `za długie (maks. ${MAX_QUESTION_LENGTH} znaków).`,
};

// „Linia 3: „Czy…” — już jest w bazie.”
export function describeSkip(skip: QuestionSkipDto): string {
  return `Linia ${skip.line}: „${preview(skip.text)}” — ${SKIP_REASONS[skip.reason]}`;
}

function questionCount(count: number): string {
  return `${count} ${pluralPl(count, "pytanie", "pytania", "pytań")}`;
}

function lineCount(count: number): string {
  return `${count} ${pluralPl(count, "linię", "linie", "linii")}`;
}

// „Dodano 12 pytań.” / „Dodano 1 pytanie. Pominięto 2 linie.” / „Nic nie dodano — pominięto 3 linie.”
export function describePasteResult(added: number, skippedCount: number): string {
  if (added === 0) {
    return skippedCount === 0 ? "Nic nie dodano." : `Nic nie dodano — pominięto ${lineCount(skippedCount)}.`;
  }
  const addedText = `Dodano ${questionCount(added)}.`;
  return skippedCount === 0 ? addedText : `${addedText} Pominięto ${lineCount(skippedCount)}.`;
}

// „Dodano 3 pytania.” for the starter load and similar counts.
export function describeAdded(added: number): string {
  return added === 0 ? "Nic nie dodano." : `Dodano ${questionCount(added)}.`;
}
