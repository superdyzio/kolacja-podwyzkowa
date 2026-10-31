import { z } from "astro/zod";
import { QUESTION_CATEGORIES } from "./categories";
import { MAX_RECENT } from "./draw";

// Request bodies shared by the organizer and guest question routes (S-07). Strict: any extra key (e.g. a guest id)
// is refused with 400 "Nieprawidłowe dane.".

export const QuestionCategorySchema = z.enum(QUESTION_CATEGORIES);

// POST …/questions/draw — category null = every category; recent = ids drawn lately, oldest first.
export const DrawQuestionBody = z.strictObject({
  category: QuestionCategorySchema.nullable(),
  recent: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).max(MAX_RECENT).optional(),
});
