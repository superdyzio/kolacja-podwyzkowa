import { describe, expect, it } from "vitest";
import { neighbours, oppositeSeat, seatPlace, sideALength, sideNeighbours } from "./seats";

describe("round tables", () => {
  it("numbers seats clockwise with wrap-around neighbours", () => {
    expect(sideNeighbours("round", 8, 1)).toEqual([2, 8]);
    expect(sideNeighbours("round", 8, 5)).toEqual([4, 6]);
    expect(sideNeighbours("round", 8, 8)).toEqual([1, 7]);
  });

  it("deduplicates the only neighbour at a table for two", () => {
    expect(sideNeighbours("round", 2, 1)).toEqual([2]);
    expect(sideNeighbours("round", 2, 2)).toEqual([1]);
  });

  it("makes everyone at a table for three a neighbour", () => {
    expect(neighbours("round", 3, 1)).toEqual([2, 3]);
    expect(neighbours("round", 3, 2)).toEqual([1, 3]);
  });

  it("has no sides and no opposite seat", () => {
    expect(seatPlace("round", 8, 3)).toEqual({ side: null, position: 3 });
    expect(oppositeSeat("round", 8, 3)).toBeNull();
    expect(neighbours("round", 8, 3)).toEqual([2, 4]);
  });
});

describe("rectangular tables", () => {
  it("puts ceil(n/2) seats on side A and the rest on side B, in the same direction", () => {
    expect(sideALength(8)).toBe(4);
    expect(sideALength(5)).toBe(3);
    expect(seatPlace("rectangular", 8, 1)).toEqual({ side: "A", position: 1 });
    expect(seatPlace("rectangular", 8, 4)).toEqual({ side: "A", position: 4 });
    expect(seatPlace("rectangular", 8, 5)).toEqual({ side: "B", position: 1 });
    expect(seatPlace("rectangular", 8, 8)).toEqual({ side: "B", position: 4 });
  });

  it("has side neighbours only along one side, without wrap-around", () => {
    expect(sideNeighbours("rectangular", 8, 1)).toEqual([2]);
    expect(sideNeighbours("rectangular", 8, 2)).toEqual([1, 3]);
    expect(sideNeighbours("rectangular", 8, 4)).toEqual([3]);
    expect(sideNeighbours("rectangular", 8, 5)).toEqual([6]);
    expect(sideNeighbours("rectangular", 8, 8)).toEqual([7]);
  });

  it("faces the seat at the same position on the other side", () => {
    expect(oppositeSeat("rectangular", 8, 1)).toBe(5);
    expect(oppositeSeat("rectangular", 8, 4)).toBe(8);
    expect(oppositeSeat("rectangular", 8, 8)).toBe(4);
    expect(neighbours("rectangular", 8, 2)).toEqual([1, 3, 6]);
    expect(neighbours("rectangular", 8, 4)).toEqual([3, 8]);
  });

  it("table for two: only the opposite seat", () => {
    expect(sideNeighbours("rectangular", 2, 1)).toEqual([]);
    expect(oppositeSeat("rectangular", 2, 1)).toBe(2);
    expect(neighbours("rectangular", 2, 2)).toEqual([1]);
  });

  it("table for three: A = 1, 2 and B = 3", () => {
    expect(neighbours("rectangular", 3, 1)).toEqual([2, 3]);
    expect(neighbours("rectangular", 3, 2)).toEqual([1]);
    expect(oppositeSeat("rectangular", 3, 2)).toBeNull();
    expect(neighbours("rectangular", 3, 3)).toEqual([1]);
  });

  it("odd table for five: the last seat of side A has no opposite", () => {
    expect(seatPlace("rectangular", 5, 3)).toEqual({ side: "A", position: 3 });
    expect(oppositeSeat("rectangular", 5, 3)).toBeNull();
    expect(neighbours("rectangular", 5, 3)).toEqual([2]);
    expect(neighbours("rectangular", 5, 4)).toEqual([1, 5]);
    expect(neighbours("rectangular", 5, 5)).toEqual([2, 4]);
  });
});

describe("seat range", () => {
  it.each([0, 9, 1.5])("rejects seat %d at a table for eight", (seat) => {
    expect(() => neighbours("round", 8, seat)).toThrow(RangeError);
    expect(() => neighbours("rectangular", 8, seat)).toThrow(RangeError);
  });
});
