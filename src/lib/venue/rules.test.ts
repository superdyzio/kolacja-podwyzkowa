import { describe, expect, it } from "vitest";
import {
  MAX_ROOM_NAME_LENGTH,
  MAX_TABLE_NAME_LENGTH,
  TABLE_SHAPE_LABELS,
  compareTableNames,
  describeRoomNameProblem,
  describeTableNameProblem,
  isTableShape,
  isValidFraction,
  isValidSeatCount,
  nextTableName,
  normalizeVenueName,
  roundFraction,
  validateRoomName,
  validateTableName,
  venueNameKey,
} from "./rules";

describe("room and table names", () => {
  it("normalizes like guest names", () => {
    expect(normalizeVenueName("  Sala \t  duża ")).toBe("Sala duża");
  });

  it("compares names regardless of letter case and spacing", () => {
    expect(venueNameKey("SALA  Łąkowa")).toBe(venueNameKey("sala łąkowa"));
  });

  it("validates room names up to 40 code points", () => {
    expect(validateRoomName("")).toBe("empty");
    expect(validateRoomName("x".repeat(MAX_ROOM_NAME_LENGTH))).toBeNull();
    expect(validateRoomName("x".repeat(MAX_ROOM_NAME_LENGTH + 1))).toBe("too-long");
    // An emoji counts once, like Postgres char_length().
    expect(validateRoomName("🎉".repeat(MAX_ROOM_NAME_LENGTH))).toBeNull();
  });

  it("validates table names up to 24 code points", () => {
    expect(validateTableName("")).toBe("empty");
    expect(validateTableName("x".repeat(MAX_TABLE_NAME_LENGTH))).toBeNull();
    expect(validateTableName("x".repeat(MAX_TABLE_NAME_LENGTH + 1))).toBe("too-long");
  });

  it("describes problems in Polish", () => {
    expect(describeRoomNameProblem("empty")).toBe("Wpisz nazwę sali.");
    expect(describeRoomNameProblem("too-long")).toBe("Nazwa sali może mieć najwyżej 40 znaków.");
    expect(describeTableNameProblem("empty")).toBe("Wpisz nazwę stolika.");
    expect(describeTableNameProblem("too-long")).toBe("Nazwa stolika może mieć najwyżej 24 znaków.");
  });
});

describe("seats and shapes", () => {
  it.each([
    [1, false],
    [2, true],
    [20, true],
    [21, false],
    [2.5, false],
    [Number.NaN, false],
  ])("seat count %d valid: %s", (count, valid) => {
    expect(isValidSeatCount(count)).toBe(valid);
  });

  it("knows the two shapes and their Polish labels", () => {
    expect(isTableShape("round")).toBe(true);
    expect(isTableShape("rectangular")).toBe(true);
    expect(isTableShape("square")).toBe(false);
    expect(TABLE_SHAPE_LABELS).toEqual({ round: "okrągły", rectangular: "prostokątny" });
  });
});

describe("pin fractions", () => {
  it.each([
    [-0.0001, false],
    [0, true],
    [0.5, true],
    [1, true],
    [1.0001, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])("%d is a valid fraction: %s", (value, valid) => {
    expect(isValidFraction(value)).toBe(valid);
  });

  it("clamps and keeps 4 decimals", () => {
    expect(roundFraction(0.123456)).toBe(0.1235);
    expect(roundFraction(-0.2)).toBe(0);
    expect(roundFraction(1.7)).toBe(1);
    expect(roundFraction(Number.NaN)).toBe(0.5);
  });
});

describe("nextTableName", () => {
  it("starts at Stolik 1", () => {
    expect(nextTableName([])).toBe("Stolik 1");
  });

  it("fills the first gap, ignoring letter case", () => {
    expect(nextTableName(["stolik 1", "Stolik 3"])).toBe("Stolik 2");
    expect(nextTableName(["Stolik 1", "Stolik 2", "Okno"])).toBe("Stolik 3");
  });
});

describe("compareTableNames", () => {
  it("orders numbers by value and Polish letters correctly", () => {
    const names = ["Stolik 10", "Łąka", "Stolik 2", "Lipa", "Malwa", "Stolik 1"];
    expect([...names].sort(compareTableNames)).toEqual(["Lipa", "Łąka", "Malwa", "Stolik 1", "Stolik 2", "Stolik 10"]);
  });
});
