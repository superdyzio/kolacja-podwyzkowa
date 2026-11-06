import { describe, expect, it } from "vitest";
import {
  MAX_PREDICTED_PLACE,
  formatPlaceInput,
  isPlaceHit,
  parsePredictedPlace,
  placeLimit,
  podiumMedal,
  readPlaceField,
  readPlaceText,
} from "./place";

describe("readPlaceText", () => {
  it.each([
    ["5", 5],
    [" 12 ", 12],
    ["7.", 7],
    ["100", 100],
    ["", null],
    ["   ", null],
  ])("reads %j as %j", (text, place) => {
    expect(readPlaceText(text)).toBe(place);
  });

  it.each(["0", "-1", "1,5", "1.5", "abc", "5 miejsce", "#5", "1000", "５"])("refuses %j", (text) => {
    expect(readPlaceText(text)).toBe("invalid");
  });
});

describe("readPlaceField", () => {
  it("keeps (undefined), clears (null, empty) or reads the body field", () => {
    expect(readPlaceField(undefined)).toBeUndefined();
    expect(readPlaceField(null)).toBeNull();
    expect(readPlaceField("")).toBeNull();
    expect(readPlaceField("3")).toBe(3);
    expect(readPlaceField("x")).toBe("invalid");
  });
});

describe("parsePredictedPlace", () => {
  it("allows 1 … the number of guests, and no prediction", () => {
    expect(parsePredictedPlace("1", 36)).toEqual({ ok: true, place: 1 });
    expect(parsePredictedPlace("36", 36)).toEqual({ ok: true, place: 36 });
    expect(parsePredictedPlace("", 36)).toEqual({ ok: true, place: null });
  });

  it("names the range for anything else, in both languages", () => {
    expect(parsePredictedPlace("37", 36)).toEqual({ ok: false, message: "Wpisz miejsce od 1 do 36." });
    expect(parsePredictedPlace("0", 36)).toEqual({ ok: false, message: "Wpisz miejsce od 1 do 36." });
    expect(parsePredictedPlace("pierwsze", 36, "en")).toEqual({ ok: false, message: "Enter a place from 1 to 36." });
    expect(parsePredictedPlace("2", 1)).toEqual({ ok: false, message: "Miejsce może być tylko 1." });
  });
});

describe("placeLimit", () => {
  it("is the number of guests, at least 1 and at most the DB bound", () => {
    expect(placeLimit(36)).toBe(36);
    expect(placeLimit(0)).toBe(1);
    expect(placeLimit(500)).toBe(MAX_PREDICTED_PLACE);
  });
});

describe("formatPlaceInput", () => {
  it("prefills a form field that parses back", () => {
    expect(formatPlaceInput(null)).toBe("");
    expect(formatPlaceInput(9)).toBe("9");
    expect(readPlaceText(formatPlaceInput(9))).toBe(9);
  });
});

describe("isPlaceHit (a tie covers every place it spans)", () => {
  it("hits the own place exactly when alone on it", () => {
    expect(isPlaceHit(4, 4, 1)).toBe(true);
    expect(isPlaceHit(3, 4, 1)).toBe(false);
    expect(isPlaceHit(5, 4, 1)).toBe(false);
  });

  it("lets two people sharing place 2 hit with 2 or 3, not 4", () => {
    expect(isPlaceHit(2, 2, 2)).toBe(true);
    expect(isPlaceHit(3, 2, 2)).toBe(true);
    expect(isPlaceHit(4, 2, 2)).toBe(false);
    expect(isPlaceHit(1, 2, 2)).toBe(false);
  });

  it("never hits without a prediction", () => {
    expect(isPlaceHit(null, 1, 1)).toBe(false);
  });
});

describe("podiumMedal", () => {
  it("gives gold, silver and bronze to the displayed places 1, 2 and 3 only", () => {
    expect([1, 2, 3, 4, 10].map(podiumMedal)).toEqual(["gold", "silver", "bronze", null, null]);
  });
});
