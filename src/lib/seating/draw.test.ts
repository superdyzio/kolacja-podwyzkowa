import { describe, expect, it } from "vitest";
import { areConsecutiveSeats } from "@/lib/venue/seats";
import type { GuestDto, GuestGroupDto, SeatAssignmentDto, SeatingSnapshot, TableDto, TableShape } from "@/types";
import { validateDraft } from "./draft";
import {
  DEFAULT_DRAW_BUDGET_MS,
  createRandom,
  describeDrawProblem,
  drawSeating,
  type DrawOptions,
  type DrawResult,
} from "./draw";
import { demoEvening, guest, input, seat, snapshotOf, table, withDraft } from "./fixtures.test-helpers";
import { historyPairs, repeatedNeighbours, type GuestPair } from "./neighbours";
import type { SeatingInput } from "./rules";

// Clock-free options: the search stops at 0 repeats or after maxIterations, never on time, so a seed gives the same
// result on any machine.
function seeded(seed: number, maxIterations = 300_000): DrawOptions {
  return { random: createRandom(seed), timeBudgetMs: Number.POSITIVE_INFINITY, maxIterations, now: () => 0 };
}

type Drawn = Extract<DrawResult, { status: "drawn" }>;

// Every drawn result is checked by code independent of the solver: the server's hard-rule validation and a recount
// of the repeated pairs.
function expectValidDraw(data: SeatingInput, history: readonly GuestPair[], result: DrawResult): Drawn {
  if (result.status !== "drawn") {
    throw new Error(`expected a draft, got ${JSON.stringify(result.problems)}`);
  }
  expect(validateDraft(data, result.seats)).toEqual([]);
  expect(repeatedNeighbours(withDraft(data, result.seats), history)).toHaveLength(result.repeats);
  return result;
}

function seatOf(seats: readonly { guestId: number; tableId: number; seat: number }[], guestId: number) {
  return seats.find((row) => row.guestId === guestId);
}

describe("drawSeating — demo evening (acceptance)", () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];

  it.each(seeds)("seed %i: manual seating, then two draws + publishes, each with 0 repeated pairs", (seed) => {
    let data = demoEvening();
    const snapshots: SeatingSnapshot[] = [snapshotOf(data, 1)];
    for (let round = 1; round <= 2; round++) {
      const history = historyPairs(snapshots);
      const result = expectValidDraw(data, history, drawSeating(data, history, seeded(seed * 10 + round)));
      expect(result.repeats).toBe(0);

      // Hard rules, spelled out: the pinned guest stays, the absent guest has no seat, everyone else present is
      // seated, the groups sit together.
      data = withDraft(data, result.seats);
      expect(data.assignments.find((row) => row.guestId === 9)).toEqual(seat(9, 1, 1, true));
      expect(data.assignments.some((row) => row.guestId === 40)).toBe(false);
      expect(data.assignments).toHaveLength(39);
      for (const group of data.guestList.groups) {
        const rows = group.memberIds.map((id) => data.assignments.find((row) => row.guestId === id));
        const tableIds = new Set(rows.map((row) => row?.tableId));
        expect(tableIds.size).toBe(1);
        const t = data.venue.tables.find((candidate) => candidate.id === rows[0]?.tableId);
        expect(
          t &&
            areConsecutiveSeats(
              t.shape,
              t.seatCount,
              rows.map((row) => row?.seat ?? 0),
            ),
        ).toBe(true);
      }
      expect(repeatedNeighbours(data, history)).toEqual([]);
      snapshots.push(snapshotOf(data, round + 1));
    }
  });

  it("gives a different draft for another seed (redraw)", () => {
    const data = demoEvening();
    const history = historyPairs([snapshotOf(data)]);
    const first = expectValidDraw(data, history, drawSeating(data, history, seeded(11)));
    const second = expectValidDraw(data, history, drawSeating(data, history, seeded(12)));
    expect(JSON.stringify(first.seats)).not.toBe(JSON.stringify(second.seats));
  });

  it("is reproducible for the same seed", () => {
    const data = demoEvening();
    const history = historyPairs([snapshotOf(data)]);
    expect(drawSeating(data, history, seeded(5))).toEqual(drawSeating(data, history, seeded(5)));
  });

  it("returns a random arrangement at once when there is no history", () => {
    const data = demoEvening();
    const result = expectValidDraw(data, [], drawSeating(data, [], seeded(3)));
    expect(result).toMatchObject({ repeats: 0, iterations: 0 });
  });
});

describe("drawSeating — pins and absences", () => {
  it("keeps the other members of a group next to their pinned member", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = demoEvening();
      // Gość 1 (pair with Gość 2) pinned at Stół 1, seat 3.
      const data = { ...base, assignments: [...base.assignments, seat(1, 1, 3, true)] };
      const history = historyPairs([snapshotOf(base)]);
      const result = expectValidDraw(data, history, drawSeating(data, history, seeded(seed)));
      const partner = seatOf(result.seats, 2);
      expect(partner?.tableId).toBe(1);
      expect([2, 4]).toContain(partner?.seat);
      expect(seatOf(result.seats, 1)).toBeUndefined();
    }
  });

  it("keeps the seat of an absent pinned guest empty", () => {
    const base = demoEvening();
    // Gość 40 is absent; pinned at Stół 5, seat 2 → 39 seats for 39 present guests.
    const data = { ...base, assignments: [...base.assignments, seat(40, 5, 2, true)] };
    const history = historyPairs([snapshotOf(base)]);
    const result = expectValidDraw(data, history, drawSeating(data, history, seeded(4)));
    expect(result.seats).toHaveLength(38);
    expect(result.seats.some((row) => row.tableId === 5 && row.seat === 2)).toBe(false);
    expect(seatOf(result.seats, 40)).toBeUndefined();
  });

  it("does not move a whole group that is pinned and gives absent members no seat", () => {
    const pair: GuestGroupDto[] = [{ id: 10, memberIds: [1, 2, 3] }];
    const data = input(
      [
        guest(1, "Ania", { groupId: 10 }),
        guest(2, "Kuba", { groupId: 10 }),
        guest(3, "Ola", { groupId: 10, isAbsent: true }),
        guest(4, "Ewa"),
        guest(5, "Jan"),
      ],
      [table(1, "Okno", 4), table(2, "Kominek", 2)],
      [seat(1, 1, 1, true), seat(2, 1, 2, true), seat(3, 2, 1)],
      pair,
    );
    const result = expectValidDraw(data, [], drawSeating(data, [], seeded(1)));
    expect(result.seats.map((row) => row.guestId).sort()).toEqual([4, 5]);
  });
});

describe("drawSeating — infeasible", () => {
  function problemsOf(result: DrawResult) {
    expect(result.status).toBe("infeasible");
    return result.status === "infeasible" ? result.problems : [];
  }

  it("names too many present guests for the seats", () => {
    const base = demoEvening();
    const guests = base.guestList.guests.map((g) => (g.id === 40 ? { ...g, isAbsent: false } : g));
    const data = { ...base, guestList: { ...base.guestList, guests: [...guests, guest(41, "Gość 41")] } };
    const problems = problemsOf(drawSeating(data, [], seeded(1)));
    expect(problems).toEqual([{ kind: "too-many-guests", present: 41, seats: 40 }]);
    expect(problems.map(describeDrawProblem)).toEqual([
      "Obecnych gości jest 41, a dostępnych miejsc 40 — dodaj miejsca albo oznacz kogoś jako nieobecnego.",
    ]);
  });

  it("names a group that fits no table on consecutive seats", () => {
    const names = ["Ania", "Kuba", "Ola", "Ewa", "Jan"];
    const data = input(
      names.map((name, index) => guest(index + 1, name, { groupId: 10 })),
      // Round 4 is too small; a rectangular 8 has sides of 4.
      [table(1, "Okno", 4), table(2, "Kominek", 8, "rectangular")],
      [],
      [{ id: 10, memberIds: [1, 2, 3, 4, 5] }],
    );
    const problems = problemsOf(drawSeating(data, [], seeded(1)));
    expect(problems).toEqual([{ kind: "group-too-large", names }]);
    expect(describeDrawProblem(problems[0] ?? { kind: "groups-do-not-fit" })).toBe(
      "Grupa Ania, Kuba, Ola, Ewa i Jan (5 osób) nie zmieści się na kolejnych miejscach przy żadnym stoliku — potrzeba 5 wolnych miejsc obok siebie (przy prostokątnym po jednej stronie).",
    );
  });

  it("names pinned members of one group at different tables", () => {
    const data = input(
      [guest(1, "Ania", { groupId: 10 }), guest(2, "Kuba", { groupId: 10 })],
      [table(1, "Okno", 6), table(2, "Kominek", 6)],
      [seat(1, 1, 1, true), seat(2, 2, 1, true)],
      [{ id: 10, memberIds: [1, 2] }],
    );
    const problems = problemsOf(drawSeating(data, [], seeded(1)));
    expect(problems).toEqual([{ kind: "pinned-group-split", names: ["Ania", "Kuba"] }]);
    expect(problems.map(describeDrawProblem)[0]).toContain("Grupa Ania i Kuba: przypięte osoby");
  });

  it("names pinned members of a trio too far apart at one table", () => {
    const data = input(
      [guest(1, "Ania", { groupId: 10 }), guest(2, "Kuba", { groupId: 10 }), guest(3, "Ola", { groupId: 10 })],
      [table(1, "Okno", 8)],
      [seat(1, 1, 1, true), seat(2, 1, 5, true)],
      [{ id: 10, memberIds: [1, 2, 3] }],
    );
    expect(problemsOf(drawSeating(data, [], seeded(1)))).toEqual([
      { kind: "pinned-group-split", names: ["Ania", "Kuba", "Ola"] },
    ]);
  });

  it("names a pinned member whose neighbouring seats are pinned by other people", () => {
    const data = input(
      [guest(1, "Ania", { groupId: 10 }), guest(2, "Kuba", { groupId: 10 }), guest(3, "Ola"), guest(4, "Ewa")],
      [table(1, "Okno", 6)],
      [seat(1, 1, 1, true), seat(3, 1, 2, true), seat(4, 1, 6, true)],
      [{ id: 10, memberIds: [1, 2] }],
    );
    const problems = problemsOf(drawSeating(data, [], seeded(1)));
    expect(problems).toEqual([{ kind: "pinned-group-no-room", names: ["Ania", "Kuba"] }]);
    expect(problems.map(describeDrawProblem)[0]).toContain("obok przypiętego miejsca nie ma dość wolnych miejsc");
  });

  it("names groups that fit one by one but not all together", () => {
    // Two rectangular 4 tables: four 2-seat runs; pinned singles take side A of both → two runs for three pairs.
    const guests: GuestDto[] = [
      ...[1, 2, 3, 4, 5, 6].map((id) => guest(id, `G${id}`, { groupId: 10 + Math.ceil(id / 2) })),
      guest(7, "Ola"),
      guest(8, "Ewa"),
    ];
    const groups = [11, 12, 13].map((id) => ({ id, memberIds: [(id - 10) * 2 - 1, (id - 10) * 2] }));
    const data = input(
      guests,
      [table(1, "Okno", 4, "rectangular"), table(2, "Kominek", 4, "rectangular")],
      [seat(7, 1, 1, true), seat(8, 2, 1, true)],
      groups,
    );
    const problems = problemsOf(drawSeating(data, [], seeded(1)));
    expect(problems).toEqual([{ kind: "groups-do-not-fit" }]);
    expect(describeDrawProblem({ kind: "groups-do-not-fit" })).toBe(
      "Wszystkie grupy naraz nie mieszczą się na kolejnych miejscach przy stolikach — dodaj miejsca, zmień stoliki albo odepnij kogoś.",
    );
  });

  it("finds the only arrangement of an exact fit (no false 'infeasible')", () => {
    // Round 4 must hold the quartet, one side of the rectangular 6 the trio, the other side three singles.
    const guests: GuestDto[] = [
      ...[1, 2, 3, 4].map((id) => guest(id, `Q${id}`, { groupId: 20 })),
      ...[5, 6, 7].map((id) => guest(id, `T${id}`, { groupId: 30 })),
      guest(8, "Ola"),
      guest(9, "Ewa"),
      guest(10, "Jan"),
    ];
    const groups = [
      { id: 20, memberIds: [1, 2, 3, 4] },
      { id: 30, memberIds: [5, 6, 7] },
    ];
    const data = input(guests, [table(1, "Okno", 4), table(2, "Kominek", 6, "rectangular")], [], groups);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const result = expectValidDraw(data, [], drawSeating(data, [], seeded(seed)));
      expect(result.seats).toHaveLength(10);
    }
  });
});

// Small random venues: every result is either a named infeasibility or a valid draft whose repeat count is right.
describe("drawSeating — property", () => {
  const SHAPES: TableShape[] = ["round", "rectangular"];

  function randomCase(seed: number): { data: SeatingInput; history: GuestPair[] } {
    const random = createRandom(seed);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const tables: TableDto[] = Array.from({ length: int(1, 4) }, (_, index) =>
      table(index + 1, `T${index + 1}`, int(2, 10), SHAPES[int(0, 1)]),
    );
    const totalSeats = tables.reduce((sum, t) => sum + t.seatCount, 0);
    const guestCount = int(1, totalSeats + 1);
    const guests: GuestDto[] = Array.from({ length: guestCount }, (_, index) => guest(index + 1, `G${index + 1}`));
    const ids = guests.map((g) => g.id).sort(() => random() - 0.5);
    const groups: GuestGroupDto[] = [];
    for (let groupIndex = 0, groupCount = int(0, 3); groupIndex < groupCount; groupIndex++) {
      const size = int(2, 4);
      if (ids.length < size) {
        break;
      }
      const memberIds = ids.splice(0, size).sort((a, b) => a - b);
      groups.push({ id: 100 + groupIndex, memberIds });
      for (const id of memberIds) {
        const index = guests.findIndex((g) => g.id === id);
        guests[index] = { ...guests[index], groupId: 100 + groupIndex };
      }
    }
    for (let count = int(0, 2); count > 0; count--) {
      const index = int(0, guests.length - 1);
      guests[index] = { ...guests[index], isAbsent: true };
    }
    const assignments: SeatAssignmentDto[] = [];
    const taken = new Set<string>();
    for (let count = int(0, 2); count > 0; count--) {
      const g = guests[int(0, guests.length - 1)];
      const t = tables[int(0, tables.length - 1)];
      const s = int(1, t.seatCount);
      if (!taken.has(`${t.id}:${s}`) && !assignments.some((a) => a.guestId === g.id)) {
        taken.add(`${t.id}:${s}`);
        assignments.push(seat(g.id, t.id, s, true));
      }
    }
    const history: GuestPair[] = [];
    for (let count = int(0, guestCount * 2); count > 0; count--) {
      const a = int(1, guestCount);
      const b = int(1, guestCount);
      if (a !== b) {
        history.push(a < b ? [a, b] : [b, a]);
      }
    }
    return { data: input(guests, tables, assignments, groups), history };
  }

  it("never breaks a hard rule on 150 random venues", () => {
    let drawn = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { data, history } = randomCase(seed);
      const result = drawSeating(data, history, seeded(seed, 3_000));
      if (result.status === "drawn") {
        drawn++;
        expectValidDraw(data, history, result);
      } else {
        expect(result.problems.length).toBeGreaterThan(0);
        expect(result.problems.map(describeDrawProblem).every((line) => line.length > 0)).toBe(true);
      }
    }
    // Most random venues are feasible; the generator must exercise the draw, not only the refusals.
    expect(drawn).toBeGreaterThan(75);
  });
});

describe("drawSeating — performance (NFR-007: a draft for 60 guests in ≤ 3 s)", () => {
  // 64 seats: 6 × round 8, 2 × rectangular 8; 60 guests with 3 pairs, a trio and a quartet; one pinned guest.
  function sixtyGuests(): SeatingInput {
    const groups: GuestGroupDto[] = [
      { id: 1, memberIds: [1, 2] },
      { id: 2, memberIds: [3, 4] },
      { id: 3, memberIds: [5, 6] },
      { id: 4, memberIds: [7, 8, 9] },
      { id: 5, memberIds: [10, 11, 12, 13] },
    ];
    const groupOf = new Map(groups.flatMap((group) => group.memberIds.map((id) => [id, group.id] as const)));
    const guests = Array.from({ length: 60 }, (_, index) =>
      guest(index + 1, `Gość ${index + 1}`, { groupId: groupOf.get(index + 1) ?? null }),
    );
    const tables = [
      ...[1, 2, 3, 4, 5, 6].map((id) => table(id, `Okrągły ${id}`, 8)),
      table(7, "Długi 7", 8, "rectangular"),
      table(8, "Długi 8", 8, "rectangular"),
    ];
    return input(guests, tables, [seat(60, 1, 1, true)], groups);
  }

  it("draws the 6th arrangement within the budget after 5 published ones", () => {
    let data = sixtyGuests();
    const snapshots: SeatingSnapshot[] = [];
    for (let round = 1; round <= 5; round++) {
      const history = historyPairs(snapshots);
      const result = expectValidDraw(data, history, drawSeating(data, history, seeded(round, 200_000)));
      data = withDraft(data, result.seats);
      snapshots.push(snapshotOf(data, round));
    }
    const history = historyPairs(snapshots);
    const started = performance.now();
    const result = drawSeating(data, history, { random: createRandom(99) });
    const elapsed = performance.now() - started;
    expectValidDraw(data, history, result);
    expect(elapsed).toBeLessThan(3000);
  });

  it("stops at the time budget when 0 repeats is impossible", () => {
    // Every pair has already sat together (even 20 random earlier arrangements leave a 0-repeat draft possible —
    // the solver finds one in milliseconds), so the search can only minimise and must stop on the clock.
    const data = sixtyGuests();
    const history: GuestPair[] = [];
    for (let a = 1; a <= 60; a++) {
      for (let b = a + 1; b <= 60; b++) {
        history.push([a, b]);
      }
    }
    const started = performance.now();
    const result = drawSeating(data, history, { random: createRandom(8) });
    const elapsed = performance.now() - started;
    const drawn = expectValidDraw(data, history, result);
    expect(drawn.repeats).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(DEFAULT_DRAW_BUDGET_MS + 300);
  });
});
