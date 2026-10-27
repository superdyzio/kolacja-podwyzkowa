import { describe, expect, it } from "vitest";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "@/lib/questions/categories";
import { deniedIn } from "@/lib/questions/bounds";
import {
  AI_CATEGORY_DESCRIPTIONS,
  AI_TOPIC_SYSTEM_PROMPT,
  buildTopicPrompt,
  pickCategory,
  pickTheme,
  TOPIC_THEMES,
} from "./prompt";

describe("AI topic prompt", () => {
  it("asks for one short Polish question within the content bounds", () => {
    for (const phrase of [
      "po polsku",
      "JEDEN temat",
      "dwa krótkie zdania",
      "kategorii",
      "polityki partyjnej",
      "religii",
      "zdrowia",
      "przytyków",
      "zarobki",
      "bez cudzysłowów",
    ]) {
      expect(AI_TOPIC_SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it("names the category and its description and the theme", () => {
    for (const category of QUESTION_CATEGORIES) {
      const prompt = buildTopicPrompt({ category, theme: "podróże" });
      expect(prompt).toContain(QUESTION_CATEGORY_LABELS[category]);
      expect(prompt).toContain(AI_CATEGORY_DESCRIPTIONS[category]);
      expect(prompt).toContain("podróże");
      expect(prompt).not.toMatch(/[{}]/);
    }
  });

  it("uses only inspirations within the content bounds", () => {
    expect(TOPIC_THEMES.length).toBeGreaterThanOrEqual(15);
    expect(TOPIC_THEMES.flatMap((theme) => deniedIn(theme))).toEqual([]);
    expect(new Set(TOPIC_THEMES).size).toBe(TOPIC_THEMES.length);
  });

  it("picks categories and themes across the whole range", () => {
    expect(pickCategory(() => 0)).toBe("kontrowersyjne");
    expect(pickCategory(() => 0.999_999)).toBe("refleksyjne");
    expect(pickTheme(() => 0)).toBe(TOPIC_THEMES[0]);
    expect(pickTheme(() => 0.999_999)).toBe(TOPIC_THEMES.at(-1));
  });
});
