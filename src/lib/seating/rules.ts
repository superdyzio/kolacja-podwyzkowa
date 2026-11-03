import type { Locale } from "@/lib/i18n/locale";
import { areConsecutiveSeats } from "@/lib/venue/seats";
import type { GuestListDto, PublicationDto, SeatAssignmentDto, VenueDto } from "@/types";
import { seatingMessages } from "./messages";

// Seating rules shared by the DB service, the API routes and the organizer UI (PRD FR-004, FR-007): messages
// (seatingMessages, both languages), seat labels, warnings and summaries. Pure functions only: no DB, no `astro:*`.
//
// Manual seating may split an inseparable group or keep an absent guest seated — the page warns about it instead of
// refusing (the hard group rule belongs to the S-04 draw). Absent guests never reach the TV: publishing leaves them
// out.

export function seatOutOfRangeMessage(seat: number, locale: Locale = "pl"): string {
  return seatingMessages(locale).seatOutOfRange(seat);
}

export function guestPinnedMessage(name: string, locale: Locale = "pl"): string {
  return seatingMessages(locale).guestPinned(name);
}

export function seatPinnedMessage(name: string, locale: Locale = "pl"): string {
  return seatingMessages(locale).seatPinned(name);
}

// „Okno, miejsce 2” / "Okno, seat 2"
export function seatLabel(tableName: string, seat: number, locale: Locale = "pl"): string {
  return seatingMessages(locale).seatLabel(tableName, seat);
}

// „Ania”, „Ania i Kuba”, „Ania, Kuba i Ola” / "Ania, Kuba and Ola"
export function formatNameList(names: readonly string[], locale: Locale = "pl"): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} ${seatingMessages(locale).and} ${names[names.length - 1] ?? ""}`;
}

const publishedAtFormats = new Map<Locale, Intl.DateTimeFormat>();

// „27.10, 19:42” / "27/10, 19:42" (Polish time, whatever the server's time zone).
export function formatPublishedAt(iso: string, locale: Locale = "pl"): string {
  let format = publishedAtFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(seatingMessages(locale).dateLocale, {
      timeZone: "Europe/Warsaw",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    publishedAtFormats.set(locale, format);
  }
  return format.format(new Date(iso));
}

// The organizer's working data the rules look at.
export interface SeatingInput {
  guestList: GuestListDto;
  venue: VenueDto;
  assignments: SeatAssignmentDto[];
}

export type GroupProblem = "different-tables" | "not-adjacent" | "partly-seated";

export interface GroupWarning {
  groupId: number;
  // Present members, in guest-list order.
  memberNames: string[];
  problem: GroupProblem;
}

export interface SeatingWarnings {
  groups: GroupWarning[];
  // Absent guests who still have a seat (they will not appear on the TV), in guest-list order.
  absentSeated: string[];
  // How many seats are missing for the present guests (0 when there are enough).
  missingSeats: number;
}

// Groups count only their present members: a group with fewer than 2 present members, or with none of them seated
// yet, gives no warning. "Next to each other" = consecutive seats (areConsecutiveSeats).
export function seatingWarnings({ guestList, venue, assignments }: SeatingInput): SeatingWarnings {
  const guestById = new Map(guestList.guests.map((guest) => [guest.id, guest]));
  const seatByGuest = new Map(assignments.map((assignment) => [assignment.guestId, assignment]));
  const tableById = new Map(venue.tables.map((table) => [table.id, table]));

  const groups: GroupWarning[] = [];
  for (const group of guestList.groups) {
    const present = group.memberIds.filter((id) => guestById.get(id)?.isAbsent === false);
    if (present.length < 2) {
      continue;
    }
    const seats = present.flatMap((id) => {
      const assignment = seatByGuest.get(id);
      return assignment ? [assignment] : [];
    });
    if (seats.length === 0) {
      continue;
    }
    const memberNames = present.map((id) => guestById.get(id)?.displayName ?? "?");
    const tableIds = new Set(seats.map((assignment) => assignment.tableId));
    let problem: GroupProblem | null = null;
    if (seats.length < present.length) {
      problem = "partly-seated";
    } else if (tableIds.size > 1) {
      problem = "different-tables";
    } else {
      const table = tableById.get(seats[0]?.tableId ?? -1);
      const seatNumbers = seats.map((assignment) => assignment.seat);
      if (
        table &&
        (seatNumbers.some((seat) => seat > table.seatCount) ||
          !areConsecutiveSeats(table.shape, table.seatCount, seatNumbers))
      ) {
        problem = "not-adjacent";
      }
    }
    if (problem) {
      groups.push({ groupId: group.id, memberNames, problem });
    }
  }

  const absentSeated = guestList.guests
    .filter((guest) => guest.isAbsent && seatByGuest.has(guest.id))
    .map((guest) => guest.displayName);
  const present = guestList.guests.filter((guest) => !guest.isAbsent).length;
  const seats = venue.tables.reduce((sum, table) => sum + table.seatCount, 0);

  return { groups, absentSeated, missingSeats: Math.max(0, present - seats) };
}

// One line per warning.
export function describeWarnings(warnings: SeatingWarnings, locale: Locale = "pl"): string[] {
  const messages = seatingMessages(locale);
  const lines = warnings.groups.map((warning) =>
    messages.groupWarning(formatNameList(warning.memberNames, locale), messages.groupProblems[warning.problem]),
  );
  if (warnings.absentSeated.length > 0) {
    lines.push(messages.absentSeated(warnings.absentSeated.join(", ")));
  }
  if (warnings.missingSeats > 0) {
    lines.push(messages.missingSeats(warnings.missingSeats));
  }
  return lines;
}

export interface SeatingSummary {
  present: number;
  seatedPresent: number;
  seats: number;
  pinned: number;
}

export function summarizeSeating({ guestList, venue, assignments }: SeatingInput): SeatingSummary {
  const seated = new Set(assignments.map((assignment) => assignment.guestId));
  const presentGuests = guestList.guests.filter((guest) => !guest.isAbsent);
  return {
    present: presentGuests.length,
    seatedPresent: presentGuests.filter((guest) => seated.has(guest.id)).length,
    seats: venue.tables.reduce((sum, table) => sum + table.seatCount, 0),
    pinned: assignments.filter((assignment) => assignment.pinned).length,
  };
}

// „32 z 38 obecnych ma miejsce”
export function formatSeatedCount(summary: SeatingSummary, locale: Locale = "pl"): string {
  return seatingMessages(locale).seatedCount(summary.seatedPresent, summary.present);
}

// „32 z 38 obecnych ma miejsce · opublikowano 27.10, 19:42” / „… · nieopublikowane zmiany” /
// „… · jeszcze nie opublikowano”
export function formatSeatingSummary(
  summary: SeatingSummary,
  published: PublicationDto | null,
  upToDate: boolean,
  locale: Locale = "pl",
): string {
  const messages = seatingMessages(locale);
  const status =
    published === null
      ? messages.notPublishedYet
      : upToDate
        ? messages.publishedAt(formatPublishedAt(published.publishedAt, locale))
        : messages.unpublishedChanges;
  return `${formatSeatedCount(summary, locale)} · ${status}`;
}
