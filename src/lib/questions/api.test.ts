import { describe, expect, it } from "vitest";
import { DrawQuestionBody, QuestionCategorySchema } from "./api";
import { MAX_RECENT } from "./draw";

describe("question request schemas", () => {
  it("accepts the three stored categories only", () => {
    expect(QuestionCategorySchema.safeParse("generyczne").success).toBe(true);
    expect(QuestionCategorySchema.safeParse("Generyczne").success).toBe(false);
    expect(QuestionCategorySchema.safeParse("polityczne").success).toBe(false);
  });

  it("takes a category or null, and an optional capped list of positive ids", () => {
    expect(DrawQuestionBody.safeParse({ category: null }).success).toBe(true);
    expect(DrawQuestionBody.safeParse({ category: "refleksyjne", recent: [1, 2, 3] }).success).toBe(true);
    expect(
      DrawQuestionBody.safeParse({ category: null, recent: Array.from({ length: MAX_RECENT }, (_, i) => i + 1) })
        .success,
    ).toBe(true);
    expect(
      DrawQuestionBody.safeParse({ category: null, recent: Array.from({ length: MAX_RECENT + 1 }, (_, i) => i + 1) })
        .success,
    ).toBe(false);
    expect(DrawQuestionBody.safeParse({ category: null, recent: [0] }).success).toBe(false);
    expect(DrawQuestionBody.safeParse({ category: null, recent: [1.5] }).success).toBe(false);
    expect(DrawQuestionBody.safeParse({}).success).toBe(false);
  });

  it("refuses extra keys such as a guest id", () => {
    expect(DrawQuestionBody.safeParse({ category: null, guestId: 7 }).success).toBe(false);
  });
});
