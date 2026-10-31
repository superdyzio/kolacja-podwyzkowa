import { describe, expect, it } from "vitest";
import type { SeatingSnapshot } from "@/types";
import {
  describeDraftProblem,
  describeRestore,
  restoreSeats,
  validateDraft,
  type DraftProblem,
  type DraftSeat,
} from "./draft";
import { guest, input, seat, snapshotOf, table } from "./fixtures.test-helpers";

const ania = guest(1, "Ania", { groupId: 10 });
const kuba = guest(2, "Kuba", { groupId: 10 });
const ola = guest(3, "Ola");
const ewa = guest(4, "Ewa");
const jan = guest(5, "Jan", { isAbsent: true });
const okno = table(1, "Okno", 6);
const kominek = table(2, "Kominek", 6, "rectangular");
const pair = [{ id: 10, memberIds: [1, 2] }];

function draft(...rows: [number, number, number][]): DraftSeat[] {
  return rows.map(([guestId, tableId, seatNumber]) => ({ guestId, tableId, seat: seatNumber }));
}

describe("validateDraft", () => {
  const guests = [ania, kuba, ola, ewa, jan];

  it("accepts a complete draft that keeps the pair together", () => {
    const data = input(guests, [okno, kominek], [], pair);
    expect(validateDraft(data, draft([1, 1, 6], [2, 1, 1], [3, 2, 1], [4, 2, 4]))).toEqual([]);
  });

  it("lists present guests left without a seat", () => {
    const data = input(guests, [okno], [], pair);
    expect(validateDraft(data, draft([1, 1, 1], [2, 1, 2]))).toEqual([
      { kind: "missing-guest", names: ["Ola", "Ewa"] },
    ]);
  });

  it("refuses absent, pinned, unknown and duplicated guests", () => {
    const data = input(guests, [okno], [seat(4, 1, 6, true)], pair);
    const problems = validateDraft(
      data,
      draft([1, 1, 1], [2, 1, 2], [3, 1, 3], [3, 1, 4], [4, 1, 5], [5, 1, 4], [99, 1, 4]),
    );
    expect(problems).toEqual<DraftProblem[]>([
      { kind: "duplicate-guest", name: "Ola" },
      { kind: "pinned-guest", name: "Ewa" },
      { kind: "absent-guest", name: "Jan" },
      { kind: "unknown-guest", guestId: 99 },
    ]);
  });

  it("refuses unknown tables, missing seats and seats used twice or held by a pin", () => {
    const data = input([ania, kuba, ola, ewa, guest(6, "Iza")], [okno], [seat(6, 1, 6, true)], []);
    // A guest with a bad row is reported for that row, not again as "missing".
    expect(validateDraft(data, draft([1, 9, 1], [2, 1, 7], [3, 1, 2], [4, 1, 2]))).toEqual<DraftProblem[]>([
      { kind: "unknown-table", tableId: 9 },
      { kind: "seat-out-of-range", tableName: "Okno", seat: 7 },
      { kind: "seat-taken", tableName: "Okno", seat: 2 },
    ]);
    expect(validateDraft(data, draft([1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 6]))).toEqual<DraftProblem[]>([
      { kind: "seat-taken", tableName: "Okno", seat: 6 },
    ]);
  });

  it("treats the seat of an absent pinned guest as taken", () => {
    const data = input([ola, jan], [okno], [seat(5, 1, 3, true)]);
    expect(validateDraft(data, draft([3, 1, 3]))).toEqual([{ kind: "seat-taken", tableName: "Okno", seat: 3 }]);
    expect(validateDraft(data, draft([3, 1, 4]))).toEqual([]);
  });

  it("refuses a pair at different tables, not next to each other, or split across a rectangle's sides", () => {
    const data = input([ania, kuba], [okno, kominek], [], pair);
    const split = [{ kind: "group-split", names: ["Ania", "Kuba"] }];
    expect(validateDraft(data, draft([1, 1, 1], [2, 2, 1]))).toEqual(split);
    expect(validateDraft(data, draft([1, 1, 1], [2, 1, 3]))).toEqual(split);
    // Seats 3 and 4 of a rectangular 6 are the ends of side A and side B; 1 and 4 are opposite — neither counts.
    expect(validateDraft(data, draft([1, 2, 3], [2, 2, 4]))).toEqual(split);
    expect(validateDraft(data, draft([1, 2, 1], [2, 2, 4]))).toEqual(split);
    expect(validateDraft(data, draft([1, 2, 5], [2, 2, 6]))).toEqual([]);
  });

  it("checks a group around its pinned member, and ignores absent members", () => {
    const trio = [{ id: 10, memberIds: [1, 2, 3] }];
    const members = [ania, kuba, guest(3, "Ola", { groupId: 10, isAbsent: true })];
    const data = input(members, [okno], [seat(1, 1, 1, true)], trio);
    expect(validateDraft(data, draft([2, 1, 6]))).toEqual([]);
    expect(validateDraft(data, draft([2, 1, 3]))).toEqual([{ kind: "group-split", names: ["Ania", "Kuba"] }]);
  });

  it("does not constrain a group with one present member", () => {
    const data = input([ania, guest(2, "Kuba", { groupId: 10, isAbsent: true }), ola], [okno, kominek], [], pair);
    expect(validateDraft(data, draft([1, 1, 1], [3, 2, 6]))).toEqual([]);
  });
});

describe("describeDraftProblem", () => {
  it("says what is wrong in Polish", () => {
    expect(describeDraftProblem({ kind: "missing-guest", names: ["Ola", "Ewa"] })).toBe(
      "Bez miejsca w projekcie: Ola, Ewa.",
    );
    expect(describeDraftProblem({ kind: "group-split", names: ["Ania", "Kuba", "Ola"] })).toBe(
      "Ania, Kuba i Ola — muszą siedzieć obok siebie przy jednym stoliku.",
    );
    expect(describeDraftProblem({ kind: "seat-taken", tableName: "Okno", seat: 2 })).toBe(
      "Okno, miejsce 2 — miejsce zajęte dwa razy albo przez przypiętą osobę.",
    );
    expect(describeDraftProblem({ kind: "seat-out-of-range", tableName: "Okno", seat: 9 })).toBe(
      "Okno nie ma miejsca nr 9.",
    );
    expect(describeDraftProblem({ kind: "pinned-guest", name: "Ewa" })).toBe(
      "Przypięta osoba w projekcie: Ewa — jej miejsce się nie zmienia.",
    );
  });
});

describe("restoreSeats", () => {
  const guests = [ania, kuba, ola, ewa];
  const published = input(guests, [okno, kominek], [seat(1, 1, 1), seat(2, 1, 2), seat(3, 2, 6), seat(4, 1, 5)], pair);
  const snapshot: SeatingSnapshot = snapshotOf(published, 7);

  it("puts everyone back on their published seats", () => {
    const now = input(guests, [okno, kominek], [seat(3, 1, 1), seat(1, 1, 3)], pair);
    expect(restoreSeats(snapshot, now)).toEqual({
      seats: draft([1, 1, 1], [2, 1, 2], [3, 2, 6], [4, 1, 5]),
      unseated: [],
    });
  });

  it("skips deleted tables, removed seats and seats held by a pin, and keeps pinned guests where they are", () => {
    const smallerOkno = table(1, "Okno", 4);
    const now = input(guests, [smallerOkno], [seat(1, 1, 2, true)], pair);
    // Ania is pinned at Okno 2 → stays; Kuba's seat Okno 2 is held by her pin; Ewa's seat 5 is gone; Kominek
    // (Ola) is deleted.
    expect(restoreSeats(snapshot, now)).toEqual({
      seats: [],
      unseated: [
        { guestId: 2, name: "Kuba", reason: "seat-pinned" },
        { guestId: 3, name: "Ola", reason: "table-deleted" },
        { guestId: 4, name: "Ewa", reason: "seat-removed" },
      ],
    });
  });

  it("skips deleted and now-absent guests and lists new guests as unseated", () => {
    const deleted: SeatingSnapshot = {
      ...snapshot,
      seats: snapshot.seats.map((row) => (row.guestId === 4 ? { ...row, guestId: null } : row)),
    };
    const now = input(
      [ania, kuba, guest(3, "Ola", { isAbsent: true }), guest(6, "Iza")],
      [okno, kominek],
      [seat(3, 2, 6)],
      pair,
    );
    expect(restoreSeats(deleted, now)).toEqual({
      seats: draft([1, 1, 1], [2, 1, 2]),
      unseated: [{ guestId: 6, name: "Iza", reason: "not-in-snapshot" }],
    });
  });
});

describe("describeRestore", () => {
  it("names who is left without a seat and why", () => {
    expect(describeRestore("2026-10-27T18:42:00.000Z", [])).toBe(
      "Przywrócono rozkład z 27.10, 19:42 — sprawdź i opublikuj.",
    );
    expect(
      describeRestore("2026-10-27T18:42:00.000Z", [
        { guestId: 1, name: "Ania", reason: "table-deleted" },
        { guestId: 2, name: "Kuba", reason: "seat-pinned" },
      ]),
    ).toBe(
      "Przywrócono rozkład z 27.10, 19:42 — sprawdź i opublikuj. Bez miejsca: Ania (stolik usunięty), Kuba (miejsce zajmuje przypięta osoba).",
    );
  });
});
