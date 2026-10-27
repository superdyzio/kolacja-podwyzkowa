import { pluralPl } from "@/lib/guests/summary";
import { areConsecutiveSeats } from "@/lib/venue/seats";
import type { GuestListDto, PublicationDto, SeatAssignmentDto, VenueDto } from "@/types";

// Seating rules shared by the DB service, the API routes and the organizer UI (PRD FR-004, FR-007): Polish
// messages, seat labels, warnings and summaries. Pure functions only: no DB, no `astro:*`.
//
// Manual seating may split an inseparable group or keep an absent guest seated — the page warns about it instead of
// refusing (the hard group rule belongs to the S-04 draw). Absent guests never reach the TV: publishing leaves them
// out.

export const GUEST_NOT_FOUND_MESSAGE = "Nie znaleziono gościa.";
export const NOT_SEATED_MESSAGE = "Najpierw posadź tę osobę, potem przypnij miejsce.";
export const PUBLISHED_MESSAGE = "Opublikowano — TV pokaże rozkład w ciągu kilku sekund.";
export const PUBLISH_UNCHANGED_MESSAGE = "Nic się nie zmieniło od ostatniej publikacji.";

export function seatOutOfRangeMessage(seat: number): string {
  return `Ten stolik nie ma miejsca nr ${seat}.`;
}

export function guestPinnedMessage(name: string): string {
  return `„${name}” ma przypięte miejsce — najpierw je odepnij.`;
}

export function seatPinnedMessage(name: string): string {
  return `To miejsce zajmuje przypięta osoba „${name}” — najpierw ją odepnij.`;
}

// „Okno, miejsce 2”
export function seatLabel(tableName: string, seat: number): string {
  return `${tableName}, miejsce ${seat}`;
}

// „Ania”, „Ania i Kuba”, „Ania, Kuba i Ola”
export function formatNameList(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} i ${names[names.length - 1] ?? ""}`;
}

const publishedAtFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// „27.10, 19:42” (Polish time, whatever the server's time zone).
export function formatPublishedAt(iso: string): string {
  return publishedAtFormat.format(new Date(iso));
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

const GROUP_PROBLEM_TEXT: Record<GroupProblem, string> = {
  "different-tables": "siedzą przy różnych stolikach",
  "not-adjacent": "siedzą przy jednym stoliku, ale nie obok siebie",
  "partly-seated": "nie wszyscy mają miejsce",
};

// One Polish line per warning.
export function describeWarnings(warnings: SeatingWarnings): string[] {
  const lines = warnings.groups.map(
    (warning) => `${formatNameList(warning.memberNames)} — ${GROUP_PROBLEM_TEXT[warning.problem]}.`,
  );
  if (warnings.absentSeated.length > 0) {
    lines.push(`Nieobecni z miejscem (nie pojawią się na TV): ${warnings.absentSeated.join(", ")}.`);
  }
  if (warnings.missingSeats > 0) {
    lines.push(
      `Brakuje ${warnings.missingSeats} ${pluralPl(warnings.missingSeats, "miejsca", "miejsc", "miejsc")} dla obecnych gości.`,
    );
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
export function formatSeatedCount(summary: SeatingSummary): string {
  return `${summary.seatedPresent} z ${summary.present} obecnych ma miejsce`;
}

// „32 z 38 obecnych ma miejsce · opublikowano 27.10, 19:42” / „… · nieopublikowane zmiany” /
// „… · jeszcze nie opublikowano”
export function formatSeatingSummary(
  summary: SeatingSummary,
  published: PublicationDto | null,
  upToDate: boolean,
): string {
  const status =
    published === null
      ? "jeszcze nie opublikowano"
      : upToDate
        ? `opublikowano ${formatPublishedAt(published.publishedAt)}`
        : "nieopublikowane zmiany";
  return `${formatSeatedCount(summary)} · ${status}`;
}
