import type { Locale } from "@/lib/i18n/locale";
import type { QuestionCategory, QuestionDto } from "@/types";
import { QUESTION_CATEGORIES } from "./categories";
import { questionMessages } from "./messages";

// Counts for the organizer shell card and the category filter (pure).

export type QuestionCounts = { all: number } & Record<QuestionCategory, number>;

export function countQuestions(questions: readonly Pick<QuestionDto, "category">[]): QuestionCounts {
  const counts: QuestionCounts = { all: questions.length, kontrowersyjne: 0, generyczne: 0, refleksyjne: 0 };
  for (const question of questions) {
    counts[question.category]++;
  }
  return counts;
}

// „90 pytań · kontrowersyjne 30 · generyczne 30 · refleksyjne 30” / „Baza pytań jest pusta”
// (English: "90 questions · controversial 30 · general 30 · reflective 30").
export function formatQuestionSummary(
  questions: readonly Pick<QuestionDto, "category">[],
  locale: Locale = "pl",
): string {
  const t = questionMessages(locale);
  const counts = countQuestions(questions);
  if (counts.all === 0) {
    return t.summaryEmpty;
  }
  return [
    t.summaryCount(counts.all),
    ...QUESTION_CATEGORIES.map((category) => t.summaryCategory(category, counts[category])),
  ].join(" · ");
}
