import { describe, expect, it } from "vitest";
import {
  isQuestionCategory,
  QUESTION_CATEGORIES,
  QUESTION_CATEGORY_HINTS,
  QUESTION_CATEGORY_LABELS,
} from "./categories";

describe("question categories", () => {
  it("stores exactly the three PRD categories in display order", () => {
    expect(QUESTION_CATEGORIES).toEqual(["kontrowersyjne", "generyczne", "refleksyjne"]);
  });

  it("has a Polish label and hint for each", () => {
    for (const category of QUESTION_CATEGORIES) {
      expect(QUESTION_CATEGORY_LABELS[category]).toMatch(/^[A-ZŻŹĆĄŚĘŁÓŃ]/);
      expect(QUESTION_CATEGORY_HINTS[category].length).toBeGreaterThan(0);
    }
  });

  it("guards unknown values", () => {
    expect(isQuestionCategory("refleksyjne")).toBe(true);
    expect(isQuestionCategory("Refleksyjne")).toBe(false);
    expect(isQuestionCategory("polityczne")).toBe(false);
    expect(isQuestionCategory(null)).toBe(false);
    expect(isQuestionCategory(1)).toBe(false);
  });
});
