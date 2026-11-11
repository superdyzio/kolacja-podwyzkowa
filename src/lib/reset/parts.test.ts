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
  TRIAL_RESET_PARTS,
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
      "Zamówienia i napoje",
      "Pytania",
      "Linki gości",
      "Pub quiz",
      "Potwierdzenia",
    ]);
  });

  it("warns that printed cards stop working and that the AI quota starts again", () => {
    expect(RESET_PART_DESCRIPTIONS.guestLinks).toContain("karteczki");
    expect(RESET_PART_DESCRIPTIONS.guestLinks).toContain("przestają działać");
    expect(RESET_PART_DESCRIPTIONS.aiUsage).toBe(
      "Zeruje licznik: każdy gość znów ma 25 tematów, cały wieczór 1000. Szacunek kosztu AI też liczy się od nowa.",
    );
  });

  it("recognizes part ids only", () => {
    expect(isResetPart("guests")).toBe(true);
    expect(isResetPart("event")).toBe(false);
    expect(isResetPart(1)).toBe(false);
  });

  it("implies guesses, AI usage, seating, the quiz and the RSVP for guests, seating for the venue", () => {
    expect(RESET_IMPLIES.guests).toEqual(["guesses", "aiUsage", "seating", "quiz", "rsvp"]);
    expect(RESET_PART_DESCRIPTIONS.rsvp).toContain("Nieobecności na liście gości zostają");
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
      "quiz",
      "rsvp",
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
    expect(expandResetParts(withGuests)).toEqual(["guesses", "aiUsage", "seating", "guests", "quiz", "rsvp"]);
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
    expect(isEveryResetPartSelected(["guests", "venue", "orders", "questions", "guestLinks"])).toBe(true);
    expect(isEveryResetPartSelected(["guests", "venue", "questions"])).toBe(false);
  });

  it("offers the client only the trial parts, with nothing implied beyond them", () => {
    expect(TRIAL_RESET_PARTS).toEqual(["guesses", "seating", "quiz"]);
    expect(expandResetParts(TRIAL_RESET_PARTS)).toEqual([...TRIAL_RESET_PARTS]);
    expect(selectAllResetParts(TRIAL_RESET_PARTS)).toEqual(["guesses", "seating", "quiz"]);
    expect(isEveryResetPartSelected(["guesses", "seating", "quiz"], TRIAL_RESET_PARTS)).toBe(true);
    expect(isEveryResetPartSelected(["guesses", "seating"], TRIAL_RESET_PARTS)).toBe(false);
    expect(isEveryResetPartSelected(["seating"], TRIAL_RESET_PARTS)).toBe(false);
    expect(isEveryResetPartSelected(["guests"], TRIAL_RESET_PARTS)).toBe(true);
  });
});
