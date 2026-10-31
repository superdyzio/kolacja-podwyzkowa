import type { QuestionCategory } from "@/types";

// Conversation categories (PRD FR-014..FR-016), pure. The values are stored as is in public.question.category and
// name the AI-topic categories of S-08 too: import the list, labels and guard from here instead of repeating them.

// Display order everywhere (chips, lists, the starter base). A tuple, so `z.enum(QUESTION_CATEGORIES)` works.
export const QUESTION_CATEGORIES = [
  "kontrowersyjne",
  "generyczne",
  "refleksyjne",
] as const satisfies readonly QuestionCategory[];

export const QUESTION_CATEGORY_LABELS: Readonly<Record<QuestionCategory, string>> = {
  kontrowersyjne: "Kontrowersyjne",
  generyczne: "Generyczne",
  refleksyjne: "Refleksyjne",
};

// One short line per category for the organizer page and the chips' titles.
export const QUESTION_CATEGORY_HINTS: Readonly<Record<QuestionCategory, string>> = {
  kontrowersyjne: "Odważne, dzielą stół na pół.",
  generyczne: "Lekkie, dla każdego.",
  refleksyjne: "Głębsze, o sobie.",
};

// The chip that draws from every category.
export const ALL_CATEGORIES_LABEL = "Wszystkie";

export function isQuestionCategory(value: unknown): value is QuestionCategory {
  return typeof value === "string" && (QUESTION_CATEGORIES as readonly string[]).includes(value);
}
