import { describe, expect, it } from "vitest";
import type { GuestQuizDto, QuizBoardDto, QuizQuestionDto } from "@/types";
import { GuestQuizAnswerBody, QuizQuestionBody, QuizQuestionPatchBody, QuizRunBody } from "./api";
import { quizMessages } from "./messages";
import {
  correctAnswers,
  formatQuizSummary,
  MAX_QUIZ_QUESTIONS,
  nextQuestion,
  optionLetter,
  parseQuizQuestion,
  questionStatus,
  quizKey,
  quizProblemText,
  rankQuiz,
  shownQuestion,
  tvQuizResults,
  TV_RESULTS_LIMIT,
} from "./rules";

// pub-quiz (S-28): the question rule, the ranking (competition places), the TV's results cut, the phone token key, the
// summaries and the request bodies.

function question(id: number, overrides: Partial<QuizQuestionDto> = {}): QuizQuestionDto {
  return {
    id,
    number: id,
    text: `Pytanie ${id}`,
    options: ["Tak", "Nie"],
    correct: 0,
    askedAt: null,
    closedAt: null,
    answers: 0,
    counts: [0, 0],
    ...overrides,
  };
}

function board(overrides: Partial<QuizBoardDto> = {}): QuizBoardDto {
  return {
    run: null,
    questions: [question(1), question(2), question(3)],
    standings: [],
    closed: 0,
    guestCount: 10,
    maxQuestions: MAX_QUIZ_QUESTIONS,
    ...overrides,
  };
}

describe("parseQuizQuestion", () => {
  it("normalizes the texts and drops empty options at the end", () => {
    expect(
      parseQuizQuestion({ text: "  Kiedy   Ania  zaczęła? ", options: [" 2019 ", "2020", "", "  "], correct: 1 }),
    ).toEqual({ ok: true, value: { text: "Kiedy Ania zaczęła?", options: ["2019", "2020"], correct: 1 } });
  });

  it("refuses a bad text, too few or too many options, gaps, long options, duplicates and a wrong index", () => {
    const problem = (raw: { text: string; options: string[]; correct: number }) => {
      const result = parseQuizQuestion(raw);
      return result.ok ? null : result.problem;
    };
    expect(problem({ text: "   ", options: ["a", "b"], correct: 0 })).toBe("text");
    expect(problem({ text: "x".repeat(201), options: ["a", "b"], correct: 0 })).toBe("text");
    expect(problem({ text: "Q", options: ["a", ""], correct: 0 })).toBe("too-few");
    expect(problem({ text: "Q", options: ["a", "b", "c", "d", "e"], correct: 0 })).toBe("too-many");
    expect(problem({ text: "Q", options: ["a", "", "c"], correct: 0 })).toBe("gap");
    expect(problem({ text: "Q", options: ["a", "b".repeat(81)], correct: 0 })).toBe("option-too-long");
    expect(problem({ text: "Q", options: ["Kraków", "KRAKÓW"], correct: 0 })).toBe("duplicate");
    expect(problem({ text: "Q", options: ["a", "b"], correct: 2 })).toBe("correct");
    expect(problem({ text: "Q", options: ["a", "b", "", ""], correct: 2 })).toBe("correct");
    expect(problem({ text: "x".repeat(200), options: ["a", "b".repeat(80)], correct: 1 })).toBeNull();
  });

  it("explains every problem in both languages", () => {
    for (const p of ["text", "too-few", "too-many", "option-too-long", "gap", "duplicate", "correct"] as const) {
      expect(quizProblemText(p, "pl").length).toBeGreaterThan(0);
      expect(quizProblemText(p, "en").length).toBeGreaterThan(0);
      expect(quizProblemText(p, "en")).not.toBe(quizProblemText(p, "pl"));
    }
  });
});

describe("rankQuiz", () => {
  it("gives competition places by points, ties by the Polish name then the id", () => {
    const ranked = rankQuiz([
      { guestId: 4, name: "Żaneta", points: 2, answered: 3 },
      { guestId: 1, name: "Łukasz", points: 3, answered: 3 },
      { guestId: 3, name: "Adam", points: 2, answered: 2 },
      { guestId: 2, name: "Ćwir", points: 0, answered: 1 },
      { guestId: 5, name: "Adam", points: 2, answered: 3 },
    ]);
    expect(ranked.map((row) => [row.place, row.tied, row.guestId])).toEqual([
      [1, false, 1],
      [2, true, 3],
      [2, true, 5],
      [2, true, 4],
      [5, false, 2],
    ]);
  });

  it("is empty without players", () => {
    expect(rankQuiz([])).toEqual([]);
  });
});

describe("tvQuizResults", () => {
  it("lists places 1–3 by place then name, cut at the limit with the rest counted", () => {
    const top = [
      { place: 2, name: "Basia", points: 4 },
      { place: 1, name: "Zenek", points: 5 },
      { place: 2, name: "Adam", points: 4 },
      { place: 4, name: "Olek", points: 1 },
    ];
    expect(tvQuizResults(7, top)).toEqual({
      players: 7,
      entries: [
        { place: 1, name: "Zenek", points: 5 },
        { place: 2, name: "Adam", points: 4 },
        { place: 2, name: "Basia", points: 4 },
      ],
      more: 0,
    });
    const many = Array.from({ length: TV_RESULTS_LIMIT + 3 }, (_, index) => ({
      place: 1,
      name: `Gość ${String(index).padStart(2, "0")}`,
      points: 3,
    }));
    const cut = tvQuizResults(20, many);
    expect(cut.entries).toHaveLength(TV_RESULTS_LIMIT);
    expect(cut.more).toBe(3);
  });
});

describe("quizKey", () => {
  const shown = { id: 7, number: 1, text: "Q", options: ["a", "b"], correct: null };
  const base: GuestQuizDto = {
    phase: "question",
    total: 3,
    closed: 0,
    question: shown,
    answer: null,
    points: 0,
    result: null,
  };

  it("changes with everything the phone shows", () => {
    const key = quizKey(base);
    expect(quizKey({ ...base })).toBe(key);
    expect(quizKey({ ...base, answer: 1 })).not.toBe(key);
    expect(quizKey({ ...base, phase: "reveal", question: { ...shown, correct: 0 } })).not.toBe(key);
    expect(quizKey({ ...base, points: 1, closed: 1 })).not.toBe(key);
    expect(quizKey({ ...base, phase: "results", question: null, result: { place: 1, players: 4 } })).not.toBe(key);
    expect(quizKey({ ...base, question: { ...shown, id: 8, number: 2 } })).not.toBe(key);
    expect(quizKey({ ...base, total: 4 })).not.toBe(key);
  });
});

describe("the client's board helpers", () => {
  it("finds the next question, the one on the TV and each question's status", () => {
    const asked = board({
      run: { phase: "question", questionId: 2 },
      questions: [
        question(1, { askedAt: "t", closedAt: "t", counts: [3, 1], answers: 4 }),
        question(2, { askedAt: "t" }),
        question(3),
      ],
      closed: 1,
    });
    expect(nextQuestion(asked.questions)?.id).toBe(3);
    expect(shownQuestion(asked)?.id).toBe(2);
    expect(asked.questions.map((q) => questionStatus(q, asked))).toEqual(["closed", "on-tv", "draft"]);
    expect(correctAnswers(asked.questions[0])).toBe(3);
    expect(nextQuestion([question(1, { askedAt: "t" })])).toBeNull();
    expect(shownQuestion(board())).toBeNull();
  });

  it("summarizes the quiz for the shell card and the panel", () => {
    expect(formatQuizSummary(board({ questions: [] }))).toBe("brak pytań");
    expect(formatQuizSummary(board())).toBe("3 pytania · gotowy do startu");
    expect(formatQuizSummary(board({ run: { phase: "intro", questionId: null } }))).toBe("3 pytania · trwa: zapowiedź");
    expect(
      formatQuizSummary(
        board({
          run: { phase: "question", questionId: 2 },
          standings: [{ place: 1, tied: false, guestId: 1, name: "Ania", points: 1, answered: 1 }],
        }),
      ),
    ).toBe("3 pytania · trwa: pytanie 2 z 3 · 1 gracz");
    expect(formatQuizSummary(board({ run: { phase: "results", questionId: null } }), "en")).toBe(
      "3 questions · results on the TV",
    );
  });

  it("letters the options", () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("request bodies", () => {
  it("takes a question, a patch with at least one field, a run step and a guest answer, strictly", () => {
    expect(QuizQuestionBody.safeParse({ text: "Q", options: ["a", "b"], correct: 0 }).success).toBe(true);
    expect(QuizQuestionBody.safeParse({ text: "Q", options: ["a", "b", "c", "d", "e"], correct: 0 }).success).toBe(
      false,
    );
    expect(QuizQuestionBody.safeParse({ text: "Q", options: ["a", "b"], correct: 0, points: 2 }).success).toBe(false);
    expect(QuizQuestionPatchBody.safeParse({}).success).toBe(false);
    expect(QuizQuestionPatchBody.safeParse({ correct: 1 }).success).toBe(true);
    expect(QuizRunBody.safeParse({ action: "start" }).success).toBe(true);
    expect(QuizRunBody.safeParse({ action: "ask", questionId: 3 }).success).toBe(true);
    expect(QuizRunBody.safeParse({ action: "ask" }).success).toBe(false);
    expect(QuizRunBody.safeParse({ action: "close", questionId: 3 }).success).toBe(false);
    expect(QuizRunBody.safeParse({ action: "skip" }).success).toBe(false);
    expect(GuestQuizAnswerBody.safeParse({ questionId: 3, option: 1 }).success).toBe(true);
    expect(GuestQuizAnswerBody.safeParse({ questionId: 3, option: 1, guestId: 2 }).success).toBe(false);
    expect(GuestQuizAnswerBody.safeParse({ questionId: 0, option: 1 }).success).toBe(false);
    expect(GuestQuizAnswerBody.safeParse({ questionId: 3, option: -1 }).success).toBe(false);
  });
});

describe("messages", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(quizMessages("en")).sort()).toEqual(Object.keys(quizMessages("pl")).sort());
  });
});
