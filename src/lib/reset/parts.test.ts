import { describe, expect, it } from "vitest";
import type { ResetPart } from "@/types";
import {
  expandResetParts,
  isEveryResetPartSelected,
  isResetPart,
  requiredBy,
  RESET_IMPLIES,
  RESET_PART_DESCRIPTIONS,
  RESET_PART_LABELS,
  RESET_PARTS,
  selectAllResetParts,
  toggleResetPart,
} from "./parts";

describe("reset parts", () => {
  it("lists every part once, each with a Polish label and description", () => {
    expect(new Set(RESET_PARTS).size).toBe(RESET_PARTS.length);
    expect([...RESET_PARTS].sort()).toEqual(Object.keys(RESET_PART_LABELS).sort());
    expect([...RESET_PARTS].sort()).toEqual(Object.keys(RESET_PART_DESCRIPTIONS).sort());
    expect(RESET_PARTS.map((part) => RESET_PART_LABELS[part])).toEqual([
      "Strzały",
      "Licznik tematów AI",
      "Rozsadzenie i historia",
      "Goście i grupy",
      "Plan, sale i stoliki",
      "Pytania",
      "Linki gości",
    ]);
  });

  it("warns that printed cards stop working and that the AI quota starts again", () => {
    expect(RESET_PART_DESCRIPTIONS.guestLinks).toContain("karteczki");
    expect(RESET_PART_DESCRIPTIONS.guestLinks).toContain("przestają działać");
    expect(RESET_PART_DESCRIPTIONS.aiUsage).toBe(
      "Zeruje licznik: każdy gość znów ma 5 tematów, cały wieczór 300. Szacunek kosztu AI też liczy się od nowa.",
    );
  });

  it("recognizes part ids only", () => {
    expect(isResetPart("guests")).toBe(true);
    expect(isResetPart("event")).toBe(false);
    expect(isResetPart(1)).toBe(false);
  });

  it("implies guesses, AI usage and seating for guests, seating for the venue", () => {
    expect(RESET_IMPLIES.guests).toEqual(["guesses", "aiUsage", "seating"]);
    expect(RESET_IMPLIES.venue).toEqual(["seating"]);
  });
});

describe("expandResetParts", () => {
  it("adds implied parts, removes duplicates and keeps the canonical order", () => {
    expect(expandResetParts(["guestLinks", "guests", "guests"])).toEqual([
      "guesses",
      "aiUsage",
      "seating",
      "guests",
      "guestLinks",
    ]);
    expect(expandResetParts(["venue"])).toEqual(["seating", "venue"]);
    expect(expandResetParts(["questions", "guesses"])).toEqual(["guesses", "questions"]);
    expect(expandResetParts([])).toEqual([]);
    expect(expandResetParts(RESET_PARTS)).toEqual([...RESET_PARTS]);
  });
});

describe("selection in the modal", () => {
  it("locks parts pulled in by another chosen part", () => {
    expect(requiredBy("seating", ["guests", "venue"])).toEqual(["guests", "venue"]);
    expect(requiredBy("guesses", ["guests"])).toEqual(["guests"]);
    expect(requiredBy("guests", ["guests"])).toEqual([]);
    expect(requiredBy("questions", ["guests", "venue"])).toEqual([]);
  });

  it("ticks and unticks parts in canonical order", () => {
    let explicit: ResetPart[] = [];
    explicit = toggleResetPart(explicit, "questions");
    explicit = toggleResetPart(explicit, "guesses");
    expect(explicit).toEqual(["guesses", "questions"]);
    expect(toggleResetPart(explicit, "questions")).toEqual(["guesses"]);
  });

  it("leaves a locked part as it is and releases implied parts with their parent", () => {
    const withGuests = toggleResetPart([], "guests");
    expect(expandResetParts(withGuests)).toEqual(["guesses", "aiUsage", "seating", "guests"]);
    expect(toggleResetPart(withGuests, "seating")).toEqual(withGuests);
    expect(expandResetParts(toggleResetPart(withGuests, "guests"))).toEqual([]);
  });

  it("keeps a part chosen on its own when the part implying it is unticked", () => {
    const explicit = toggleResetPart(toggleResetPart([], "guesses"), "guests");
    expect(explicit).toEqual(["guesses", "guests"]);
    expect(toggleResetPart(explicit, "guesses")).toEqual(["guests"]);
    expect(toggleResetPart(explicit, "guests")).toEqual(["guesses"]);
  });

  it("selects everything and knows when everything is selected", () => {
    expect(selectAllResetParts()).toEqual([...RESET_PARTS]);
    expect(isEveryResetPartSelected(selectAllResetParts())).toBe(true);
    expect(isEveryResetPartSelected(["guests", "venue", "questions", "guestLinks"])).toBe(true);
    expect(isEveryResetPartSelected(["guests", "venue", "questions"])).toBe(false);
  });
});
