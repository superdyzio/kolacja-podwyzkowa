import { describe, expect, it } from "vitest";
import type { SeatingSnapshot } from "@/types";
import { guest, input, seat, snapshotOf, table } from "./fixtures.test-helpers";
import {
  describeRepeat,
  formatHistoryCount,
  formatRepeatCount,
  historyPairs,
  neighbourPairs,
  pairKey,
  repeatedNeighbours,
  type PairSeat,
} from "./neighbours";

// Guest id 100 + seat number at table key 1.
function fullTable(seatCount: number): PairSeat[] {
  return Array.from({ length: seatCount }, (_, index) => ({ tableKey: 1, seat: index + 1, guestId: 101 + index }));
}

function asSeatPairs(pairs: readonly (readonly [number, number])[]): string[] {
  return pairs.map(([a, b]) => `${a - 100}-${b - 100}`);
}

describe("neighbourPairs", () => {
  it("gives the ring of a round table, including the wrap-around pair", () => {
    const pairs = neighbourPairs([{ key: 1, shape: "round", seatCount: 6 }], fullTable(6));
    expect(asSeatPairs(pairs)).toEqual(["1-2", "1-6", "2-3", "3-4", "4-5", "5-6"]);
  });

  it("gives side neighbours and the person opposite at a rectangular table", () => {
    const pairs = neighbourPairs([{ key: 1, shape: "rectangular", seatCount: 6 }], fullTable(6));
    expect(asSeatPairs(pairs)).toEqual(["1-2", "1-4", "2-3", "2-5", "3-6", "4-5", "5-6"]);
  });

  it("leaves the last seat of side A without an opposite at an odd rectangular table", () => {
    const pairs = neighbourPairs([{ key: 1, shape: "rectangular", seatCount: 7 }], fullTable(7));
    expect(asSeatPairs(pairs)).toEqual(["1-2", "1-5", "2-3", "2-6", "3-4", "3-7", "5-6", "6-7"]);
  });

  it("skips empty seats, deleted guests and seats beyond the table", () => {
    const seats: PairSeat[] = [
      { tableKey: 1, seat: 1, guestId: 101 },
      { tableKey: 1, seat: 2, guestId: null },
      { tableKey: 1, seat: 3, guestId: 103 },
      { tableKey: 1, seat: 4, guestId: 104 },
      { tableKey: 1, seat: 9, guestId: 109 },
    ];
    expect(asSeatPairs(neighbourPairs([{ key: 1, shape: "round", seatCount: 4 }], seats))).toEqual(["1-4", "3-4"]);
  });

  it("never pairs guests across tables", () => {
    const pairs = neighbourPairs(
      [
        { key: 1, shape: "round", seatCount: 2 },
        { key: 2, shape: "round", seatCount: 2 },
      ],
      [
        { tableKey: 1, seat: 1, guestId: 1 },
        { tableKey: 1, seat: 2, guestId: 2 },
        { tableKey: 2, seat: 1, guestId: 3 },
        { tableKey: 2, seat: 2, guestId: 4 },
      ],
    );
    expect(pairs).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe("historyPairs", () => {
  const guests = [guest(1, "Ania"), guest(2, "Kuba"), guest(3, "Ola"), guest(4, "Ewa")];
  const round4 = table(1, "Okno", 4);

  it("is the union of every snapshot's pairs, without duplicates", () => {
    const first = snapshotOf(input(guests, [round4], [seat(1, 1, 1), seat(2, 1, 2), seat(3, 1, 3), seat(4, 1, 4)]), 1);
    const second = snapshotOf(input(guests, [round4], [seat(1, 1, 1), seat(3, 1, 2), seat(2, 1, 3), seat(4, 1, 4)]), 2);
    expect(historyPairs([first, second]).map(([a, b]) => pairKey(a, b))).toEqual([
      "1-2",
      "1-3",
      "1-4",
      "2-3",
      "2-4",
      "3-4",
    ]);
  });

  it("uses the snapshot's own shape, not today's venue", () => {
    // Published as a round table of 4: 1-2, 2-3, 3-4, 1-4. As a rectangle it would also have 1-3 and 2-4 opposite.
    const snapshot = snapshotOf(input(guests, [round4], [seat(1, 1, 1), seat(2, 1, 2), seat(3, 1, 3), seat(4, 1, 4)]));
    expect(historyPairs([snapshot]).map(([a, b]) => pairKey(a, b))).toEqual(["1-2", "1-4", "2-3", "3-4"]);
  });

  it("drops guests deleted since (null id)", () => {
    const snapshot: SeatingSnapshot = snapshotOf(
      input(guests, [round4], [seat(1, 1, 1), seat(2, 1, 2), seat(3, 1, 3)]),
    );
    snapshot.seats = snapshot.seats.map((row) => (row.guestId === 2 ? { ...row, guestId: null } : row));
    expect(historyPairs([snapshot])).toEqual([]);
  });

  it("is empty before the first publish", () => {
    expect(historyPairs([])).toEqual([]);
  });
});

describe("repeatedNeighbours", () => {
  const ania = guest(1, "Ania", { groupId: 10 });
  const kuba = guest(2, "Kuba", { groupId: 10 });
  const ola = guest(3, "Ola");
  const ewa = guest(4, "Ewa");
  const okno = table(1, "Okno", 4);
  const kominek = table(2, "Kominek", 6, "rectangular");
  const groups = [{ id: 10, memberIds: [1, 2] }];

  it("lists pairs that sat together before, in table and seat order", () => {
    const data = input(
      [ania, kuba, ola, ewa],
      [okno, kominek],
      [seat(3, 1, 1), seat(4, 1, 2), seat(1, 2, 1), seat(2, 2, 4)],
      groups,
    );
    const repeats = repeatedNeighbours(data, [
      [3, 4],
      [1, 3],
    ]);
    expect(repeats).toEqual([{ guestIds: [3, 4], names: ["Ola", "Ewa"], tableId: 1, tableName: "Okno" }]);
    expect(repeats.map(describeRepeat)).toEqual(["Ola i Ewa (Okno)"]);
  });

  it("ignores pairs within one group and absent guests", () => {
    const data = input(
      [ania, kuba, ola, guest(4, "Ewa", { isAbsent: true })],
      [okno],
      [seat(1, 1, 1), seat(2, 1, 2), seat(3, 1, 3), seat(4, 1, 4)],
      groups,
    );
    expect(
      repeatedNeighbours(data, [
        [1, 2],
        [3, 4],
        [1, 4],
      ]),
    ).toEqual([]);
  });

  it("counts the person opposite at a rectangular table", () => {
    const data = input([ola, ewa], [kominek], [seat(3, 2, 2), seat(4, 2, 5)]);
    expect(repeatedNeighbours(data, [[3, 4]]).map(describeRepeat)).toEqual(["Ola i Ewa (Kominek)"]);
  });

  it("is empty without history", () => {
    expect(repeatedNeighbours(input([ola, ewa], [okno], [seat(3, 1, 1), seat(4, 1, 2)]), [])).toEqual([]);
  });
});

describe("formatRepeatCount", () => {
  it("uses Polish plurals", () => {
    expect(formatRepeatCount(0)).toBe("0 powtórzonych par sąsiadów");
    expect(formatRepeatCount(1)).toBe("1 powtórzona para sąsiadów");
    expect(formatRepeatCount(3)).toBe("3 powtórzone pary sąsiadów");
    expect(formatRepeatCount(5)).toBe("5 powtórzonych par sąsiadów");
    expect(formatRepeatCount(22)).toBe("22 powtórzone pary sąsiadów");
  });
});

describe("formatHistoryCount", () => {
  it("uses Polish plurals", () => {
    expect(formatHistoryCount(0)).toBe("Historia: 0 opublikowanych rozkładów");
    expect(formatHistoryCount(1)).toBe("Historia: 1 opublikowany rozkład");
    expect(formatHistoryCount(3)).toBe("Historia: 3 opublikowane rozkłady");
    expect(formatHistoryCount(12)).toBe("Historia: 12 opublikowanych rozkładów");
  });
});
