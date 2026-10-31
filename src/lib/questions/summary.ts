import { pluralPl } from "@/lib/guests/summary";
import type { QuestionCategory, QuestionDto } from "@/types";
import { QUESTION_CATEGORIES } from "./categories";

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
export function formatQuestionSummary(questions: readonly Pick<QuestionDto, "category">[]): string {
  const counts = countQuestions(questions);
  if (counts.all === 0) {
    return "Baza pytań jest pusta";
  }
  return [
    `${counts.all} ${pluralPl(counts.all, "pytanie", "pytania", "pytań")}`,
    ...QUESTION_CATEGORIES.map((category) => `${category} ${counts[category]}`),
  ].join(" · ");
}
