import { z } from "astro/zod";
import { QuestionCategorySchema } from "@/lib/questions/api";

// Request body shared by the guest and organizer AI topic routes (S-08). Strict: any extra key (e.g. a guest id) is
// refused with 400 "Nieprawidłowe dane.". category null = „Wszystkie” (the server picks one).
export const GenerateTopicBody = z.strictObject({
  category: QuestionCategorySchema.nullable(),
});
