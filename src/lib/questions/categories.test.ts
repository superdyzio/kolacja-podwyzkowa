import { describe, expect, it } from "vitest";
import {
  allCategoriesLabel,
  isQuestionCategory,
  QUESTION_CATEGORIES,
  QUESTION_CATEGORY_HINTS,
  QUESTION_CATEGORY_LABELS,
  questionCategoryHints,
  questionCategoryLabels,
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

  it("has an English label and hint for each (i18n)", () => {
    expect(questionCategoryLabels("en")).toEqual({
      kontrowersyjne: "Controversial",
      generyczne: "General",
      refleksyjne: "Reflective",
    });
    expect(questionCategoryLabels()).toBe(QUESTION_CATEGORY_LABELS);
    for (const category of QUESTION_CATEGORIES) {
      expect(questionCategoryHints("en")[category].length).toBeGreaterThan(0);
    }
    expect(allCategoriesLabel("en")).toBe("All");
  });

  it("guards unknown values", () => {
    expect(isQuestionCategory("refleksyjne")).toBe(true);
    expect(isQuestionCategory("Refleksyjne")).toBe(false);
    expect(isQuestionCategory("polityczne")).toBe(false);
    expect(isQuestionCategory(null)).toBe(false);
    expect(isQuestionCategory(1)).toBe(false);
  });
});
