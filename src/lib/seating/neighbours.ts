import { pluralPl } from "@/lib/guests/summary";
import { neighbours } from "@/lib/venue/seats";
import type { SeatingSnapshot, TableShape } from "@/types";
import type { SeatingInput } from "./rules";

// Neighbour pairs (PRD Business Logic, FR-009): which guests sat next to each other in the published arrangements
// (the history the draw avoids) and which pairs of the working arrangement repeat that history. Pure functions only;
// shared by the solver, the server and the organizer page.
//
// "Neighbour" is `neighbours()` from src/lib/venue/seats.ts (round: left/right with wrap-around; rectangular:
// left/right on the same side plus the person opposite). A snapshot's pairs come from the table shape and seat count
// saved in that snapshot, so later venue edits never rewrite the history. Pairs of members of one (current) group are
// never "repeated neighbours".

// An unordered pair of guest ids, always [smaller, larger].
export type GuestPair = readonly [number, number];

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function orderedPair(a: number, b: number): GuestPair {
  return a < b ? [a, b] : [b, a];
}

function comparePairs(a: GuestPair, b: GuestPair): number {
  return a[0] - b[0] || a[1] - b[1];
}

// A table and who sat where (guestId null = a guest deleted since; skipped).
export interface PairTable {
  key: number;
  shape: TableShape;
  seatCount: number;
}

export interface PairSeat {
  tableKey: number;
  seat: number;
  guestId: number | null;
}

// Every pair of guests sitting next to each other in one arrangement (or several: pairs never cross tables, so the
// tables and seats of many snapshots can be passed at once). Sorted, without duplicates.
export function neighbourPairs(tables: readonly PairTable[], seats: readonly PairSeat[]): GuestPair[] {
  const occupants = new Map<number, Map<number, number>>();
  for (const seat of seats) {
    if (seat.guestId === null) {
      continue;
    }
    let bySeat = occupants.get(seat.tableKey);
    if (!bySeat) {
      bySeat = new Map();
      occupants.set(seat.tableKey, bySeat);
    }
    bySeat.set(seat.seat, seat.guestId);
  }

  const pairs = new Map<string, GuestPair>();
  for (const table of tables) {
    const bySeat = occupants.get(table.key);
    if (!bySeat) {
      continue;
    }
    for (const [seat, guestId] of bySeat) {
      if (seat < 1 || seat > table.seatCount) {
        continue;
      }
      for (const other of neighbours(table.shape, table.seatCount, seat)) {
        const otherGuest = bySeat.get(other);
        if (other > seat && otherGuest !== undefined && otherGuest !== guestId) {
          pairs.set(pairKey(guestId, otherGuest), orderedPair(guestId, otherGuest));
        }
      }
    }
  }
  return [...pairs.values()].sort(comparePairs);
}

// The neighbour history: the union of the pairs of every published snapshot, each from its own table geometry.
export function historyPairs(snapshots: readonly SeatingSnapshot[]): GuestPair[] {
  const pairs = new Map<string, GuestPair>();
  for (const snapshot of snapshots) {
    const tables = snapshot.tables.map((table) => ({
      key: table.snapshotTableId,
      shape: table.shape,
      seatCount: table.seatCount,
    }));
    const seats = snapshot.seats.map((seat) => ({
      tableKey: seat.snapshotTableId,
      seat: seat.seat,
      guestId: seat.guestId,
    }));
    for (const pair of neighbourPairs(tables, seats)) {
      pairs.set(pairKey(pair[0], pair[1]), pair);
    }
  }
  return [...pairs.values()].sort(comparePairs);
}

// A neighbour pair of the working arrangement that already sat together in a published arrangement.
export interface RepeatedPair {
  guestIds: GuestPair;
  // In seat order at the table.
  names: [string, string];
  tableId: number;
  tableName: string;
}

// The repeated neighbour pairs of the working arrangement: seated PRESENT guests only (an absent guest is not at the
// table), pairs within one group left out. Ordered by table (venue order), then by seat.
export function repeatedNeighbours(input: SeatingInput, history: readonly GuestPair[]): RepeatedPair[] {
  const known = new Set(history.map(([a, b]) => pairKey(a, b)));
  if (known.size === 0) {
    return [];
  }
  const guestById = new Map(input.guestList.guests.map((guest) => [guest.id, guest]));
  const occupants = new Map<number, Map<number, number>>();
  for (const assignment of input.assignments) {
    if (guestById.get(assignment.guestId)?.isAbsent !== false) {
      continue;
    }
    let bySeat = occupants.get(assignment.tableId);
    if (!bySeat) {
      bySeat = new Map();
      occupants.set(assignment.tableId, bySeat);
    }
    bySeat.set(assignment.seat, assignment.guestId);
  }

  const repeated: RepeatedPair[] = [];
  for (const table of input.venue.tables) {
    const bySeat = occupants.get(table.id);
    if (!bySeat) {
      continue;
    }
    for (let seat = 1; seat <= table.seatCount; seat++) {
      const guestId = bySeat.get(seat);
      if (guestId === undefined) {
        continue;
      }
      for (const other of neighbours(table.shape, table.seatCount, seat)) {
        const otherId = bySeat.get(other);
        if (other <= seat || otherId === undefined || !known.has(pairKey(guestId, otherId))) {
          continue;
        }
        const guest = guestById.get(guestId);
        const otherGuest = guestById.get(otherId);
        if (!guest || !otherGuest || (guest.groupId !== null && guest.groupId === otherGuest.groupId)) {
          continue;
        }
        repeated.push({
          guestIds: orderedPair(guestId, otherId),
          names: [guest.displayName, otherGuest.displayName],
          tableId: table.id,
          tableName: table.name,
        });
      }
    }
  }
  return repeated;
}

// „0 powtórzonych par sąsiadów”, „1 powtórzona para sąsiadów”, „2 powtórzone pary sąsiadów”
export function formatRepeatCount(count: number): string {
  return `${count} ${pluralPl(count, "powtórzona para sąsiadów", "powtórzone pary sąsiadów", "powtórzonych par sąsiadów")}`;
}

// „Ania i Kuba (Okno)”
export function describeRepeat(pair: RepeatedPair): string {
  return `${pair.names[0]} i ${pair.names[1]} (${pair.tableName})`;
}
