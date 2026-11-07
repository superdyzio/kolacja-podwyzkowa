import type { Locale } from "@/lib/i18n/locale";
import { neighbours, sideALength } from "@/lib/venue/seats";
import type { TableShape } from "@/types";
import type { DraftSeat } from "./draft";
import { formatRepeatCount, type GuestPair } from "./neighbours";
import { seatingMessages } from "./messages";
import { formatNameList, type SeatingInput } from "./rules";

// The draw (PRD FR-009, NFR-007): a draft of a new seating computed in the organizer's browser. Pure, no DB, no
// `astro:*`; randomness and time are injected, so tests are deterministic.
//
// Hard rules (the draft fails validateDraft() otherwise — see draft.ts):
// - present guests only; every present guest who is not pinned gets a seat;
// - pinned rows stay as they are; the seat of an absent pinned guest stays empty and produces no neighbour pairs;
// - every group with ≥ 2 present members sits at one table on consecutive seats: an arc of a round table (wrapping
//   around) or a run on ONE side of a rectangular table (areConsecutiveSeats in seats.ts); when some members are
//   pinned, the others complete one block of consecutive seats around them at that table.
// The draw's own hard rule (draw-neighbour; not re-checked by validateDraft): nobody sits alone — every present seated
// guest, pinned ones included, has at least one neighbour (`neighbours()`: side or opposite) occupied by a present
// guest; the seat of an absent pinned guest is no company. When the search cannot reach that, the draw is refused
// ("lonely", with the names) and nothing is sent.
// Soft rule: as few repeated neighbour pairs as possible, a "repeated pair" being two guests who are neighbours now
// and in any published arrangement (history), except members of one group.
//
// Search: static feasibility checks → groups placed by randomized backtracking (largest first, forward checking) →
// singles shuffled into the free seats → local search (move/swap a single, relocate a group to another block with
// the displaced singles taking its old seats, permute a group within its block) with an incremental cost and
// simulated-annealing acceptance, restarting from the best arrangement when it stalls. The cost is the repeats plus
// a weight above any possible repeat count per guest left alone, so a lonely guest is never traded for fewer repeats.
// It stops with nobody alone and 0 repeats, after `maxIterations`, or when the time budget is used up (the clock is
// read every 256 iterations).

export const DEFAULT_DRAW_BUDGET_MS = 1200;
// Notice after a draw was saved as the working arrangement.
export function drawnMessage(repeats: number, locale: Locale = "pl"): string {
  return seatingMessages(locale).drawn(formatRepeatCount(repeats, locale));
}

export interface DrawOptions {
  // Uniform [0, 1) — inject createRandom(seed) for a reproducible draw.
  random: () => number;
  // Wall-clock budget of the search (default DEFAULT_DRAW_BUDGET_MS); Infinity for clock-free tests.
  timeBudgetMs?: number;
  // Upper bound of local-search steps (default: unlimited — the budget stops it).
  maxIterations?: number;
  // Milliseconds clock (default performance.now / Date.now).
  now?: () => number;
}

export type DrawProblem =
  | { kind: "too-many-guests"; present: number; seats: number }
  | { kind: "group-too-large"; names: string[] }
  | { kind: "pinned-group-split"; names: string[] }
  | { kind: "pinned-group-no-room"; names: string[] }
  | { kind: "groups-do-not-fit" }
  | { kind: "lonely"; names: string[] };

export type DrawResult =
  | { status: "drawn"; seats: DraftSeat[]; repeats: number; iterations: number }
  | { status: "infeasible"; problems: DrawProblem[] };

// One line per cause, saying what to change.
export function describeDrawProblem(problem: DrawProblem, locale: Locale = "pl"): string {
  const messages = seatingMessages(locale);
  switch (problem.kind) {
    case "too-many-guests":
      return messages.drawTooManyGuests(problem.present, problem.seats);
    case "group-too-large":
      return messages.drawGroupTooLarge(formatNameList(problem.names, locale), problem.names.length);
    case "pinned-group-split":
      return messages.drawPinnedGroupSplit(formatNameList(problem.names, locale));
    case "pinned-group-no-room":
      return messages.drawPinnedGroupNoRoom(formatNameList(problem.names, locale));
    case "groups-do-not-fit":
      return messages.drawGroupsDoNotFit;
    case "lonely":
      return messages.drawLonely(formatNameList(problem.names, locale));
  }
}

// mulberry32: a tiny, fast, seedable PRNG (uniform [0, 1)).
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh seed for a real draw (every draw differs).
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const EMPTY = -1;
// The seat of an absent pinned guest: taken, but nobody sits there.
const BLOCKED = -2;
// Backtracking nodes for placing the groups: the first attempt, then each fresh random restart (heavy-tailed search:
// an unlucky order of choices can stall a placement that a new order finds at once).
const PLACEMENT_NODE_LIMIT = 50_000;
const PLACEMENT_RESTART_NODES = 10_000;
const PLACEMENT_RESTARTS = 7;
const TEMPERATURE = 0.3;
const KICK_MOVES = 12;

// The blocks of k consecutive seats of one table (global seat indices): every arc of a round table (the whole table
// when k = n), every run on either side of a rectangular table.
function tableBlocks(base: number, seatCount: number, shape: TableShape, size: number): number[][] {
  const blocks: number[][] = [];
  if (size > seatCount) {
    return blocks;
  }
  if (shape === "round") {
    if (size === seatCount) {
      blocks.push(Array.from({ length: seatCount }, (_, index) => base + index));
      return blocks;
    }
    for (let start = 0; start < seatCount; start++) {
      blocks.push(Array.from({ length: size }, (_, index) => base + ((start + index) % seatCount)));
    }
    return blocks;
  }
  const sideA = sideALength(seatCount);
  for (const [first, length] of [
    [0, sideA],
    [sideA, seatCount - sideA],
  ] as const) {
    for (let start = 0; start + size <= length; start++) {
      blocks.push(Array.from({ length: size }, (_, index) => base + first + start + index));
    }
  }
  return blocks;
}

interface Unit {
  // Present group members, for messages.
  names: string[];
  // Members that may move (guest indices).
  members: number[];
  // Seats of pinned members (global indices) — every candidate block contains them.
  pinnedSeats: Set<number>;
  candidates: number[][];
  block: number[];
}

export function drawSeating(input: SeatingInput, history: readonly GuestPair[], options: DrawOptions): DrawResult {
  const random = options.random;
  const now = options.now ?? defaultNow;
  const budget = options.timeBudgetMs ?? DEFAULT_DRAW_BUDGET_MS;
  const maxIterations = options.maxIterations ?? Number.POSITIVE_INFINITY;
  const randomInt = (bound: number) => Math.floor(random() * bound);
  function shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index--) {
      const other = randomInt(index + 1);
      const swap = items[index];
      items[index] = items[other];
      items[other] = swap;
    }
    return items;
  }

  // Seats: global indices, table by table.
  const tables = input.venue.tables;
  const seatTableId: number[] = [];
  const seatNumber: number[] = [];
  const seatTableIndex: number[] = [];
  const tableBase: number[] = [];
  const tableIndexById = new Map<number, number>();
  tables.forEach((table, tableIndex) => {
    tableIndexById.set(table.id, tableIndex);
    tableBase.push(seatTableId.length);
    for (let seat = 1; seat <= table.seatCount; seat++) {
      seatTableId.push(table.id);
      seatNumber.push(seat);
      seatTableIndex.push(tableIndex);
    }
  });
  const seatCount = seatTableId.length;
  const adjacency: number[][] = [];
  tables.forEach((table, tableIndex) => {
    const base = tableBase[tableIndex] ?? 0;
    for (let seat = 1; seat <= table.seatCount; seat++) {
      adjacency.push(neighbours(table.shape, table.seatCount, seat).map((other) => base + other - 1));
    }
  });

  // Guests: present ones get an index; absent ones never sit (except pinned, as a blocked seat).
  const present = input.guestList.guests.filter((guest) => !guest.isAbsent);
  const guestCount = present.length;
  const indexOfGuest = new Map(present.map((guest, index) => [guest.id, index]));

  const initial = new Int32Array(seatCount).fill(EMPTY);
  const fixed = new Uint8Array(seatCount);
  const pinnedGuest = new Uint8Array(guestCount);
  const pinnedSeatOf = new Map<number, number>();
  let blocked = 0;
  for (const assignment of input.assignments) {
    const tableIndex = tableIndexById.get(assignment.tableId);
    const table = tableIndex === undefined ? undefined : tables[tableIndex];
    if (!assignment.pinned || tableIndex === undefined || !table || assignment.seat > table.seatCount) {
      continue;
    }
    const seatIndex = (tableBase[tableIndex] ?? 0) + assignment.seat - 1;
    fixed[seatIndex] = 1;
    const guestIndex = indexOfGuest.get(assignment.guestId);
    if (guestIndex === undefined) {
      initial[seatIndex] = BLOCKED;
      blocked++;
    } else {
      initial[seatIndex] = guestIndex;
      pinnedGuest[guestIndex] = 1;
      pinnedSeatOf.set(guestIndex, seatIndex);
    }
  }

  const problems: DrawProblem[] = [];
  if (guestCount > seatCount - blocked) {
    problems.push({ kind: "too-many-guests", present: guestCount, seats: seatCount - blocked });
  }
  // Nobody can ever sit with them (draw-neighbour): refused at once rather than after the whole search — the only
  // present guest, or a pinned guest whose every neighbour seat is pinned with nobody present on it.
  if (guestCount === 1) {
    problems.push({ kind: "lonely", names: [present[0]?.displayName ?? "?"] });
  } else {
    const alone = [...pinnedSeatOf].filter(([, seatIndex]) =>
      (adjacency[seatIndex] ?? []).every((other) => fixed[other] === 1 && (initial[other] ?? EMPTY) < 0),
    );
    if (alone.length > 0) {
      problems.push({ kind: "lonely", names: alone.map(([guestIndex]) => present[guestIndex]?.displayName ?? "?") });
    }
  }

  // Conflicts: pairs from the history among present guests, minus pairs within one group.
  const conflict = new Uint8Array(guestCount * guestCount);
  for (const [first, second] of history) {
    const a = indexOfGuest.get(first);
    const b = indexOfGuest.get(second);
    if (a === undefined || b === undefined || a === b) {
      continue;
    }
    const groupA = present[a]?.groupId ?? null;
    if (groupA !== null && groupA === (present[b]?.groupId ?? null)) {
      continue;
    }
    conflict[a * guestCount + b] = 1;
    conflict[b * guestCount + a] = 1;
  }

  // Group units with their candidate blocks.
  const blockCache = new Map<string, number[][]>();
  const blocksOf = (tableIndex: number, size: number): number[][] => {
    const key = `${tableIndex}:${size}`;
    let blocks = blockCache.get(key);
    if (!blocks) {
      const table = tables[tableIndex];
      blocks = tableBlocks(tableBase[tableIndex] ?? 0, table.seatCount, table.shape, size);
      blockCache.set(key, blocks);
    }
    return blocks;
  };
  const units: Unit[] = [];
  for (const group of input.guestList.groups) {
    const members = group.memberIds.flatMap((id) => {
      const index = indexOfGuest.get(id);
      return index === undefined ? [] : [index];
    });
    if (members.length < 2) {
      continue;
    }
    const names = members.map((index) => present[index]?.displayName ?? "?");
    const size = members.length;
    const pinnedSeats = new Set(
      members.flatMap((index) => (pinnedGuest[index] ? [pinnedSeatOf.get(index) ?? -1] : [])),
    );
    const movable = members.filter((index) => !pinnedGuest[index]);
    let candidates: number[][];
    if (pinnedSeats.size > 0) {
      const pinnedTables = new Set([...pinnedSeats].map((seat) => seatTableIndex[seat]));
      const around =
        pinnedTables.size === 1
          ? blocksOf([...pinnedTables][0] ?? 0, size).filter((block) =>
              [...pinnedSeats].every((seat) => block.includes(seat)),
            )
          : [];
      if (around.length === 0) {
        // Several pinned members that no block joins are split; one pinned member at a table without a block of
        // the group's size leaves no room for the rest.
        problems.push({ kind: pinnedSeats.size > 1 ? "pinned-group-split" : "pinned-group-no-room", names });
        continue;
      }
      candidates = around.filter((block) => block.every((seat) => pinnedSeats.has(seat) || !fixed[seat]));
      if (candidates.length === 0) {
        problems.push({ kind: "pinned-group-no-room", names });
        continue;
      }
      if (movable.length === 0) {
        continue;
      }
    } else {
      candidates = tables.flatMap((_, tableIndex) =>
        blocksOf(tableIndex, size).filter((block) => block.every((seat) => !fixed[seat])),
      );
      if (candidates.length === 0) {
        problems.push({ kind: "group-too-large", names });
        continue;
      }
    }
    units.push({ names, members: movable, pinnedSeats, candidates, block: [] });
  }
  if (problems.length > 0) {
    return { status: "infeasible", problems };
  }

  const unitOfGuest = new Int32Array(guestCount).fill(-1);
  units.forEach((unit, unitIndex) => {
    for (const member of unit.members) {
      unitOfGuest[member] = unitIndex;
    }
  });

  // Placement: groups by randomized backtracking, then singles into the free seats.
  const occupant = initial.slice();
  const seatOf = new Int32Array(guestCount).fill(-1);
  for (const [guestIndex, seatIndex] of pinnedSeatOf) {
    seatOf[guestIndex] = seatIndex;
  }
  const unitOrder = () =>
    shuffle(units.map((_, index) => index)).sort((a, b) => {
      const unitA = units[a];
      const unitB = units[b];
      return (
        Number(unitB.pinnedSeats.size > 0) - Number(unitA.pinnedSeats.size > 0) ||
        unitB.members.length + unitB.pinnedSeats.size - (unitA.members.length + unitA.pinnedSeats.size)
      );
    });
  let order = unitOrder();
  const blockIsFree = (unit: Unit, block: readonly number[]) =>
    block.every((seat) => unit.pinnedSeats.has(seat) || occupant[seat] === EMPTY);
  const movableSeats = (unit: Unit, block: readonly number[]) => block.filter((seat) => !unit.pinnedSeats.has(seat));
  let nodes = 0;
  let nodeLimit = PLACEMENT_NODE_LIMIT;
  let aborted = false;
  const place = (position: number): boolean => {
    if (position === order.length) {
      return true;
    }
    if (++nodes > nodeLimit) {
      aborted = true;
      return false;
    }
    const unit = units[order[position] ?? 0];
    for (const block of shuffle([...unit.candidates])) {
      if (!blockIsFree(unit, block)) {
        continue;
      }
      const seats = movableSeats(unit, block);
      const members = shuffle([...unit.members]);
      seats.forEach((seat, index) => {
        occupant[seat] = members[index] ?? EMPTY;
      });
      const later = order.slice(position + 1).map((index) => units[index]);
      if (
        later.every((other) => other.candidates.some((candidate) => blockIsFree(other, candidate))) &&
        place(position + 1)
      ) {
        unit.block = block;
        return true;
      }
      for (const seat of seats) {
        occupant[seat] = EMPTY;
      }
      if (aborted) {
        return false;
      }
    }
    return false;
  };
  // A failed place() undoes its writes, so every attempt starts from the pinned seats only. Only a search that gave up
  // (aborted) is retried; one that tried everything proves the groups do not fit.
  // Read through a function: TypeScript does not see place() setting `aborted`.
  const gaveUp = () => aborted;
  // The restarts stop at half the draw's budget, so placement plus search stay near the budget on hopeless inputs.
  const placementStart = now();
  let placed = place(0);
  for (
    let restart = 0;
    !placed && gaveUp() && restart < PLACEMENT_RESTARTS && now() - placementStart < budget / 2;
    restart++
  ) {
    nodes = 0;
    nodeLimit = PLACEMENT_RESTART_NODES;
    aborted = false;
    order = unitOrder();
    placed = place(0);
  }
  if (!placed) {
    return { status: "infeasible", problems: [{ kind: "groups-do-not-fit" }] };
  }

  const singles: number[] = [];
  for (let guestIndex = 0; guestIndex < guestCount; guestIndex++) {
    if (!pinnedGuest[guestIndex] && unitOfGuest[guestIndex] === -1) {
      singles.push(guestIndex);
    }
  }
  const freeSeats: number[] = [];
  for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
    if (occupant[seatIndex] === EMPTY) {
      freeSeats.push(seatIndex);
    }
  }
  shuffle(freeSeats);
  shuffle(singles).forEach((guestIndex, index) => {
    occupant[freeSeats[index] ?? 0] = guestIndex;
  });
  for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
    const guestIndex = occupant[seatIndex] ?? EMPTY;
    if (guestIndex >= 0) {
      seatOf[guestIndex] = seatIndex;
    }
  }

  // Cost: repeated pairs over the neighbour edges, plus LONELY_WEIGHT per present guest without a present neighbour.
  // The weight exceeds the number of edges (every possible repeat), so one guest fewer alone always wins.
  const conflicts = (a: number, b: number) => (a >= 0 && b >= 0 ? (conflict[a * guestCount + b] ?? 0) : 0);
  let edgeCount = 0;
  for (const around of adjacency) {
    edgeCount += around.length;
  }
  const LONELY_WEIGHT = edgeCount / 2 + 1;
  // A present guest (pinned or not) none of whose neighbour seats holds a present guest (EMPTY and BLOCKED are not).
  const isLonely = (seat: number): boolean => {
    if ((occupant[seat] ?? EMPTY) < 0) {
      return false;
    }
    for (const other of adjacency[seat] ?? []) {
      if ((occupant[other] ?? EMPTY) >= 0) {
        return false;
      }
    }
    return true;
  };
  const mark = new Int32Array(seatCount);
  let stamp = 0;
  const lonelyMark = new Int32Array(seatCount);
  let lonelyStamp = 0;
  // Guests alone among the changed seats and their neighbours (the only seats whose loneliness a move can change);
  // the same seats before and after a move, so the difference is the move's effect.
  const lonelyAround = (changed: readonly number[]): number => {
    lonelyStamp++;
    let count = 0;
    const visit = (seat: number) => {
      if (lonelyMark[seat] !== lonelyStamp) {
        lonelyMark[seat] = lonelyStamp;
        if (isLonely(seat)) {
          count++;
        }
      }
    };
    for (const seat of changed) {
      visit(seat);
      for (const other of adjacency[seat] ?? []) {
        visit(other);
      }
    }
    return count;
  };
  const localCost = (changed: readonly number[]): number => {
    stamp++;
    for (const seat of changed) {
      mark[seat] = stamp;
    }
    let cost = 0;
    for (const seat of changed) {
      const guestIndex = occupant[seat] ?? EMPTY;
      if (guestIndex < 0) {
        continue;
      }
      for (const other of adjacency[seat] ?? []) {
        if (mark[other] === stamp && other < seat) {
          continue;
        }
        cost += conflicts(guestIndex, occupant[other] ?? EMPTY);
      }
    }
    return cost + LONELY_WEIGHT * lonelyAround(changed);
  };
  const totalRepeats = (): number => {
    let repeats = 0;
    for (let seat = 0; seat < seatCount; seat++) {
      for (const other of adjacency[seat] ?? []) {
        if (other > seat) {
          repeats += conflicts(occupant[seat] ?? EMPTY, occupant[other] ?? EMPTY);
        }
      }
    }
    return repeats;
  };
  const lonelySeats = (): number[] => {
    const seats: number[] = [];
    for (let seat = 0; seat < seatCount; seat++) {
      if (isLonely(seat)) {
        seats.push(seat);
      }
    }
    return seats;
  };
  const totalCost = (): number => totalRepeats() + LONELY_WEIGHT * lonelySeats().length;

  const isSingleSeat = (seat: number) => {
    const guestIndex = occupant[seat] ?? EMPTY;
    return !fixed[seat] && (guestIndex === EMPTY || (guestIndex >= 0 && unitOfGuest[guestIndex] === -1));
  };

  // A proposed move: the seats it changes and who sits there afterwards (a permutation of their current occupants),
  // plus the group's new block for a relocation.
  interface Move {
    changed: number[];
    next: number[];
    unit: Unit | null;
    block: number[];
  }
  const moveSingle = (): Move | null => {
    if (singles.length === 0) {
      return null;
    }
    // Prefer a guest who sits next to a repeated neighbour.
    let guestIndex = singles[randomInt(singles.length)] ?? 0;
    for (let tries = 0; tries < 6 && localCost([seatOf[guestIndex] ?? 0]) === 0; tries++) {
      guestIndex = singles[randomInt(singles.length)] ?? 0;
    }
    const from = seatOf[guestIndex] ?? 0;
    for (let tries = 0; tries < 12; tries++) {
      const to = randomInt(seatCount);
      if (to !== from && isSingleSeat(to)) {
        return { changed: [from, to], next: [occupant[to] ?? EMPTY, guestIndex], unit: null, block: [] };
      }
    }
    return null;
  };
  const relocateGroup = (): Move | null => {
    const unit = units[randomInt(units.length)];
    if (unit.candidates.length < 2) {
      return null;
    }
    const target = unit.candidates[randomInt(unit.candidates.length)] ?? unit.block;
    if (target === unit.block) {
      return null;
    }
    const current = new Set(unit.block);
    if (!target.every((seat) => current.has(seat) || isSingleSeat(seat))) {
      return null;
    }
    // Members take the new block's movable seats; whoever sat on the new seats outside the old block (singles or
    // nobody) takes the old seats the group leaves.
    const oldSeats = movableSeats(unit, unit.block);
    const newSeats = movableSeats(unit, target);
    const oldSet = new Set(oldSeats);
    const newSet = new Set(newSeats);
    const displaced = newSeats.filter((seat) => !oldSet.has(seat)).map((seat) => occupant[seat] ?? EMPTY);
    const vacated = oldSeats.filter((seat) => !newSet.has(seat));
    const members = shuffle([...unit.members]);
    return {
      changed: [...newSeats, ...vacated],
      next: [...newSeats.map((_, index) => members[index] ?? EMPTY), ...displaced],
      unit,
      block: target,
    };
  };
  const permuteGroup = (): Move | null => {
    const unit = units[randomInt(units.length)];
    if (unit.members.length < 2) {
      return null;
    }
    const changed = movableSeats(unit, unit.block);
    return { changed, next: shuffle(changed.map((seat) => occupant[seat] ?? EMPTY)), unit: null, block: [] };
  };
  const propose = (): Move | null => {
    const roll = random();
    if (units.length === 0 || roll < 0.7) {
      return moveSingle() ?? (units.length > 0 ? relocateGroup() : null);
    }
    return roll < 0.9 ? relocateGroup() : permuteGroup();
  };
  const write = (seats: readonly number[], guests: readonly number[]) => {
    seats.forEach((seat, index) => {
      const guestIndex = guests[index] ?? EMPTY;
      occupant[seat] = guestIndex;
      if (guestIndex >= 0) {
        seatOf[guestIndex] = seat;
      }
    });
  };

  let cost = totalCost();
  let best = cost;
  const bestOccupant = occupant.slice();
  let bestBlocks = units.map((unit) => unit.block);
  const restoreBest = () => {
    occupant.set(bestOccupant);
    seatOf.fill(-1);
    for (let seat = 0; seat < seatCount; seat++) {
      const guestIndex = occupant[seat] ?? EMPTY;
      if (guestIndex >= 0) {
        seatOf[guestIndex] = seat;
      }
    }
    units.forEach((unit, index) => {
      unit.block = bestBlocks[index] ?? unit.block;
    });
    cost = best;
  };

  const stallLimit = 2000 + 50 * guestCount;
  const start = now();
  let iterations = 0;
  let sinceBest = 0;
  let forced = 0;
  // No move can change anything (everyone pinned, groups without a second block): the start is the result.
  const canMove = singles.length > 0 || units.some((unit) => unit.candidates.length > 1 || unit.members.length > 1);
  while (canMove && best > 0 && iterations < maxIterations) {
    if ((iterations & 255) === 0 && now() - start >= budget) {
      break;
    }
    iterations++;
    const move = propose();
    if (!move) {
      continue;
    }
    const before = localCost(move.changed);
    const previous = move.changed.map((seat) => occupant[seat] ?? EMPTY);
    write(move.changed, move.next);
    const delta = localCost(move.changed) - before;
    if (forced > 0 || delta <= 0 || random() < Math.exp(-delta / TEMPERATURE)) {
      forced = Math.max(0, forced - 1);
      if (move.unit) {
        move.unit.block = move.block;
      }
      cost += delta;
      if (cost < best) {
        best = cost;
        bestOccupant.set(occupant);
        bestBlocks = units.map((unit) => unit.block);
        sinceBest = 0;
        continue;
      }
    } else {
      write(move.changed, previous);
    }
    if (++sinceBest > stallLimit) {
      restoreBest();
      sinceBest = 0;
      forced = KICK_MOVES;
    }
  }

  // The best arrangement, measured again from scratch: who is alone, how many repeats.
  restoreBest();
  const alone = lonelySeats();
  if (alone.length > 0) {
    const names = alone.map((seat) => present[occupant[seat] ?? 0]?.displayName ?? "?");
    return { status: "infeasible", problems: [{ kind: "lonely", names }] };
  }
  const seats: DraftSeat[] = [];
  for (let seat = 0; seat < seatCount; seat++) {
    const guestIndex = occupant[seat] ?? EMPTY;
    const guest = guestIndex >= 0 ? present[guestIndex] : undefined;
    if (guest && !pinnedGuest[guestIndex]) {
      seats.push({ guestId: guest.id, tableId: seatTableId[seat] ?? 0, seat: seatNumber[seat] ?? 0 });
    }
  }
  return { status: "drawn", seats, repeats: totalRepeats(), iterations };
}
