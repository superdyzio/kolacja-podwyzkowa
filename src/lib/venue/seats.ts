import type { TableShape } from "@/types";

// Seat numbering and neighbours — the contract S-03 (seat assignments) and S-04 (no repeated neighbours) build on.
// A seat is (table, number 1..seatCount). Neighbours are always computed from the table's current shape and seat
// count. Pure functions only.
//
// round, n seats: 1..n clockwise. Side neighbours of i: i-1 and i+1 with wrap-around (1 and n are neighbours); with
//   n = 2 the two seats are each other's only neighbour. No "opposite".
// rectangular, n seats: side A = 1..a with a = ceil(n/2), side B = a+1..n, both numbered in the same direction, so
//   position p is seat p on side A and seat a+p on side B. Side neighbours: i-1 and i+1 on the same side, without
//   wrap-around and never across sides. Opposite: the seat at the same position on the other side, if any (odd n:
//   the last seat of side A has none). No seats at the table ends.
//   n = 2 → 1↔2 opposite, no side neighbours; n = 3 → A = 1,2, B = 3; n = 5 → A = 1,2,3, B = 4,5.
// "Neighbour" for the PRD's no-repeat rule = side neighbours ∪ opposite.

export type TableSide = "A" | "B";

export interface SeatPlace {
  // null for a round table.
  side: TableSide | null;
  // 1-based position along the side (round: the seat number).
  position: number;
}

function assertSeat(seatCount: number, seat: number): void {
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    throw new RangeError(`Nieprawidłowa liczba miejsc: ${seatCount}`);
  }
  if (!Number.isInteger(seat) || seat < 1 || seat > seatCount) {
    throw new RangeError(`Miejsce ${seat} nie istnieje przy stoliku z ${seatCount} miejscami`);
  }
}

// Number of seats on side A of a rectangular table.
export function sideALength(seatCount: number): number {
  return Math.ceil(seatCount / 2);
}

export function seatPlace(shape: TableShape, seatCount: number, seat: number): SeatPlace {
  assertSeat(seatCount, seat);
  if (shape === "round") {
    return { side: null, position: seat };
  }
  const a = sideALength(seatCount);
  return seat <= a ? { side: "A", position: seat } : { side: "B", position: seat - a };
}

function sortedUnique(seats: number[], exclude: number): number[] {
  return [...new Set(seats)].filter((other) => other !== exclude).sort((x, y) => x - y);
}

export function sideNeighbours(shape: TableShape, seatCount: number, seat: number): number[] {
  assertSeat(seatCount, seat);
  if (shape === "round") {
    if (seatCount === 1) {
      return [];
    }
    const previous = seat === 1 ? seatCount : seat - 1;
    const next = seat === seatCount ? 1 : seat + 1;
    return sortedUnique([previous, next], seat);
  }
  const a = sideALength(seatCount);
  const [first, last] = seat <= a ? [1, a] : [a + 1, seatCount];
  const candidates = [seat - 1, seat + 1].filter((other) => other >= first && other <= last);
  return sortedUnique(candidates, seat);
}

export function oppositeSeat(shape: TableShape, seatCount: number, seat: number): number | null {
  assertSeat(seatCount, seat);
  if (shape === "round") {
    return null;
  }
  const a = sideALength(seatCount);
  const opposite = seat <= a ? seat + a : seat - a;
  return opposite >= 1 && opposite <= seatCount ? opposite : null;
}

// Every seat whose occupant counts as a neighbour of `seat` (side neighbours and, at a rectangular table, the
// opposite seat), sorted and without duplicates.
export function neighbours(shape: TableShape, seatCount: number, seat: number): number[] {
  const opposite = oppositeSeat(shape, seatCount, seat);
  const side = sideNeighbours(shape, seatCount, seat);
  return sortedUnique(opposite === null ? side : [...side, opposite], seat);
}
