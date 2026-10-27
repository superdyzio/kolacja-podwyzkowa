import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "./categories";
import { STARTER_QUESTIONS, starterQuestionRows } from "./seed";
import { normalizeQuestionText, questionKey, validateQuestionText } from "./text";
import type { QuestionCategory } from "@/types";

const SEED_MD_PATH = fileURLToPath(new URL("../../../context/foundation/question-seed.md", import.meta.url));

// Content bounds (shape-notes): no party politics, religion, health or personal jabs. Matched on whole lowercase
// words (prefixes or exact words) and on phrases, so "porządek" never trips "rząd" and "bogaty" never trips "boga".
const DENIED_WORD_PREFIXES = [
  // party politics
  "polity",
  "partyj",
  "partii",
  "partia",
  "rząd",
  "podat",
  "imigr",
  "emigr",
  "wybory",
  "wyborach",
  "wyborc",
  "sejm",
  "prezydent",
  "premier",
  "lewic",
  "prawic",
  // religion, the afterlife, fate, astrology
  "religi",
  "kości",
  "modl",
  "grzech",
  "piekł",
  "zaświat",
  "przeznaczeni",
  "horoskop",
  "astrolog",
  "zodiak",
  // health, alcohol, diet and weight, sleep, burnout, therapy, aging and death
  "zdrow",
  "chor",
  "lekarz",
  "lekarst",
  "terapi",
  "psycholog",
  "alkohol",
  "wódk",
  "piw",
  "diet",
  "odchudz",
  "schud",
  "bezsenn",
  "wypalen",
  "starze",
  "starość",
  "emeryt",
  "śmier",
  "umier",
  "umrz",
  "pogrzeb",
  "zmarł",
];
const DENIED_WORDS = [
  "bóg",
  "boga",
  "bogu",
  "wiara",
  "wiary",
  "karma",
  "karmy",
  "ue",
  "unia",
  "unii",
  "sen",
  "snu",
  "spać",
  "wino",
  "waga",
  "wagi",
  "wagę",
  "kac",
];
const DENIED_PHRASES = [
  "przy tym stole",
  "przy stole",
  "kto z nas",
  "kto z was",
  "ile zarabiasz",
  "twoja pensja",
  "twoje zarobki",
  "twoja wypłata",
];

function deniedIn(text: string): string[] {
  const lower = text.toLocaleLowerCase("pl");
  const words = lower.match(/\p{L}+/gu) ?? [];
  const hits = words.filter(
    (word) => DENIED_WORDS.includes(word) || DENIED_WORD_PREFIXES.some((prefix) => word.startsWith(prefix)),
  );
  return [...hits, ...DENIED_PHRASES.filter((phrase) => lower.includes(phrase))];
}

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

  it("the denylist itself catches what it should and spares lookalikes", () => {
    expect(deniedIn("Czy rząd powinien…?")).toEqual(["rząd"]);
    expect(deniedIn("Czy bogaty człowiek ma porządek?")).toEqual([]);
    expect(deniedIn("Kto przy tym stole zarabia najwięcej?")).toContain("przy tym stole");
    expect(deniedIn("Ile zarabiasz?")).toContain("ile zarabiasz");
    expect(deniedIn("Czy powinno się zdrowo jeść?")).toEqual(["zdrowo"]);
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
