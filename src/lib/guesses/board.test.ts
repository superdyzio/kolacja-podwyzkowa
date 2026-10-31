import { describe, expect, it } from "vitest";
import { formatGuessSummary, toGuessBoard, type GuessBoardInput } from "./board";

const guests: GuessBoardInput["guests"] = [
  { id: 3, displayName: "Zosia", isAbsent: false },
  { id: 1, displayName: "Łucja", isAbsent: true },
  { id: 2, displayName: "Ania", isAbsent: false },
  { id: 4, displayName: "Kuba", isAbsent: true },
];

describe("toGuessBoard", () => {
  it("lists every guest in Polish order with their guess, and who is missing (absent marked)", () => {
    const board = toGuessBoard({
      intakeOpen: true,
      correctAmountGrosze: null,
      guests,
      guesses: [
        { guestId: 2, amountGrosze: 150_000, enteredBy: "guest" },
        { guestId: 4, amountGrosze: 99, enteredBy: "organizer" },
      ],
    });
    expect(board.guests.map((guest) => [guest.displayName, guest.amountGrosze, guest.enteredBy])).toEqual([
      ["Ania", 150_000, "guest"],
      ["Kuba", 99, "organizer"],
      ["Łucja", null, null],
      ["Zosia", null, null],
    ]);
    expect(board.missing).toEqual([
      { id: 1, displayName: "Łucja", isAbsent: true },
      { id: 3, displayName: "Zosia", isAbsent: false },
    ]);
    expect(board.ranking).toBeNull();
    expect(board.intakeOpen).toBe(true);
  });

  it("ranks every guess (an absent guest's too) once the correct amount is set", () => {
    const board = toGuessBoard({
      intakeOpen: false,
      correctAmountGrosze: 100_000,
      guests,
      guesses: [
        { guestId: 2, amountGrosze: 150_000, enteredBy: "guest" },
        { guestId: 4, amountGrosze: 50_000, enteredBy: "organizer" },
        { guestId: 3, amountGrosze: 100_000, enteredBy: "guest" },
      ],
    });
    expect(board.ranking?.correctAmountGrosze).toBe(100_000);
    expect(board.ranking?.entries.map((entry) => [entry.place, entry.tied, entry.displayName, entry.isAbsent])).toEqual(
      [
        [1, false, "Zosia", false],
        [2, true, "Ania", false],
        [2, true, "Kuba", true],
      ],
    );
    expect(board.missing.map((guest) => guest.displayName)).toEqual(["Łucja"]);
  });

  it("gives an empty ranking when nobody guessed", () => {
    const board = toGuessBoard({ intakeOpen: false, correctAmountGrosze: 0, guests, guesses: [] });
    expect(board.ranking).toEqual({ correctAmountGrosze: 0, entries: [] });
    expect(board.missing).toHaveLength(4);
  });
});

describe("formatGuessSummary", () => {
  it("says whether intake is open, how many guessed and whether the ranking is ready", () => {
    const open = toGuessBoard({
      intakeOpen: true,
      correctAmountGrosze: null,
      guests,
      guesses: [{ guestId: 2, amountGrosze: 1, enteredBy: "guest" }],
    });
    expect(formatGuessSummary(open)).toBe("Przyjmowanie otwarte · strzały: 1 z 4");
    const closed = toGuessBoard({ ...{ guests, guesses: [] }, intakeOpen: false, correctAmountGrosze: 5 });
    expect(formatGuessSummary(closed)).toBe("Przyjmowanie zamknięte · strzały: 0 z 4 · ranking gotowy");
    const empty = toGuessBoard({ intakeOpen: true, correctAmountGrosze: null, guests: [], guesses: [] });
    expect(formatGuessSummary(empty)).toBe("Przyjmowanie otwarte · brak gości");
  });
});
