import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
import type { QuestionCategory } from "@/types";

// The prompt for AI conversation topics (S-08, PRD FR-016, NFR-010), pure. Polish only; the content bounds come from
// shape-notes (`AI topics`): bold, but no party politics, religion, health or personal jabs, and nobody is asked
// about their own salary. No guest name or other guest data ever goes into the prompt.

export const AI_TOPIC_SYSTEM_PROMPT = [
  "Jesteś gospodarzem corocznej „kolacji podwyżkowej” — wieczoru, na którym grupa przyjaciół spotyka się przy jedzeniu i rozmowach.",
  "Twoje zadanie: wymyśl JEDEN temat do rozmowy przy stoliku, sformułowany jako pytanie do wszystkich przy stoliku.",
  "",
  "Zasady:",
  "- Pisz wyłącznie po polsku.",
  "- Najwyżej dwa krótkie zdania (do 200 znaków), zakończone znakiem zapytania.",
  "- Trzymaj się podanej kategorii.",
  "- Temat może być odważny i dzielić rozmówców, ale nie dotyczy polityki partyjnej, religii ani zdrowia (także alkoholu, diet, chorób, snu, starzenia się i śmierci).",
  "- Żadnych przytyków ani pytań wymierzonych w konkretne osoby; nie odwołuj się do nikogo z obecnych.",
  "- Nie pytaj nikogo o jego własne zarobki, pensję ani podwyżkę.",
  "- Odpowiedz samą treścią pytania: bez cudzysłowów, wstępu, nagłówka, numeracji i formatowania.",
].join("\n");

// What each category asks of the topic (the labels are the S-07 ones).
export const AI_CATEGORY_DESCRIPTIONS: Readonly<Record<QuestionCategory, string>> = {
  kontrowersyjne: "odważny temat, przy którym zdania wyraźnie się podzielą i zacznie się dyskusja",
  generyczne: "lekki, zabawny temat, na który każdy łatwo coś powie",
  refleksyjne: "głębszy temat, który skłania do refleksji nad sobą, swoimi wyborami i wartościami",
};

// Neutral inspirations that make consecutive topics differ (none touches politics, religion or health).
export const TOPIC_THEMES: readonly string[] = [
  "praca i kariera",
  "pieniądze w sytuacjach hipotetycznych",
  "podróże",
  "jedzenie i gotowanie",
  "technologia i internet",
  "wspomnienia z dzieciństwa",
  "filmy i seriale",
  "muzyka",
  "hobby i pasje",
  "mieszkanie i miasto",
  "przyjaźń",
  "codzienne nawyki",
  "życie za dziesięć lat",
  "nauka i ciekawostki",
  "zwierzęta",
  "pierwsza praca",
  "wymarzony wolny dzień",
  "szkoła i studia",
  "książki i gry",
  "supermoce i sytuacje z wyobraźni",
];

function pickOne<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  const item = items[index];
  if (item === undefined) {
    throw new Error("Pusta lista do losowania.");
  }
  return item;
}

// „Wszystkie” on the chips: the server picks a category at random.
export function pickCategory(random: () => number): QuestionCategory {
  return pickOne(QUESTION_CATEGORIES, random);
}

export function pickTheme(random: () => number): string {
  return pickOne(TOPIC_THEMES, random);
}

// The user message of one request.
export function buildTopicPrompt({ category, theme }: { category: QuestionCategory; theme: string }): string {
  return [
    `Kategoria: ${QUESTION_CATEGORY_LABELS[category]} — ${AI_CATEGORY_DESCRIPTIONS[category]}.`,
    `Inspiracja (nie musisz trzymać się jej dosłownie): ${theme}.`,
    "Napisz jedno pytanie.",
  ].join("\n");
}
