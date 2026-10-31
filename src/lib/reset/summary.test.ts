import { describe, expect, it } from "vitest";
import type { ResetCountsDto } from "@/types";
import { RESET_PARTS } from "./parts";
import { describeResetCount, describeResetResult, joinPl, NOTHING_TO_RESET } from "./summary";

const EMPTY: ResetCountsDto = {
  guesses: 0,
  correctAmountSet: false,
  intakeOpen: true,
  aiAttempts: 0,
  aiUsed: 0,
  seats: 0,
  pinned: 0,
  snapshots: 0,
  guests: 0,
  groups: 0,
  plan: false,
  rooms: 0,
  tables: 0,
  questions: 0,
  guestAccessEnabled: false,
};

const DEMO: ResetCountsDto = {
  guesses: 30,
  correctAmountSet: true,
  intakeOpen: false,
  aiAttempts: 14,
  aiUsed: 12,
  seats: 38,
  pinned: 1,
  snapshots: 2,
  guests: 40,
  groups: 3,
  plan: true,
  rooms: 3,
  tables: 7,
  questions: 95,
  guestAccessEnabled: true,
};

describe("joinPl", () => {
  it("joins with commas and „i”", () => {
    expect(joinPl([])).toBe("");
    expect(joinPl(["a"])).toBe("a");
    expect(joinPl(["a", "b"])).toBe("a i b");
    expect(joinPl(["a", "b", "c"])).toBe("a, b i c");
  });
});

describe("describeResetCount", () => {
  it("says what each part would remove", () => {
    expect(RESET_PARTS.map((part) => describeResetCount(part, DEMO, 90))).toEqual([
      "30 strzałów · prawidłowa kwota · przyjmowanie zamknięte",
      "wykorzystano 12 z 300 · nieudane: 2",
      "38 miejsc (przypięte: 1) · 2 publikacje",
      "40 gości · 3 grupy",
      "plan · 3 sale · 7 stolików",
      "95 pytań → zostanie 90 startowych",
      "40 linków · dostęp gości włączony",
    ]);
  });

  it("says when there is nothing to remove, except for questions, which always come back", () => {
    for (const part of RESET_PARTS.filter((p) => p !== "questions")) {
      expect(describeResetCount(part, EMPTY, 90)).toBe(NOTHING_TO_RESET);
    }
    expect(describeResetCount("questions", EMPTY, 90)).toBe("brak pytań → zostanie 90 startowych");
  });

  it("uses Polish plural forms", () => {
    const one = {
      ...EMPTY,
      guesses: 1,
      seats: 1,
      snapshots: 1,
      guests: 1,
      groups: 1,
      rooms: 1,
      tables: 1,
      questions: 1,
    };
    expect(describeResetCount("guesses", one, 90)).toBe("1 strzał");
    expect(describeResetCount("seating", one, 90)).toBe("1 miejsce · 1 publikacja");
    expect(describeResetCount("guests", one, 90)).toBe("1 gość · 1 grupa");
    expect(describeResetCount("venue", one, 90)).toBe("1 sala · 1 stolik");
    expect(describeResetCount("guestLinks", one, 90)).toBe("1 link");
    expect(describeResetCount("questions", one, 2)).toBe("1 pytanie → zostaną 2 startowe");
    const few = { ...EMPTY, guesses: 22, guests: 2, groups: 4, rooms: 2, tables: 3 };
    expect(describeResetCount("guesses", few, 90)).toBe("22 strzały");
    expect(describeResetCount("guests", few, 90)).toBe("2 gości · 4 grupy");
    expect(describeResetCount("venue", few, 90)).toBe("2 sale · 3 stoliki");
    expect(describeResetCount("guestLinks", { ...EMPTY, guests: 12 }, 90)).toBe("12 linków");
  });

  it("counts failed AI attempts apart from used ones", () => {
    expect(describeResetCount("aiUsage", { ...EMPTY, aiAttempts: 2, aiUsed: 0 }, 90)).toBe(
      "wykorzystano 0 z 300 · nieudane: 2",
    );
    expect(describeResetCount("aiUsage", { ...EMPTY, aiAttempts: 5, aiUsed: 5 }, 90)).toBe("wykorzystano 5 z 300");
  });
});

describe("describeResetResult", () => {
  it("gives one line per reset part in canonical order", () => {
    expect(
      describeResetResult({ parts: [...RESET_PARTS], before: DEMO, questionsAdded: 90, guestKeysReplaced: 0 }),
    ).toEqual([
      "Strzały: usunięto 30 strzałów i prawidłową kwotę; przyjmowanie strzałów otwarte.",
      "Licznik tematów AI: wyzerowany (0 z 300), każdy gość znów ma 5.",
      "Rozsadzenie i historia: usunięto 38 miejsc i 2 publikacje; TV nie pokazuje rozsadzenia do następnej publikacji.",
      "Goście i grupy: usunięto 40 gości i 3 grupy.",
      "Plan, sale i stoliki: usunięto plan, 3 sale i 7 stolików.",
      "Pytania: usunięto 95 pytań, wczytano 90 startowych.",
      "Linki gości: dostęp gości wyłączony.",
    ]);
  });

  it("uses the accusative and says when there was nothing", () => {
    const one = { ...EMPTY, snapshots: 1, guests: 1, groups: 1, rooms: 1, tables: 1, questions: 1 };
    expect(
      describeResetResult({
        parts: ["guesses", "seating", "guests", "venue", "questions", "guestLinks"],
        before: one,
        questionsAdded: 90,
        guestKeysReplaced: 1,
      }),
    ).toEqual([
      "Strzały: nie było nic do usunięcia; przyjmowanie strzałów otwarte.",
      "Rozsadzenie i historia: usunięto 1 publikację; TV nie pokazuje rozsadzenia do następnej publikacji.",
      "Goście i grupy: usunięto 1 gościa i 1 grupę.",
      "Plan, sale i stoliki: usunięto 1 salę i 1 stolik.",
      "Pytania: usunięto 1 pytanie, wczytano 90 startowych.",
      "Linki gości: nowe linki dla 1 gościa, dostęp gości wyłączony — wydrukuj nowe karteczki.",
    ]);
  });

  it("names the new links when the guests stay", () => {
    expect(
      describeResetResult({ parts: ["guestLinks"], before: DEMO, questionsAdded: 0, guestKeysReplaced: 40 }),
    ).toEqual(["Linki gości: nowe linki dla 40 gości, dostęp gości wyłączony — wydrukuj nowe karteczki."]);
    expect(
      describeResetResult({ parts: ["questions"], before: EMPTY, questionsAdded: 90, guestKeysReplaced: 0 }),
    ).toEqual(["Pytania: wczytano 90 startowych."]);
  });
});
