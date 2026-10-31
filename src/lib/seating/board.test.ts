import { describe, expect, it } from "vitest";
import { seat } from "./fixtures.test-helpers";
import {
  PICK_GUEST_FIRST_MESSAGE,
  displacedGuest,
  lostSeatMessage,
  seatClick,
  seatRows,
  seatingHint,
  type SelectedGuest,
} from "./board";

const ania: SelectedGuest = { guestId: 1, name: "Ania", seated: true, pinned: false };
const pinnedAnia: SelectedGuest = { ...ania, pinned: true };
const kuba = { guestId: 2, name: "Kuba", pinned: false };
const pinnedKuba = { ...kuba, pinned: true };

describe("seatClick", () => {
  it("without a selection selects the occupant of a taken seat and refuses an empty one", () => {
    expect(seatClick(null, kuba)).toEqual({ kind: "select", guestId: 2 });
    expect(seatClick(null, pinnedKuba)).toEqual({ kind: "select", guestId: 2 });
    expect(seatClick(null, null)).toEqual({ kind: "refuse", reason: PICK_GUEST_FIRST_MESSAGE });
  });

  it("clears the selection on the selected guest's own seat", () => {
    expect(seatClick(ania, { guestId: 1, name: "Ania", pinned: false })).toEqual({ kind: "deselect" });
    expect(seatClick(pinnedAnia, { guestId: 1, name: "Ania", pinned: true })).toEqual({ kind: "deselect" });
  });

  it("seats the selected guest on an empty or taken seat", () => {
    expect(seatClick(ania, null)).toEqual({ kind: "seat" });
    expect(seatClick(ania, kuba)).toEqual({ kind: "seat" });
    expect(seatClick({ ...ania, seated: false }, kuba)).toEqual({ kind: "seat" });
  });

  it("never moves a pinned guest and never displaces a pinned occupant", () => {
    expect(seatClick(pinnedAnia, null)).toEqual({
      kind: "refuse",
      reason: "„Ania” ma przypięte miejsce — najpierw je odepnij.",
    });
    expect(seatClick(pinnedAnia, kuba)).toEqual({ kind: "select", guestId: 2 });
    expect(seatClick(ania, pinnedKuba)).toEqual({
      kind: "refuse",
      reason: "To miejsce zajmuje przypięta osoba „Kuba” — najpierw ją odepnij.",
    });
  });
});

describe("seatingHint", () => {
  it("says what the next click does", () => {
    expect(seatingHint(null)).toMatch(/^Wybierz osobę/);
    expect(seatingHint(ania)).toBe("Kliknij miejsce dla „Ania”. Zajęte miejsce — zamiana.");
    expect(seatingHint({ ...ania, seated: false })).toBe(
      "Kliknij miejsce dla „Ania”. Osoba z zajętego miejsca zostanie bez miejsca.",
    );
    expect(seatingHint(pinnedAnia)).toMatch(/^„Ania” ma przypięte miejsce/);
  });
});

describe("seatRows", () => {
  it("puts the two sides of a rectangular table next to each other", () => {
    expect(seatRows("rectangular", 6)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(seatRows("rectangular", 5)).toEqual([
      [1, 4],
      [2, 5],
      [3, null],
    ]);
    expect(seatRows("rectangular", 2)).toEqual([[1, 2]]);
  });

  it("lists a round table in seat order", () => {
    expect(seatRows("round", 3)).toEqual([[1], [2], [3]]);
  });
});

describe("displacedGuest", () => {
  const before = [seat(1, 10, 1), seat(2, 10, 2)];

  it("names the occupant who has no seat after an unseated guest took theirs", () => {
    expect(displacedGuest(before, [seat(1, 10, 1), seat(3, 10, 2)], { guestId: 3, tableId: 10, seat: 2 })).toBe(2);
  });

  it("is null after a swap, a move to an empty seat or a move onto the own seat", () => {
    expect(displacedGuest(before, [seat(2, 10, 1), seat(1, 10, 2)], { guestId: 1, tableId: 10, seat: 2 })).toBeNull();
    expect(displacedGuest(before, [seat(1, 10, 5), seat(2, 10, 2)], { guestId: 1, tableId: 10, seat: 5 })).toBeNull();
    expect(displacedGuest(before, before, { guestId: 1, tableId: 10, seat: 1 })).toBeNull();
  });

  it("words the notice", () => {
    expect(lostSeatMessage("Kuba")).toBe("„Kuba” nie ma teraz miejsca.");
  });
});
