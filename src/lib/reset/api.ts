import { z } from "astro/zod";
import { RESET_PARTS, TRIAL_RESET_PARTS } from "./parts";

// Schemas of the organizer reset: the request body of POST /api/o/<key>/reset (strict: any extra key is 400
// „Nieprawidłowe dane.”) and the JSON the DB functions reset_counts / reset_event answer with (validated before use,
// so a drifting migration fails loudly instead of showing wrong numbers).

export const ResetPartSchema = z.enum(RESET_PARTS);

export const ResetRequestBody = z.strictObject({
  parts: z.array(ResetPartSchema).min(1).max(RESET_PARTS.length),
});

// POST /api/o/<key>/trial-reset — the client's „Reset prób”: only the trial parts (strict like the full reset).
export const TrialResetRequestBody = z.strictObject({
  parts: z.array(z.enum(TRIAL_RESET_PARTS)).min(1).max(TRIAL_RESET_PARTS.length),
});

const Count = z.number().int().min(0);

export const ResetCountsSchema = z.strictObject({
  guesses: Count,
  correctAmountSet: z.boolean(),
  intakeOpen: z.boolean(),
  aiAttempts: Count,
  aiUsed: Count,
  seats: Count,
  pinned: Count,
  snapshots: Count,
  guests: Count,
  groups: Count,
  plan: z.boolean(),
  rooms: Count,
  tables: Count,
  orders: Count,
  questions: Count,
  guestAccessEnabled: z.boolean(),
  // pub-quiz (S-28).
  quizAnswers: Count,
  quizAsked: Count,
});

export const ResetEventAnswerSchema = z.strictObject({
  parts: z.array(ResetPartSchema).min(1),
  before: ResetCountsSchema,
  questionsAdded: Count,
  guestKeysReplaced: Count,
});
