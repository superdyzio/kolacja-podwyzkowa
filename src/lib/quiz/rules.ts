import { normalizeDisplayName } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import type { GuestQuizDto, QuizBoardDto, QuizPhase, QuizQuestionDto, QuizStandingDto, TvQuizDto } from "@/types";
import { quizMessages } from "./messages";

// The pub quiz (pub-quiz, S-28; PRD v2 FR-049), pure: limits, the question rule, the ranking, the TV's results cut,
// the phone's token key and the summary. Shared by the server, the client's page, the phone and the TV.
//
// A question has a text (1–200 characters), 2–4 options (each 1–80, distinct in any letter case) and one correct
// option. Questions are asked in any order the client picks; once asked a question is locked (its answers would
// change meaning) and once closed its answers count: 1 point per correct answer. Players = guests with at least one
// answer to a closed question; competition places (1, 2, 2, 4) like the guess ranking.

export const MAX_QUIZ_QUESTIONS = 50;
export const MIN_QUIZ_OPTIONS = 2;
export const MAX_QUIZ_OPTIONS = 4;
export const MAX_QUIZ_TEXT = 200;
export const MAX_QUIZ_OPTION = 80;
// The TV's results (the PRD's exception to „ranking only at the organizer”): places 1–3 (the DB function
// quiz_tv_state mirrors it), ties together, at most this many names, then „+N”.
export const TV_RESULTS_PLACES = 3;
export const TV_RESULTS_LIMIT = 10;

export const QUIZ_PHASES = ["intro", "question", "reveal", "results"] as const satisfies readonly QuizPhase[];
export const QUIZ_ACTIONS = ["start", "ask", "close", "results", "end"] as const;
export type QuizAction = (typeof QUIZ_ACTIONS)[number];

// The `code` of the refusals, so islands and the smoke can tell them apart.
export const QUIZ_CODES = {
  closed: "quiz-closed",
  locked: "quiz-question-locked",
  onTv: "quiz-question-on-tv",
  questionOpen: "quiz-question-open",
  questionAsked: "quiz-question-asked",
  noOpenQuestion: "quiz-no-open-question",
  full: "quiz-full",
} as const;

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

export function isQuizPhase(value: unknown): value is QuizPhase {
  return typeof value === "string" && (QUIZ_PHASES as readonly string[]).includes(value);
}

export interface QuizQuestionInput {
  text: string;
  options: string[];
  correct: number;
}

export type QuizInputProblem = "text" | "too-few" | "too-many" | "option-too-long" | "gap" | "duplicate" | "correct";

export type QuizParseResult = { ok: true; value: QuizQuestionInput } | { ok: false; problem: QuizInputProblem };

function codePoints(text: string): number {
  return Array.from(text).length;
}

// The question as stored: the text and every option normalized like a guest's name (NFC, single spaces, trimmed),
// empty options at the END dropped (an empty one before a filled one is a gap: the correct index would shift), then
// 2–4 options of ≤ 80 characters, distinct in any letter case, and the correct index among them.
export function parseQuizQuestion(raw: { text: string; options: readonly string[]; correct: number }): QuizParseResult {
  const text = normalizeDisplayName(raw.text);
  if (codePoints(text) < 1 || codePoints(text) > MAX_QUIZ_TEXT) {
    return { ok: false, problem: "text" };
  }
  const options = raw.options.map((option) => normalizeDisplayName(option));
  while (options.length > 0 && options[options.length - 1] === "") {
    options.pop();
  }
  if (options.some((option) => option === "")) {
    return { ok: false, problem: "gap" };
  }
  if (options.length < MIN_QUIZ_OPTIONS) {
    return { ok: false, problem: "too-few" };
  }
  if (options.length > MAX_QUIZ_OPTIONS) {
    return { ok: false, problem: "too-many" };
  }
  if (options.some((option) => codePoints(option) > MAX_QUIZ_OPTION)) {
    return { ok: false, problem: "option-too-long" };
  }
  if (new Set(options.map((option) => option.toLocaleLowerCase("pl"))).size !== options.length) {
    return { ok: false, problem: "duplicate" };
  }
  if (!Number.isInteger(raw.correct) || raw.correct < 0 || raw.correct >= options.length) {
    return { ok: false, problem: "correct" };
  }
  return { ok: true, value: { text, options, correct: raw.correct } };
}

export function quizProblemText(problem: QuizInputProblem, locale: Locale = "pl"): string {
  const t = quizMessages(locale);
  switch (problem) {
    case "text":
      return t.textInvalid;
    case "too-few":
      return t.tooFewOptions;
    case "too-many":
      return t.tooManyOptions;
    case "option-too-long":
      return t.optionTooLong;
    case "gap":
      return t.optionGap;
    case "duplicate":
      return t.duplicateOptions;
    case "correct":
      return t.correctInvalid;
  }
}

const polishCollator = new Intl.Collator("pl");

export interface QuizStandingRow {
  guestId: number;
  name: string;
  points: number;
  answered: number;
}

// The live standings, best first: competition places by points; inside a place by the Polish name, then the id, so
// the list never reshuffles between reads.
export function rankQuiz(rows: readonly QuizStandingRow[]): QuizStandingDto[] {
  const sorted = [...rows].sort(
    (a, b) => b.points - a.points || polishCollator.compare(a.name, b.name) || a.guestId - b.guestId,
  );
  const places: number[] = [];
  let place = 0;
  let previous = Number.NaN;
  sorted.forEach((row, index) => {
    if (row.points !== previous) {
      place = index + 1;
      previous = row.points;
    }
    places.push(place);
  });
  const sharing = new Map<number, number>();
  for (const value of places) {
    sharing.set(value, (sharing.get(value) ?? 0) + 1);
  }
  return sorted.map((row, index) => {
    const at = places[index] ?? index + 1;
    return { ...row, place: at, tied: (sharing.get(at) ?? 1) > 1 };
  });
}

// What the TV lists at the results: every player on places 1–3 (the DB already cut by place), by place then the
// Polish name, at most TV_RESULTS_LIMIT names; `more` = the players on those places left out.
export function tvQuizResults(
  players: number,
  top: readonly { place: number; name: string; points: number }[],
): NonNullable<TvQuizDto["results"]> {
  const ordered = top
    .filter((entry) => entry.place <= TV_RESULTS_PLACES)
    .sort((a, b) => a.place - b.place || polishCollator.compare(a.name, b.name));
  const entries = ordered.slice(0, TV_RESULTS_LIMIT).map(({ place, name, points }) => ({ place, name, points }));
  return { players, entries, more: ordered.length - entries.length };
}

// The guest token's quiz part (hashed with the rest of the phone's live state): everything the phone shows of the
// quiz. Question texts and options never change once asked, so the id stands for them.
export function quizKey(quiz: GuestQuizDto): string {
  return [
    quiz.phase,
    quiz.total,
    quiz.closed,
    quiz.question?.id ?? "",
    quiz.question?.number ?? "",
    quiz.question?.correct ?? "",
    quiz.answer ?? "",
    quiz.points,
    quiz.result?.place ?? "",
    quiz.result?.players ?? "",
  ].join("|");
}

// The first question never asked (creation order), or null when every question was asked.
export function nextQuestion(questions: readonly QuizQuestionDto[]): QuizQuestionDto | null {
  return questions.find((question) => question.askedAt === null) ?? null;
}

// The question on the TV (asked and shown now), or null.
export function shownQuestion(board: QuizBoardDto): QuizQuestionDto | null {
  const id = board.run?.questionId ?? null;
  return id === null ? null : (board.questions.find((question) => question.id === id) ?? null);
}

export type QuizQuestionStatus = "draft" | "on-tv" | "closed" | "asked";

// A question's state on the client's list: on the TV now, closed (counted), asked (an open question the quiz ended
// without — cannot happen through the actions, kept for safety) or still to ask.
export function questionStatus(question: QuizQuestionDto, board: QuizBoardDto): QuizQuestionStatus {
  if (board.run?.questionId === question.id) {
    return "on-tv";
  }
  if (question.closedAt !== null) {
    return "closed";
  }
  return question.askedAt !== null ? "asked" : "draft";
}

// The correct answers of a question (for the client's list).
export function correctAnswers(question: QuizQuestionDto): number {
  return question.counts[question.correct] ?? 0;
}

// The shell card's and the panel's line: „5 pytań · trwa: pytanie 2 z 5 · 12 graczy”.
export function formatQuizSummary(board: QuizBoardDto, locale: Locale = "pl"): string {
  const t = quizMessages(locale);
  const total = board.questions.length;
  if (total === 0) {
    return t.summaryNone;
  }
  const parts = [t.summaryQuestions(total)];
  const run = board.run;
  if (!run) {
    parts.push(t.summaryIdle);
  } else if (run.phase === "intro") {
    parts.push(t.summaryIntro);
  } else if (run.phase === "results") {
    parts.push(t.summaryResults);
  } else {
    const shown = shownQuestion(board);
    parts.push(t.summaryRunning(shown?.number ?? board.closed, total));
  }
  if (board.standings.length > 0) {
    parts.push(t.summaryPlayers(board.standings.length));
  }
  return parts.join(" · ");
}
