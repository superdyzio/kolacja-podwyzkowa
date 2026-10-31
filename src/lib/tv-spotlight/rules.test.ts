import { describe, expect, it } from "vitest";
import {
  describeTvSpotlight,
  isTvSpotlightKind,
  normalizeSpotlightText,
  spotlightFontSize,
  TV_SPOTLIGHT_LABELS,
  tvScreenVersion,
} from "./rules";

const SHOWN_AT = "2026-11-08T20:15:00.000Z";

describe("normalizeSpotlightText", () => {
  it("trims and collapses whitespace like a question", () => {
    expect(normalizeSpotlightText("  Co  było\n najlepsze?  ")).toBe("Co było najlepsze?");
  });

  it("refuses an empty text and more than 300 characters (code points)", () => {
    expect(normalizeSpotlightText("   ")).toBeNull();
    expect(normalizeSpotlightText("a".repeat(301))).toBeNull();
    expect(normalizeSpotlightText("a".repeat(300))).toHaveLength(300);
    // 300 emoji are 600 UTF-16 units but 300 characters.
    expect(normalizeSpotlightText("🍷".repeat(300))).not.toBeNull();
    expect(normalizeSpotlightText("O")).toBe("O");
  });
});

describe("tvScreenVersion", () => {
  it("appends the spotlight id to the seating token, 0 when nothing is shown", () => {
    expect(tvScreenVersion("0.0", null)).toBe("0.0.0");
    expect(tvScreenVersion("12.1793452412612", 7)).toBe("12.1793452412612.7");
  });

  it("changes with every new spotlight row and stays within the route's 64 characters", () => {
    expect(tvScreenVersion("4.17", 8)).not.toBe(tvScreenVersion("4.17", 9));
    const longest = tvScreenVersion(`${Number.MAX_SAFE_INTEGER}.${Number.MAX_SAFE_INTEGER}`, Number.MAX_SAFE_INTEGER);
    expect(longest.length).toBeLessThanOrEqual(64);
  });
});

describe("spotlightFontSize", () => {
  it("shrinks as the text grows, so 300 characters still fit", () => {
    const sizes = [10, 61, 121, 201, 300].map((length) => spotlightFontSize("question", "a".repeat(length)));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(new Set(sizes).size).toBe(4);
    expect(spotlightFontSize("topic", "a".repeat(300))).toBe(spotlightFontSize("question", "a".repeat(300)));
  });

  it("shows a name very large", () => {
    expect(spotlightFontSize("person", "Ola")).toBeGreaterThan(spotlightFontSize("question", "Ola"));
    expect(spotlightFontSize("person", "a".repeat(40))).toBeLessThan(spotlightFontSize("person", "Ola"));
  });
});

describe("describeTvSpotlight", () => {
  it("says what the TV shows", () => {
    expect(describeTvSpotlight(null)).toBe("Na TV jest plan rozsadzenia.");
    expect(describeTvSpotlight({ kind: "question", text: "Kim chciałeś zostać?", shownAt: SHOWN_AT })).toBe(
      "Na TV jest pytanie: „Kim chciałeś zostać?”",
    );
    expect(describeTvSpotlight({ kind: "topic", text: "Podróże", shownAt: SHOWN_AT })).toBe(
      "Na TV jest temat od AI: „Podróże”",
    );
    expect(describeTvSpotlight({ kind: "person", text: "Ola", shownAt: SHOWN_AT })).toBe(
      "Na TV jest wylosowana osoba: Ola",
    );
  });

  it("has a caption for every kind", () => {
    expect(Object.keys(TV_SPOTLIGHT_LABELS).sort()).toEqual(["person", "question", "topic"]);
    expect(isTvSpotlightKind("person")).toBe(true);
    expect(isTvSpotlightKind("plan")).toBe(false);
    expect(isTvSpotlightKind(null)).toBe(false);
  });
});
