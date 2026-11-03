import type { Locale } from "@/lib/i18n/locale";
import type { GuessBoardDto, GuessEnteredBy, GuessGuestDto } from "@/types";
import { guessMessages } from "./messages";
import { rankGuesses } from "./ranking";

// The organizer's guesses page from plain rows (S-06, FR-018, FR-020), pure: every guest with their guess, who has
// not guessed yet, and the ranking once the correct amount is known. Absent guests stay on every list (marked): a
// guess entered for them is ranked, and without one they are listed as missing so the organizer can skip them.

export interface GuessBoardInput {
  intakeOpen: boolean;
  correctAmountGrosze: number | null;
  guests: readonly { id: number; displayName: string; isAbsent: boolean }[];
  guesses: readonly { guestId: number; amountGrosze: number; enteredBy: GuessEnteredBy }[];
}

const polishCollator = new Intl.Collator("pl");

export function toGuessBoard({ intakeOpen, correctAmountGrosze, guests, guesses }: GuessBoardInput): GuessBoardDto {
  const guessByGuest = new Map(guesses.map((guess) => [guess.guestId, guess]));
  const rows: GuessGuestDto[] = [...guests]
    .sort((a, b) => polishCollator.compare(a.displayName, b.displayName) || a.id - b.id)
    .map((guest) => {
      const guess = guessByGuest.get(guest.id);
      return {
        id: guest.id,
        displayName: guest.displayName,
        isAbsent: guest.isAbsent,
        amountGrosze: guess?.amountGrosze ?? null,
        enteredBy: guess?.enteredBy ?? null,
      };
    });

  const ranked = rows.flatMap((row) =>
    row.amountGrosze === null
      ? []
      : [{ guestId: row.id, displayName: row.displayName, isAbsent: row.isAbsent, amountGrosze: row.amountGrosze }],
  );

  return {
    intakeOpen,
    correctAmountGrosze,
    guests: rows,
    missing: rows
      .filter((row) => row.amountGrosze === null)
      .map((row) => ({ id: row.id, displayName: row.displayName, isAbsent: row.isAbsent })),
    ranking:
      correctAmountGrosze === null ? null : { correctAmountGrosze, entries: rankGuesses(ranked, correctAmountGrosze) },
  };
}

// The organizer shell card: "Przyjmowanie otwarte · strzały: 32 z 40", "… · ranking gotowy" once it can be read.
export function formatGuessSummary(board: GuessBoardDto, locale: Locale = "pl"): string {
  const t = guessMessages(locale);
  const parts = [board.intakeOpen ? t.summaryOpen : t.summaryClosed];
  if (board.guests.length === 0) {
    parts.push(t.summaryNoGuests);
  } else {
    parts.push(t.summaryCount(board.guests.length - board.missing.length, board.guests.length));
  }
  if (board.ranking) {
    parts.push(t.summaryRankingReady);
  }
  return parts.join(" · ");
}
