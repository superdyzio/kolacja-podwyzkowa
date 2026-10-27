import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "./categories";
import { deniedIn } from "./bounds";
import { STARTER_QUESTIONS, starterQuestionRows } from "./seed";
import { normalizeQuestionText, questionKey, validateQuestionText } from "./text";
import type { QuestionCategory } from "@/types";

const SEED_MD_PATH = fileURLToPath(new URL("../../../context/foundation/question-seed.md", import.meta.url));

// Loose markdown parse: "## <label> (n)" headings, numbered items "1. text" / "1) text".
function parseSeedMarkdown(markdown: string): Partial<Record<QuestionCategory, string[]>> {
  const byLabel = new Map(QUESTION_CATEGORIES.map((category) => [QUESTION_CATEGORY_LABELS[category], category]));
  const result: Partial<Record<QuestionCategory, string[]>> = {};
  let current: QuestionCategory | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(\S+)/.exec(line);
    if (heading) {
      current = byLabel.get(heading[1]);
      if (current) {
        result[current] = [];
      }
      continue;
    }
    const item = /^\s*\d+[.)]\s+(.+?)\s*$/.exec(line);
    if (item && current) {
      result[current]?.push(item[1]);
    }
  }
  return result;
}

describe("starter question base", () => {
  it("has the three categories in display order with about 30 questions each", () => {
    expect(Object.keys(STARTER_QUESTIONS)).toEqual([...QUESTION_CATEGORIES]);
    for (const category of QUESTION_CATEGORIES) {
      expect(STARTER_QUESTIONS[category].length).toBeGreaterThanOrEqual(25);
      expect(STARTER_QUESTIONS[category].length).toBeLessThanOrEqual(35);
    }
  });

  it("stores every question normalized, 5–300 characters, ending with a question mark", () => {
    for (const { text } of starterQuestionRows()) {
      expect(normalizeQuestionText(text)).toBe(text);
      expect(validateQuestionText(text)).toBeNull();
      expect(text.endsWith("?")).toBe(true);
    }
  });

  it("has no duplicates across all categories (the DB key is case-insensitive)", () => {
    const keys = starterQuestionRows().map((row) => questionKey(row.text));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses no markdown-special characters (the review copy shows them verbatim)", () => {
    for (const { text } of starterQuestionRows()) {
      expect(text).not.toMatch(/[*_<>`#[\]]/);
    }
  });

  it("stays inside the content bounds: no politics, religion, health or personal jabs", () => {
    const offending = starterQuestionRows()
      .map(({ text }) => ({ text, hits: deniedIn(text) }))
      .filter(({ hits }) => hits.length > 0);
    expect(offending).toEqual([]);
  });

  it("lists rows category by category in list order", () => {
    const rows = starterQuestionRows();
    expect(rows).toHaveLength(QUESTION_CATEGORIES.reduce((sum, c) => sum + STARTER_QUESTIONS[c].length, 0));
    expect(rows[0]).toEqual({ category: "kontrowersyjne", text: STARTER_QUESTIONS.kontrowersyjne[0] });
    expect(rows.at(-1)).toEqual({ category: "refleksyjne", text: STARTER_QUESTIONS.refleksyjne.at(-1) });
  });

  it("matches the human-readable copy in context/foundation/question-seed.md", () => {
    const parsed = parseSeedMarkdown(readFileSync(SEED_MD_PATH, "utf8"));
    const expected = Object.fromEntries(
      QUESTION_CATEGORIES.map((category) => [category, [...STARTER_QUESTIONS[category]]]),
    );
    // On failure: edit src/lib/questions/seed.ts and context/foundation/question-seed.md together.
    expect(parsed).toEqual(expected);
  });
});
