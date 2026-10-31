import { describe, expect, it } from "vitest";
import { MAX_RECENT } from "./draw";
import {
  EMPTY_DRAW_MEMORY,
  GUEST_DRAW_STORAGE_KEY,
  ORGANIZER_DRAW_STORAGE_KEY,
  parseDrawAnswer,
  parseDrawMemory,
  serializeDrawMemory,
  type DrawMemory,
} from "./draw-memory";

const question = { id: 7, category: "refleksyjne", text: "Czego się ostatnio nauczyłeś?" } as const;

describe("draw memory", () => {
  it("round-trips a memory", () => {
    const memory: DrawMemory = { category: "generyczne", recent: [3, 1, 7], last: question };
    expect(parseDrawMemory(serializeDrawMemory(memory))).toEqual(memory);
  });

  it("falls back to the empty memory for nothing, bad JSON or a non-object", () => {
    for (const raw of [null, "", "{", "null", "42", '"tekst"', "[1,2]"]) {
      expect(parseDrawMemory(raw)).toEqual(EMPTY_DRAW_MEMORY);
    }
  });

  it("keeps the valid fields and drops the rest", () => {
    expect(
      parseDrawMemory(JSON.stringify({ category: "polityczne", recent: "1,2", last: { id: 1, category: "x" } })),
    ).toEqual(EMPTY_DRAW_MEMORY);
    expect(parseDrawMemory(JSON.stringify({ category: "kontrowersyjne" }))).toEqual({
      category: "kontrowersyjne",
      recent: [],
      last: null,
    });
    expect(parseDrawMemory(JSON.stringify({ recent: [0, -1, 1.5, "2", 3, null, 2 ** 60, 4] })).recent).toEqual([3, 4]);
  });

  it("drops duplicate ids (the newest position wins) and keeps only the newest MAX_RECENT", () => {
    expect(parseDrawMemory(JSON.stringify({ recent: [1, 2, 1, 3] })).recent).toEqual([2, 1, 3]);
    const many = Array.from({ length: MAX_RECENT + 20 }, (_, index) => index + 1);
    const { recent } = parseDrawMemory(JSON.stringify({ recent: many }));
    expect(recent).toHaveLength(MAX_RECENT);
    expect(recent[0]).toBe(21);
    expect(recent.at(-1)).toBe(MAX_RECENT + 20);
  });

  it("refuses a stored question with a wrong shape", () => {
    for (const last of [
      { ...question, id: 0 },
      { ...question, id: "7" },
      { ...question, category: "polityczne" },
      { ...question, text: "   " },
      { ...question, text: 5 },
      "Czego się ostatnio nauczyłeś?",
    ]) {
      expect(parseDrawMemory(JSON.stringify({ last })).last).toBeNull();
    }
  });

  it("stores only the question fields", () => {
    const stored = serializeDrawMemory({
      category: null,
      recent: [],
      last: { ...question, extra: "x" } as DrawMemory["last"],
    });
    expect(JSON.parse(stored)).toEqual({ category: null, recent: [], last: question });
  });

  it("uses separate keys for the guest and the organizer", () => {
    expect(GUEST_DRAW_STORAGE_KEY).not.toBe(ORGANIZER_DRAW_STORAGE_KEY);
  });
});

describe("draw answer", () => {
  it("accepts one question or null", () => {
    expect(parseDrawAnswer({ question })).toEqual({ question });
    expect(parseDrawAnswer({ question: null })).toEqual({ question: null });
  });

  it("refuses anything else", () => {
    for (const data of [null, "x", {}, { questions: [question] }, { question: { ...question, category: "x" } }]) {
      expect(parseDrawAnswer(data)).toBeNull();
    }
  });
});
