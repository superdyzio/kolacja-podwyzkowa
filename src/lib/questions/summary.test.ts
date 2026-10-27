import { describe, expect, it } from "vitest";
import type { QuestionCategory } from "@/types";
import { countQuestions, formatQuestionSummary } from "./summary";

const of = (...categories: QuestionCategory[]) => categories.map((category) => ({ category }));

describe("question summary", () => {
  it("counts questions per category", () => {
    expect(countQuestions(of("generyczne", "generyczne", "refleksyjne"))).toEqual({
      all: 3,
      kontrowersyjne: 0,
      generyczne: 2,
      refleksyjne: 1,
    });
  });

  it("formats the shell card line with Polish plurals", () => {
    expect(formatQuestionSummary([])).toBe("Baza pytań jest pusta");
    expect(formatQuestionSummary(of("refleksyjne"))).toBe(
      "1 pytanie · kontrowersyjne 0 · generyczne 0 · refleksyjne 1",
    );
    expect(formatQuestionSummary(of("generyczne", "kontrowersyjne"))).toBe(
      "2 pytania · kontrowersyjne 1 · generyczne 1 · refleksyjne 0",
    );
    const ninety = [
      ...of(...Array<QuestionCategory>(30).fill("kontrowersyjne")),
      ...of(...Array<QuestionCategory>(30).fill("generyczne")),
      ...of(...Array<QuestionCategory>(30).fill("refleksyjne")),
    ];
    expect(formatQuestionSummary(ninety)).toBe("90 pytań · kontrowersyjne 30 · generyczne 30 · refleksyjne 30");
  });
});
