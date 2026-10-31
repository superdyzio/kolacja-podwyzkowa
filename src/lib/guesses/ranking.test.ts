import { describe, expect, it } from "vitest";
import type { GuessRankingDto } from "@/types";
import { placesFromLast, rankGuesses, type RankableGuess } from "./ranking";

let nextId = 1;
function guess(displayName: string, amountGrosze: number, extra: Partial<RankableGuess> = {}): RankableGuess {
  return { guestId: nextId++, displayName, isAbsent: false, amountGrosze, ...extra };
}

const CORRECT = 500_000; // 5 000,00 zł

function summary(entries: ReturnType<typeof rankGuesses>) {
  return entries.map((entry) => `${entry.place}${entry.tied ? "=" : ""} ${entry.displayName}`);
}

describe("rankGuesses", () => {
  it("gives equal distances an equal place and skips the next one (1, 2, 2, 4)", () => {
    const ranked = rankGuesses(
      [guess("Zosia", 500_000), guess("Bartek", 510_000), guess("Ania", 490_000), guess("Kuba", 600_000)],
      CORRECT,
    );
    expect(summary(ranked)).toEqual(["1 Zosia", "2= Ania", "2= Bartek", "4 Kuba"]);
  });

  it("treats a guess above and below by the same distance as a tie", () => {
    const ranked = rankGuesses([guess("Ola", 499_999), guess("Ela", 500_001)], CORRECT);
    expect(ranked.map((entry) => [entry.place, entry.tied, entry.differenceGrosze, entry.distanceGrosze])).toEqual([
      [1, true, 1, 1],
      [1, true, -1, 1],
    ]);
  });

  it("separates guesses that differ by a single grosz", () => {
    const ranked = rankGuesses([guess("Adam", 500_002), guess("Basia", 499_999)], CORRECT);
    expect(summary(ranked)).toEqual(["1 Basia", "2 Adam"]);
  });

  it("puts an exact hit first with distance 0", () => {
    const [first] = rankGuesses([guess("Marta", 1_000), guess("Piotr", 500_000)], CORRECT);
    expect(first).toMatchObject({
      place: 1,
      tied: false,
      displayName: "Piotr",
      differenceGrosze: 0,
      distanceGrosze: 0,
    });
  });

  it("orders a shared place by the Polish alphabet, then by id", () => {
    const łukasz = guess("Łukasz", 400_000);
    const lena = guess("Lena", 600_000);
    const mateusz = guess("Mateusz", 400_000);
    const twinA = guess("Ania", 600_000);
    const twinB = guess("Ania", 400_000);
    const ranked = rankGuesses([mateusz, łukasz, twinB, lena, twinA], CORRECT);
    expect(ranked.map((entry) => entry.guestId)).toEqual([
      twinA.guestId,
      twinB.guestId,
      lena.guestId,
      łukasz.guestId,
      mateusz.guestId,
    ]);
    expect(ranked.every((entry) => entry.place === 1 && entry.tied)).toBe(true);
  });

  it("handles everybody tied, a single guess and no guesses", () => {
    expect(summary(rankGuesses([guess("A", 1), guess("B", 1), guess("C", 1)], 0))).toEqual(["1= A", "1= B", "1= C"]);
    expect(summary(rankGuesses([guess("Solo", 0)], CORRECT))).toEqual(["1 Solo"]);
    expect(rankGuesses([], CORRECT)).toEqual([]);
  });

  it("keeps the absent mark and the amounts", () => {
    const [entry] = rankGuesses([guess("Nieobecny", 123_456, { isAbsent: true })], CORRECT);
    expect(entry).toMatchObject({ isAbsent: true, amountGrosze: 123_456, differenceGrosze: -376_544 });
  });

  it("numbers a long list with several ties correctly", () => {
    const ranked = rankGuesses(
      [10, 20, 20, 30, 30, 30, 40].map((distance, index) => guess(`G${index}`, CORRECT + distance)),
      CORRECT,
    );
    expect(ranked.map((entry) => entry.place)).toEqual([1, 2, 2, 4, 4, 4, 7]);
    expect(ranked.map((entry) => entry.tied)).toEqual([false, true, true, true, true, true, false]);
  });
});

describe("placesFromLast", () => {
  it("steps from the last place to the first, tied guests together", () => {
    const ranking: GuessRankingDto = {
      correctAmountGrosze: CORRECT,
      entries: rankGuesses(
        [guess("Zosia", 500_000), guess("Bartek", 510_000), guess("Ania", 490_000), guess("Kuba", 600_000)],
        CORRECT,
      ),
    };
    const steps = placesFromLast(ranking);
    expect(steps.map((step) => [step.place, step.tied, step.entries.map((entry) => entry.displayName)])).toEqual([
      [4, false, ["Kuba"]],
      [2, true, ["Ania", "Bartek"]],
      [1, false, ["Zosia"]],
    ]);
  });

  it("returns no steps for an empty ranking", () => {
    expect(placesFromLast({ correctAmountGrosze: CORRECT, entries: [] })).toEqual([]);
  });
});
