import type { GuessRankingDto, RankingEntryDto } from "@/types";

// The ranking rule (PRD Business Logic, FR-020), pure: guesses ordered by the absolute distance from the correct
// amount, in integer grosze. Equal distances share a place and the next place is skipped (competition ranking:
// 1, 2, 2, 4); a guess above and one below by the same distance are a tie. Inside a shared place the order is by the
// guest's name (Polish alphabet), then by id, so the list never reshuffles between reads. The organizer reads the
// ranking from the last place (placesFromLast).

export interface RankableGuess {
  guestId: number;
  displayName: string;
  isAbsent: boolean;
  amountGrosze: number;
}

// One readout step: everybody on one place (several = a tie).
export interface ReadoutStep {
  place: number;
  tied: boolean;
  entries: RankingEntryDto[];
}

const polishCollator = new Intl.Collator("pl");

export function rankGuesses(guesses: readonly RankableGuess[], correctAmountGrosze: number): RankingEntryDto[] {
  const rows = guesses
    .map((guess) => {
      const differenceGrosze = guess.amountGrosze - correctAmountGrosze;
      return { ...guess, differenceGrosze, distanceGrosze: Math.abs(differenceGrosze) };
    })
    .sort(
      (a, b) =>
        a.distanceGrosze - b.distanceGrosze ||
        polishCollator.compare(a.displayName, b.displayName) ||
        a.guestId - b.guestId,
    );

  // Competition ranking: a new distance starts at its position (1-based); an equal distance keeps the place.
  const places: number[] = [];
  let place = 0;
  let previousDistance = Number.NaN;
  rows.forEach((row, index) => {
    if (row.distanceGrosze !== previousDistance) {
      place = index + 1;
      previousDistance = row.distanceGrosze;
    }
    places.push(place);
  });
  const sharing = new Map<number, number>();
  for (const place of places) {
    sharing.set(place, (sharing.get(place) ?? 0) + 1);
  }

  return rows.map((row, index) => {
    const place = places[index] ?? index + 1;
    return {
      place,
      tied: (sharing.get(place) ?? 0) > 1,
      guestId: row.guestId,
      displayName: row.displayName,
      isAbsent: row.isAbsent,
      amountGrosze: row.amountGrosze,
      differenceGrosze: row.differenceGrosze,
      distanceGrosze: row.distanceGrosze,
    };
  });
}

// The readout order: one step per place, the LAST place first and the winner(s) last; tied guests together.
export function placesFromLast(ranking: GuessRankingDto): ReadoutStep[] {
  const steps: ReadoutStep[] = [];
  for (const entry of ranking.entries) {
    const current = steps.at(-1);
    if (current?.place === entry.place) {
      current.entries.push(entry);
      current.tied = true;
    } else {
      steps.push({ place: entry.place, tied: entry.tied, entries: [entry] });
    }
  }
  return steps.reverse();
}
