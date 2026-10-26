import { describe, expect, it } from "vitest";
import { formatGuestSummary, pluralPl, summarizeGuestList } from "./summary";

describe("pluralPl", () => {
  it("picks the Polish plural form", () => {
    const form = (count: number) => pluralPl(count, "grupa", "grupy", "grup");
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 102, 112].map(form)).toEqual([
      "grup",
      "grupa",
      "grupy",
      "grupy",
      "grup",
      "grup",
      "grup",
      "grup",
      "grup",
      "grupy",
      "grupy",
      "grup",
      "grupy",
      "grup",
    ]);
  });
});

describe("summarizeGuestList", () => {
  it("counts guests, absences and groups", () => {
    const summary = summarizeGuestList({
      guests: [
        { id: 1, displayName: "Ania", isAbsent: false, groupId: 7 },
        { id: 2, displayName: "Kuba", isAbsent: true, groupId: 7 },
        { id: 3, displayName: "Ola", isAbsent: false, groupId: null },
      ],
      groups: [{ id: 7, memberIds: [1, 2] }],
    });
    expect(summary).toEqual({ guests: 3, present: 2, absent: 1, groups: 1 });
    expect(formatGuestSummary(summary)).toBe("3 gości · 1 grupa · nieobecni: 1");
  });

  it("omits absences when everyone is present", () => {
    expect(formatGuestSummary({ guests: 1, present: 1, absent: 0, groups: 0 })).toBe("1 gość · 0 grup");
  });
});
