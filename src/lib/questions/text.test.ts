import { describe, expect, it } from "vitest";
import {
  describeAdded,
  describePasteResult,
  describeQuestionProblem,
  describeSkip,
  MAX_QUESTION_LENGTH,
  MIN_QUESTION_LENGTH,
  normalizeQuestionText,
  parseQuestionPaste,
  questionKey,
  questionLength,
  validateQuestionText,
} from "./text";

describe("normalizeQuestionText", () => {
  it("trims, collapses whitespace (NBSP, tabs) and drops invisible characters", () => {
    expect(normalizeQuestionText("  Czy warto\t\tzmieniać​ pracę?  ")).toBe("Czy warto zmieniać pracę?");
  });

  it("composes Polish letters (NFC)", () => {
    const decomposed = "Żółw?".normalize("NFD");
    expect(normalizeQuestionText(decomposed)).toBe("Żółw?");
  });
});

describe("questionKey", () => {
  it("ignores letter case, Polish letters included", () => {
    expect(questionKey("ŻÓŁTA Łódź?")).toBe(questionKey("żółta łódź?"));
    expect(questionKey("  Kawa  czy herbata? ")).toBe("kawa czy herbata?");
  });
});

describe("validateQuestionText", () => {
  it("accepts 5 to 300 code points", () => {
    expect(validateQuestionText("x".repeat(MIN_QUESTION_LENGTH))).toBeNull();
    expect(validateQuestionText("x".repeat(MAX_QUESTION_LENGTH))).toBeNull();
  });

  it("refuses too short (also empty) and too long", () => {
    expect(validateQuestionText("")).toBe("too-short");
    expect(validateQuestionText("x".repeat(MIN_QUESTION_LENGTH - 1))).toBe("too-short");
    expect(validateQuestionText("x".repeat(MAX_QUESTION_LENGTH + 1))).toBe("too-long");
  });

  it("counts an emoji once, like Postgres char_length()", () => {
    expect(questionLength("🙂🙂🙂🙂🙂")).toBe(5);
    expect(validateQuestionText("🙂🙂🙂🙂🙂")).toBeNull();
    expect(validateQuestionText(`${"x".repeat(MAX_QUESTION_LENGTH - 1)}🙂`)).toBeNull();
  });

  it("describes problems in Polish", () => {
    expect(describeQuestionProblem("too-short")).toBe("Pytanie musi mieć co najmniej 5 znaków.");
    expect(describeQuestionProblem("too-long")).toBe("Pytanie może mieć najwyżej 300 znaków.");
  });
});

describe("parseQuestionPaste", () => {
  it("takes one question per line, skipping blank lines but counting them", () => {
    const parsed = parseQuestionPaste("Pierwsze pytanie?\n\n  \r\nDrugie pytanie?\r\nTrzecie pytanie?");
    expect(parsed.items).toEqual([
      { line: 1, text: "Pierwsze pytanie?" },
      { line: 4, text: "Drugie pytanie?" },
      { line: 5, text: "Trzecie pytanie?" },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it("drops one list marker", () => {
    const parsed = parseQuestionPaste("1. Pierwsze?!\n- Drugie?!\n• Trzecie?!\n12) Czwarte?!\n2Pac czy Biggie?");
    expect(parsed.items.map((item) => item.text)).toEqual([
      "Pierwsze?!",
      "Drugie?!",
      "Trzecie?!",
      "Czwarte?!",
      "2Pac czy Biggie?",
    ]);
  });

  it("reports repeats of an earlier line, case-insensitively", () => {
    const parsed = parseQuestionPaste("Żółta łódź?\nInne pytanie?\nŻÓŁTA ŁÓDŹ?");
    expect(parsed.items.map((item) => item.line)).toEqual([1, 2]);
    expect(parsed.skipped).toEqual([{ line: 3, text: "ŻÓŁTA ŁÓDŹ?", reason: "repeated" }]);
  });

  it("reports lines that are too short or too long", () => {
    const long = "y".repeat(MAX_QUESTION_LENGTH + 1);
    const parsed = parseQuestionPaste(`Abc?\nDobre pytanie?\n${long}`);
    expect(parsed.items).toEqual([{ line: 2, text: "Dobre pytanie?" }]);
    expect(parsed.skipped).toEqual([
      { line: 1, text: "Abc?", reason: "too-short" },
      { line: 3, text: long, reason: "too-long" },
    ]);
  });

  it("gives nothing for blank input", () => {
    expect(parseQuestionPaste(" \n\t\n")).toEqual({ items: [], skipped: [] });
  });
});

describe("messages", () => {
  it("describes a skipped line with a short preview", () => {
    expect(describeSkip({ line: 3, text: "Kawa czy herbata?", reason: "duplicate" })).toBe(
      "Linia 3: „Kawa czy herbata?” — już jest w bazie.",
    );
    expect(describeSkip({ line: 4, text: "Kawa czy herbata?", reason: "repeated" })).toContain(
      "powtarza się we wklejce.",
    );
    expect(describeSkip({ line: 1, text: "Abc?", reason: "too-short" })).toContain("za krótkie (min. 5 znaków).");
    const long = describeSkip({ line: 9, text: "z".repeat(301), reason: "too-long" });
    expect(long).toContain(`„${"z".repeat(50)}…”`);
    expect(long).toContain("za długie (maks. 300 znaków).");
  });

  it("summarizes a paste with Polish plurals", () => {
    expect(describePasteResult(1, 0)).toBe("Dodano 1 pytanie.");
    expect(describePasteResult(3, 0)).toBe("Dodano 3 pytania.");
    expect(describePasteResult(12, 0)).toBe("Dodano 12 pytań.");
    expect(describePasteResult(22, 1)).toBe("Dodano 22 pytania. Pominięto 1 linię.");
    expect(describePasteResult(5, 2)).toBe("Dodano 5 pytań. Pominięto 2 linie.");
    expect(describePasteResult(0, 5)).toBe("Nic nie dodano — pominięto 5 linii.");
    expect(describePasteResult(0, 0)).toBe("Nic nie dodano.");
    expect(describeAdded(0)).toBe("Nic nie dodano.");
    expect(describeAdded(90)).toBe("Dodano 90 pytań.");
  });
});
