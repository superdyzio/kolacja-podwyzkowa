import { describe, expect, it } from "vitest";
import { MAX_GUESTS } from "@/lib/guests/names";
import { MAX_SEATS, MAX_TABLES } from "@/lib/venue/rules";
import { neighbours } from "@/lib/venue/seats";
import type { GuestGroupDto, SeatAssignmentDto, TableDto, TableShape } from "@/types";
import { validateDraft } from "./draft";
import { DEFAULT_DRAW_BUDGET_MS, createRandom, drawSeating, type DrawOptions, type DrawResult } from "./draw";
import { guest, input, seat, snapshotOf, table, withDraft } from "./fixtures.test-helpers";
import { historyPairs, repeatedNeighbours, type GuestPair } from "./neighbours";
import type { SeatingInput } from "./rules";

// scale-150 (S-19, FR-033, NFR-011): the draw at the new limits — 150 guests, tables up to 30 seats, 60 tables.
// The correctness cases are clock-free (seed + maxIterations), so they give the same result on any machine. The
// benchmark at the bottom reads the clock and runs only with DRAW_BENCH=1 (`DRAW_BENCH=1 npx vitest run
// src/lib/seating/draw-scale.test.ts`); its numbers are logged in context/changes/scale-150/plan.md.

type Venue = "banquet" | "many-tables" | "max-venue";

function tablesOf(venue: Venue): TableDto[] {
  const specs: { seats: number; shape: TableShape }[] = [];
  if (venue === "banquet") {
    // Five long tables of 30 and one of 10: 160 seats for 147 present guests (tight).
    for (let index = 0; index < 5; index++) specs.push({ seats: MAX_SEATS, shape: "rectangular" });
    specs.push({ seats: 10, shape: "round" });
  } else if (venue === "many-tables") {
    // 60 tables: 30 round of 4, 20 rectangular of 6 and 10 round of 8 = 320 seats.
    for (let index = 0; index < 30; index++) specs.push({ seats: 4, shape: "round" });
    for (let index = 0; index < 20; index++) specs.push({ seats: 6, shape: "rectangular" });
    for (let index = 0; index < 10; index++) specs.push({ seats: 8, shape: "round" });
  } else {
    // The largest venue the limits allow: 60 tables of 30 seats (1 800 seats), half round, half rectangular.
    for (let index = 0; index < MAX_TABLES; index++) {
      specs.push({ seats: MAX_SEATS, shape: index % 2 === 0 ? "round" : "rectangular" });
    }
  }
  return specs.map((spec, index) =>
    table(index + 1, `Stół ${String(index + 1)}`, spec.seats, spec.shape, 1 + (index % 6)),
  );
}

// 150 guests: 25 couples, 4 trios, 3 quartets and 2 groups of five (84 in groups), two pinned guests (one of them a
// group member), three absent guests (one of them a group member) → 147 present.
function largeEvening(venue: Venue): SeatingInput {
  const sizes = [...Array.from({ length: 25 }, () => 2), 3, 3, 3, 3, 4, 4, 4, 5, 5];
  const groups: GuestGroupDto[] = [];
  let next = 1;
  for (const [index, size] of sizes.entries()) {
    groups.push({ id: 1000 + index, memberIds: Array.from({ length: size }, () => next++) });
  }
  const groupOf = new Map(groups.flatMap((group) => group.memberIds.map((id) => [id, group.id] as const)));
  const absent = new Set([3, 120, 140]);
  const guests = Array.from({ length: MAX_GUESTS }, (_, index) =>
    guest(index + 1, `Gość ${String(index + 1)}`, {
      groupId: groupOf.get(index + 1) ?? null,
      isAbsent: absent.has(index + 1),
    }),
  );
  const tables = tablesOf(venue);
  // Guest 1 (a couple with guest 2) pinned at table 1 seat 1; guest 100 (single) pinned at the last table seat 1.
  const pinned: SeatAssignmentDto[] = [seat(1, 1, 1, true), seat(100, tables[tables.length - 1].id, 1, true)];
  return input(guests, tables, pinned, groups);
}

function seeded(seed: number, maxIterations: number): DrawOptions {
  return { random: createRandom(seed), timeBudgetMs: Number.POSITIVE_INFINITY, maxIterations, now: () => 0 };
}

type Drawn = Extract<DrawResult, { status: "drawn" }>;

function lonelyCount(data: SeatingInput): number {
  const absent = new Set(data.guestList.guests.filter((g) => g.isAbsent).map((g) => g.id));
  const present = data.assignments.filter((row) => !absent.has(row.guestId));
  const taken = new Set(present.map((row) => `${String(row.tableId)}:${String(row.seat)}`));
  const tableById = new Map(data.venue.tables.map((t) => [t.id, t]));
  return present.filter((row) => {
    const t = tableById.get(row.tableId);
    return (
      t !== undefined &&
      !neighbours(t.shape, t.seatCount, row.seat).some((other) => taken.has(`${String(row.tableId)}:${String(other)}`))
    );
  }).length;
}

function expectValid(data: SeatingInput, history: readonly GuestPair[], result: DrawResult): Drawn {
  if (result.status !== "drawn") {
    throw new Error(`expected a draft, got ${JSON.stringify(result.problems)}`);
  }
  expect(validateDraft(data, result.seats)).toEqual([]);
  const after = withDraft(data, result.seats);
  expect(lonelyCount(after)).toBe(0);
  // Every present guest has exactly one seat; the absent non-pinned ones have none.
  const present = data.guestList.guests.filter((g) => !g.isAbsent).length;
  expect(after.assignments).toHaveLength(present);
  expect(repeatedNeighbours(after, history)).toHaveLength(result.repeats);
  return result;
}

const VENUES: Venue[] = ["banquet", "many-tables", "max-venue"];

describe("drawSeating at the scale-150 limits (clock-free)", () => {
  it.each(VENUES)("%s: two rounds stay valid (hard rules, nobody alone, groups as blocks)", (venue) => {
    let data = largeEvening(venue);
    expect(data.guestList.guests).toHaveLength(150);
    const snapshots = [];
    for (let round = 1; round <= 2; round++) {
      const history = historyPairs(snapshots);
      const result = expectValid(data, history, drawSeating(data, history, seeded(round * 7, 20_000)));
      data = withDraft(data, result.seats);
      snapshots.push(snapshotOf(data, round));
    }
    // The pinned rows never moved.
    expect(data.assignments.filter((row) => row.pinned)).toEqual([
      seat(1, 1, 1, true),
      seat(100, data.venue.tables.length, 1, true),
    ]);
  });
});

// Measured with the clock: DRAW_BENCH=1 only (CI never runs it; a slow runner must not fail the build).
describe.skipIf(!process.env.DRAW_BENCH)("drawSeating benchmark at the scale-150 limits", () => {
  it.each(VENUES)("%s: a draw with history finishes within NFR-011's 3 s", (venue) => {
    const base = largeEvening(venue);
    const times: number[] = [];
    const repeats: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      // History of four earlier draws (a long evening of redraws).
      const snapshots = [];
      for (let round = 1; round <= 4; round++) {
        const earlier = drawSeating(base, historyPairs(snapshots), { random: createRandom(seed * 10 + round) });
        if (earlier.status !== "drawn") throw new Error("an earlier draw failed");
        snapshots.push(snapshotOf(withDraft(base, earlier.seats), round));
      }
      const history = historyPairs(snapshots);
      const started = performance.now();
      const result = drawSeating(base, history, { random: createRandom(seed + 100) });
      const elapsed = performance.now() - started;
      expectValid(base, history, result);
      times.push(Math.round(elapsed));
      repeats.push(result.status === "drawn" ? result.repeats : -1);
    }
    // eslint-disable-next-line no-console -- the benchmark's numbers are its output
    console.log(
      `[draw-bench] ${venue}: budget ${String(DEFAULT_DRAW_BUDGET_MS)} ms, times ${times.join(", ")} ms, repeats ${repeats.join(", ")}`,
    );
    expect(Math.max(...times)).toBeLessThan(3000);
  });

  it.each(VENUES)("%s, worst case: every pair already sat together, so the search runs until its budget", (venue) => {
    const base = largeEvening(venue);
    const ids = base.guestList.guests.map((g) => g.id);
    const history: GuestPair[] = ids.flatMap((a, index) => ids.slice(index + 1).map((b) => [a, b] as const));
    const started = performance.now();
    const result = drawSeating(base, history, { random: createRandom(7) });
    const elapsed = Math.round(performance.now() - started);
    expectValid(base, history, result);
    // eslint-disable-next-line no-console -- the benchmark's numbers are its output
    console.log(
      `[draw-bench] ${venue} worst case: budget ${String(DEFAULT_DRAW_BUDGET_MS)} ms, time ${String(elapsed)} ms, repeats ${String(result.status === "drawn" ? result.repeats : -1)}`,
    );
    expect(elapsed).toBeLessThan(3000);
  });
});
