import { z } from "astro/zod";
import { MAX_QUIZ_OPTIONS } from "./rules";

// Request bodies of the pub quiz (pub-quiz, S-28). Strict: any extra key (a guest id, a score) is 400
// „Nieprawidłowe dane.”. Texts as typed; the rule (parseQuizQuestion) normalizes and checks them afterwards, so its
// own message explains a wrong number of options, a duplicate or the correct index.

const RawText = z.string().max(400);
const RawOption = z.string().max(200);
const Correct = z.number().int().min(0).max(99);

// POST /api/o/<key>/quiz/questions: a new question (1–4 raw options; a 5th → 400).
export const QuizQuestionBody = z.strictObject({
  text: RawText,
  options: z.array(RawOption).max(MAX_QUIZ_OPTIONS),
  correct: Correct,
});

// PATCH /api/o/<key>/quiz/questions/<id>: any of the three, at least one (checked against the stored question).
export const QuizQuestionPatchBody = z
  .strictObject({
    text: RawText.optional(),
    options: z.array(RawOption).max(MAX_QUIZ_OPTIONS).optional(),
    correct: Correct.optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

const QuestionId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// POST /api/o/<key>/quiz/run: one step of the run.
export const QuizRunBody = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({ action: z.literal("ask"), questionId: QuestionId }),
  z.strictObject({ action: z.literal("close") }),
  z.strictObject({ action: z.literal("results") }),
  z.strictObject({ action: z.literal("end") }),
]);

export type QuizRunRequest = z.infer<typeof QuizRunBody>;

// PUT /api/g/<key>/quiz: the guest's answer (the guest is the key's owner; the body names nobody).
export const GuestQuizAnswerBody = z.strictObject({
  questionId: QuestionId,
  option: z.number().int().min(0).max(99),
});

// What the DB functions answer (validated before use, so a drifting migration fails loudly).
const Count = z.number().int().min(0);
const Phase = z.enum(["intro", "question", "reveal", "results"]);

export const QuizBoardRpcSchema = z.object({
  run: z.object({ phase: Phase, questionId: z.number().int().nullable() }).nullable(),
  questions: z.array(
    z.object({
      id: z.number().int(),
      text: z.string(),
      options: z.array(z.string()),
      correct: z.number().int(),
      askedAt: z.string().nullable(),
      closedAt: z.string().nullable(),
      counts: z.array(Count),
    }),
  ),
  standings: z.array(z.object({ guestId: z.number().int(), name: z.string(), points: Count, answered: Count })),
  guestCount: Count,
});

export const GuestQuizRpcSchema = z.object({
  phase: Phase,
  total: Count,
  closed: Count,
  question: z
    .object({
      id: z.number().int(),
      number: z.number().int(),
      text: z.string(),
      options: z.array(z.string()),
      correct: z.number().int().nullable(),
    })
    .nullable(),
  answer: z.number().int().nullable(),
  points: Count,
  result: z.object({ place: z.number().int(), players: Count }).nullable(),
});

export const TvQuizRpcSchema = z.object({
  version: z.string(),
  phase: Phase,
  total: Count,
  closed: Count,
  question: z
    .object({
      number: z.number().int(),
      text: z.string(),
      options: z.array(z.string()),
      answered: Count,
      correct: z.number().int().nullable(),
      counts: z.array(Count).nullable(),
    })
    .nullable(),
  results: z
    .object({
      players: Count,
      top: z.array(z.object({ place: z.number().int(), name: z.string(), points: Count })),
    })
    .nullable(),
});
