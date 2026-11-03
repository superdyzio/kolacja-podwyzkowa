import type { Locale } from "@/lib/i18n/locale";
import type { QuestionCategory } from "@/types";
import { categoryMessages } from "./messages";

// Conversation categories (PRD FR-014..FR-016), pure. The values are stored as is in public.question.category and
// name the AI-topic categories of S-08 too: import the list, labels and guard from here instead of repeating them.

// Display order everywhere (chips, lists, the starter base). A tuple, so `z.enum(QUESTION_CATEGORIES)` works.
export const QUESTION_CATEGORIES = [
  "kontrowersyjne",
  "generyczne",
  "refleksyjne",
] as const satisfies readonly QuestionCategory[];

// The Polish labels (also what the AI prompt names); the UI uses questionCategoryLabels(locale).
export const QUESTION_CATEGORY_LABELS: Readonly<Record<QuestionCategory, string>> = categoryMessages("pl").labels;

// One short line per category for the organizer page and the chips' titles (Polish; see questionCategoryHints).
export const QUESTION_CATEGORY_HINTS: Readonly<Record<QuestionCategory, string>> = categoryMessages("pl").hints;

// The chip that draws from every category (Polish; see allCategoriesLabel).
export const ALL_CATEGORIES_LABEL = categoryMessages("pl").all;

export function questionCategoryLabels(locale: Locale = "pl"): Readonly<Record<QuestionCategory, string>> {
  return categoryMessages(locale).labels;
}

export function questionCategoryHints(locale: Locale = "pl"): Readonly<Record<QuestionCategory, string>> {
  return categoryMessages(locale).hints;
}

export function allCategoriesLabel(locale: Locale = "pl"): string {
  return categoryMessages(locale).all;
}

export function isQuestionCategory(value: unknown): value is QuestionCategory {
  return typeof value === "string" && (QUESTION_CATEGORIES as readonly string[]).includes(value);
}
