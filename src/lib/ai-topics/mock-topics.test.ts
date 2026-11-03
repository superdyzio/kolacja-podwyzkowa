import { describe, expect, it } from "vitest";
import { deniedIn } from "@/lib/questions/bounds";
import { QUESTION_CATEGORIES } from "@/lib/questions/categories";
import { starterQuestionRows } from "@/lib/questions/seed";
import { questionKey } from "@/lib/questions/text";
import { MOCK_TOPICS, MOCK_TOPICS_EN } from "./mock-topics";
import { sanitizeTopic } from "./sanitize";

const ALL = QUESTION_CATEGORIES.flatMap((category) => MOCK_TOPICS[category]);

describe("mock AI topics", () => {
  it("has about a dozen questions in every category", () => {
    expect(Object.keys(MOCK_TOPICS)).toEqual([...QUESTION_CATEGORIES]);
    for (const category of QUESTION_CATEGORIES) {
      expect(MOCK_TOPICS[category].length).toBeGreaterThanOrEqual(10);
    }
  });

  it("are clean questions that pass the sanitizer unchanged", () => {
    for (const topic of ALL) {
      expect(sanitizeTopic(topic)).toBe(topic);
      expect(topic.endsWith("?")).toBe(true);
    }
  });

  it("stay inside the content bounds", () => {
    const offending = ALL.map((text) => ({ text, hits: deniedIn(text) })).filter(({ hits }) => hits.length > 0);
    expect(offending).toEqual([]);
  });

  it("repeat neither each other nor the starter base", () => {
    const keys = ALL.map(questionKey);
    expect(new Set(keys).size).toBe(keys.length);
    const starter = new Set(starterQuestionRows().map((row) => questionKey(row.text)));
    expect(keys.filter((key) => starter.has(key))).toEqual([]);
  });
});

describe("English mock AI topics (i18n)", () => {
  const ALL_EN = QUESTION_CATEGORIES.flatMap((category) => MOCK_TOPICS_EN[category]);

  it("has about a dozen in every category, clean and unique", () => {
    expect(Object.keys(MOCK_TOPICS_EN)).toEqual([...QUESTION_CATEGORIES]);
    for (const category of QUESTION_CATEGORIES) {
      expect(MOCK_TOPICS_EN[category].length).toBeGreaterThanOrEqual(10);
    }
    for (const topic of ALL_EN) {
      expect(sanitizeTopic(topic)).toBe(topic);
      expect(topic.endsWith("?")).toBe(true);
    }
    const keys = ALL_EN.map(questionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stay inside the English content bounds", () => {
    const offending = ALL_EN.map((text) => ({ text, hits: deniedIn(text, "en") })).filter(
      ({ hits }) => hits.length > 0,
    );
    expect(offending).toEqual([]);
  });
});
