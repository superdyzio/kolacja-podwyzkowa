import type { Locale } from "@/lib/i18n/locale";
import { areConsecutiveSeats } from "@/lib/venue/seats";
import type { DraftSeatDto, SeatingSnapshot } from "@/types";
import { seatingMessages } from "./messages";
import { formatNameList, formatPublishedAt, seatLabel, type SeatingInput } from "./rules";

// Drafts (PRD US-02, FR-009, FR-010): the hard rules a drawn draft must obey, re-checked by the server against the
// current data before it replaces the working arrangement, and the rules for restoring a published snapshot into the
// working arrangement. Pure functions only.
//
// Hard rules of a draft (the solver in draw.ts produces drafts that pass them):
// - it seats exactly the present guests who are not pinned (absent guests get no seat; pinned rows stay as they are);
// - every seat exists at its table and is used once, never a seat held by a pinned row (absent pinned guests too);
// - every group with at least 2 present members sits at one table on consecutive seats (areConsecutiveSeats: an arc
//   of a round table, a run on one side of a rectangular table), counting pinned members at their pinned seats.
// A restore is NOT a draft: it may leave people without a seat or split a group formed later (the page warns).

export type DraftSeat = DraftSeatDto;

export type DraftProblem =
  | { kind: "unknown-guest"; guestId: number }
  | { kind: "absent-guest"; name: string }
  | { kind: "pinned-guest"; name: string }
  | { kind: "duplicate-guest"; name: string }
  | { kind: "missing-guest"; names: string[] }
  | { kind: "unknown-table"; tableId: number }
  | { kind: "seat-out-of-range"; tableName: string; seat: number }
  | { kind: "seat-taken"; tableName: string; seat: number }
  | { kind: "group-split"; names: string[] };

function seatKey(tableId: number, seat: number): string {
  return `${tableId}:${seat}`;
}

// The problems of a proposed draft against the current data; an empty array means the draft may be saved.
export function validateDraft(input: SeatingInput, seats: readonly DraftSeat[]): DraftProblem[] {
  const { guestList, venue, assignments } = input;
  const guestById = new Map(guestList.guests.map((guest) => [guest.id, guest]));
  const tableById = new Map(venue.tables.map((table) => [table.id, table]));
  const pinned = assignments.filter((assignment) => assignment.pinned);
  const pinnedGuests = new Set(pinned.map((assignment) => assignment.guestId));
  const pinnedSeats = new Set(pinned.map((assignment) => seatKey(assignment.tableId, assignment.seat)));

  const problems: DraftProblem[] = [];
  const seenGuests = new Set<number>();
  const usedSeats = new Set<string>();
  // Where each guest sits after the draft (valid draft rows + pinned rows), for the group rule.
  const placeOf = new Map<number, { tableId: number; seat: number }>(
    pinned.map((assignment) => [assignment.guestId, { tableId: assignment.tableId, seat: assignment.seat }]),
  );

  for (const entry of seats) {
    const guest = guestById.get(entry.guestId);
    if (!guest) {
      problems.push({ kind: "unknown-guest", guestId: entry.guestId });
      continue;
    }
    if (seenGuests.has(guest.id)) {
      problems.push({ kind: "duplicate-guest", name: guest.displayName });
      continue;
    }
    seenGuests.add(guest.id);
    if (guest.isAbsent) {
      problems.push({ kind: "absent-guest", name: guest.displayName });
      continue;
    }
    if (pinnedGuests.has(guest.id)) {
      problems.push({ kind: "pinned-guest", name: guest.displayName });
      continue;
    }
    const table = tableById.get(entry.tableId);
    if (!table) {
      problems.push({ kind: "unknown-table", tableId: entry.tableId });
      continue;
    }
    if (!Number.isInteger(entry.seat) || entry.seat < 1 || entry.seat > table.seatCount) {
      problems.push({ kind: "seat-out-of-range", tableName: table.name, seat: entry.seat });
      continue;
    }
    const key = seatKey(table.id, entry.seat);
    if (usedSeats.has(key) || pinnedSeats.has(key)) {
      problems.push({ kind: "seat-taken", tableName: table.name, seat: entry.seat });
      continue;
    }
    usedSeats.add(key);
    placeOf.set(guest.id, { tableId: table.id, seat: entry.seat });
  }

  const missing = guestList.guests.filter(
    (guest) => !guest.isAbsent && !pinnedGuests.has(guest.id) && !seenGuests.has(guest.id),
  );
  if (missing.length > 0) {
    problems.push({ kind: "missing-guest", names: missing.map((guest) => guest.displayName) });
  }

  for (const group of guestList.groups) {
    const present = group.memberIds.filter((id) => guestById.get(id)?.isAbsent === false);
    if (present.length < 2) {
      continue;
    }
    const places = present.map((id) => placeOf.get(id));
    if (places.some((place) => place === undefined)) {
      continue; // already reported (missing or invalid row)
    }
    const defined = places.filter((place) => place !== undefined);
    const tableIds = new Set(defined.map((place) => place.tableId));
    const table = tableById.get(defined[0]?.tableId ?? -1);
    if (
      tableIds.size > 1 ||
      !table ||
      !areConsecutiveSeats(
        table.shape,
        table.seatCount,
        defined.map((place) => place.seat),
      )
    ) {
      problems.push({ kind: "group-split", names: present.map((id) => guestById.get(id)?.displayName ?? "?") });
    }
  }

  return problems;
}

// One line per problem.
export function describeDraftProblem(problem: DraftProblem, locale: Locale = "pl"): string {
  const messages = seatingMessages(locale);
  switch (problem.kind) {
    case "unknown-guest":
      return messages.draftUnknownGuest;
    case "absent-guest":
      return messages.draftAbsentGuest(problem.name);
    case "pinned-guest":
      return messages.draftPinnedGuest(problem.name);
    case "duplicate-guest":
      return messages.draftDuplicateGuest(problem.name);
    case "missing-guest":
      return messages.draftMissingGuests(problem.names.join(", "));
    case "unknown-table":
      return messages.draftUnknownTable;
    case "seat-out-of-range":
      return messages.draftSeatOutOfRange(problem.tableName, problem.seat);
    case "seat-taken":
      return messages.draftSeatTaken(seatLabel(problem.tableName, problem.seat, locale));
    case "group-split":
      return messages.draftGroupSplit(formatNameList(problem.names, locale));
  }
}

export type RestoreReason = "table-deleted" | "seat-removed" | "seat-pinned" | "not-in-snapshot";

export interface RestoreResult {
  // The non-pinned rows of the restored working arrangement.
  seats: DraftSeat[];
  // Present, non-pinned guests left without a seat, in guest-list order.
  unseated: { guestId: number; name: string; reason: RestoreReason }[];
}

// Maps a published snapshot back onto today's data (S-03 contract): rows of guests or tables deleted since are
// skipped, seats above a table's current seat count are skipped, pinned rows stay as they are (a seat held by a
// pinned guest is skipped, a pinned guest keeps their current seat), and guests who are absent now get no seat.
export function restoreSeats(snapshot: SeatingSnapshot, input: SeatingInput): RestoreResult {
  const { guestList, venue, assignments } = input;
  const guestById = new Map(guestList.guests.map((guest) => [guest.id, guest]));
  const tableById = new Map(venue.tables.map((table) => [table.id, table]));
  const liveTableBySnapshotTable = new Map(snapshot.tables.map((table) => [table.snapshotTableId, table.tableId]));
  const pinned = assignments.filter((assignment) => assignment.pinned);
  const pinnedGuests = new Set(pinned.map((assignment) => assignment.guestId));
  const pinnedSeats = new Set(pinned.map((assignment) => seatKey(assignment.tableId, assignment.seat)));

  const seats: DraftSeat[] = [];
  const seated = new Set<number>();
  const reasons = new Map<number, RestoreReason>();
  for (const row of snapshot.seats) {
    const guest = row.guestId === null ? undefined : guestById.get(row.guestId);
    if (!guest || guest.isAbsent || pinnedGuests.has(guest.id) || seated.has(guest.id)) {
      continue;
    }
    const tableId = liveTableBySnapshotTable.get(row.snapshotTableId) ?? null;
    const table = tableId === null ? undefined : tableById.get(tableId);
    if (!table) {
      reasons.set(guest.id, "table-deleted");
    } else if (row.seat > table.seatCount) {
      reasons.set(guest.id, "seat-removed");
    } else if (pinnedSeats.has(seatKey(table.id, row.seat))) {
      reasons.set(guest.id, "seat-pinned");
    } else {
      seats.push({ guestId: guest.id, tableId: table.id, seat: row.seat });
      seated.add(guest.id);
    }
  }

  const unseated = guestList.guests
    .filter((guest) => !guest.isAbsent && !pinnedGuests.has(guest.id) && !seated.has(guest.id))
    .map((guest) => ({
      guestId: guest.id,
      name: guest.displayName,
      reason: reasons.get(guest.id) ?? "not-in-snapshot",
    }));
  return { seats, unseated };
}

const LISTED_UNSEATED = 12;

// „Przywrócono rozkład z 27.10, 19:42 — sprawdź i opublikuj. Bez miejsca: Ania (stolik usunięty).”
export function describeRestore(
  publishedAt: string,
  unseated: RestoreResult["unseated"],
  locale: Locale = "pl",
): string {
  const messages = seatingMessages(locale);
  const head = messages.restored(formatPublishedAt(publishedAt, locale));
  if (unseated.length === 0) {
    return head;
  }
  const listed = unseated
    .slice(0, LISTED_UNSEATED)
    .map((guest) => `${guest.name} (${messages.restoreReasons[guest.reason]})`);
  const rest = unseated.length - listed.length;
  const more = rest > 0 ? messages.andOthers(rest) : "";
  return `${head} ${messages.withoutSeat(`${listed.join(", ")}${more}`)}`;
}
