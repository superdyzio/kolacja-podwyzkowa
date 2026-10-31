import { describe, expect, it } from "vitest";
import { MAX_RECENT, pickQuestion, pushRecent, secureRandom } from "./draw";

const questions = (...ids: number[]) => ids.map((id) => ({ id }));
const first = () => 0;
const last = () => 0.999_999_999;

describe("pickQuestion", () => {
  it("returns null without candidates", () => {
    expect(pickQuestion([], [1, 2], first)).toBeNull();
  });

  it("picks only among questions not drawn recently", () => {
    const candidates = questions(1, 2, 3, 4);
    expect(pickQuestion(candidates, [1, 2], first)).toEqual({ id: 3 });
    expect(pickQuestion(candidates, [1, 2], last)).toEqual({ id: 4 });
    for (let index = 0; index < 50; index++) {
      const picked = pickQuestion(candidates, [3, 1, 2], Math.random);
      expect(picked).toEqual({ id: 4 });
    }
  });

  it("covers the whole fresh pool across the random range", () => {
    const candidates = questions(10, 20, 30);
    const seen = new Set([0, 0.34, 0.67, 0.99].map((value) => pickQuestion(candidates, [], () => value)?.id));
    expect(seen).toEqual(new Set([10, 20, 30]));
  });

  it("when everything was drawn lately, picks from the older half and never the newest", () => {
    // Drawn in the order 4, 2, 3, 1 → oldest 4 and 2 form the pool.
    const candidates = questions(1, 2, 3, 4);
    expect(pickQuestion(candidates, [4, 2, 3, 1], first)).toEqual({ id: 4 });
    expect(pickQuestion(candidates, [4, 2, 3, 1], last)).toEqual({ id: 2 });
    // Two candidates: always the one that was not drawn last.
    for (const random of [first, last, () => 0.5]) {
      expect(pickQuestion(questions(7, 8), [7, 8], random)).toEqual({ id: 7 });
      expect(pickQuestion(questions(7, 8), [8, 7], random)).toEqual({ id: 8 });
    }
    // Odd count: the older half rounds up (3 of 5).
    const pool = new Set(
      [0, 0.4, 0.99].map((value) => pickQuestion(questions(1, 2, 3, 4, 5), [5, 4, 3, 2, 1], () => value)?.id),
    );
    expect(pool).toEqual(new Set([5, 4, 3]));
  });

  it("returns the only candidate even if it was just drawn", () => {
    expect(pickQuestion(questions(9), [9], last)).toEqual({ id: 9 });
  });

  it("ignores recent ids that are not candidates (other categories, deleted questions)", () => {
    expect(pickQuestion(questions(1, 2), [100, 200, 1], last)).toEqual({ id: 2 });
  });

  it("clamps a random value outside [0, 1)", () => {
    expect(pickQuestion(questions(1, 2), [], () => 1)).toEqual({ id: 2 });
    expect(pickQuestion(questions(1, 2), [], () => -1)).toEqual({ id: 1 });
  });
});

describe("pushRecent", () => {
  it("moves a drawn id to the end without duplicates", () => {
    expect(pushRecent([1, 2, 3], 2)).toEqual([1, 3, 2]);
    expect(pushRecent([], 5)).toEqual([5]);
  });

  it("keeps at most MAX_RECENT ids, dropping the oldest", () => {
    const full = Array.from({ length: MAX_RECENT }, (_, index) => index + 1);
    const next = pushRecent(full, 1_000);
    expect(next).toHaveLength(MAX_RECENT);
    expect(next[0]).toBe(2);
    expect(next.at(-1)).toBe(1_000);
  });
});

describe("secureRandom", () => {
  it("returns numbers in [0, 1)", () => {
    for (let index = 0; index < 200; index++) {
      const value = secureRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
