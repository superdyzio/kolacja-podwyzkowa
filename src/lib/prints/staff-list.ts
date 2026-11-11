import { DIET_TAGS, type DietTag } from "@/lib/diets/rules";
import { dietSeatLookup } from "@/lib/diets/board";
import type {
  DietBoardDto,
  DietCountDto,
  DietGuestDto,
  PublishedSeatingDto,
  StaffBlockDto,
  StaffListDto,
  StaffPageDto,
  StaffSeatDto,
  StaffTableDto,
} from "@/types";
import { boardShowsRooms } from "./board";

// The staff list per table (room-prints, S-24; FR-038), pure: every published table somebody sits at, its occupied
// seats in seat order with the name as published and the diet at that seat from S-23's diet board (present guests
// only: a guest marked absent since the publish keeps the name and shows no diet), the table's diet counts, then the
// present guests with a diet but no published seat. Health data: only this print reads the diets. Laid out on fixed
// A4 pages of STAFF_PAGE_UNITS rows (no page margins: see board.ts), a table that does not fit the rest of a page
// starts a new one, a table longer than a page is split and continued on the next ones.

export const STAFF_PAGE_UNITS = 36;
export const STAFF_SUMMARY_UNITS = 2;
export const STAFF_HEADER_UNITS = 2;
// Characters of the diet cell per printed line (a diet badge counts as STAFF_BADGE_CHARS) and of the name cell.
export const STAFF_DIET_CHARS = 50;
export const STAFF_BADGE_CHARS = 16;
export const STAFF_NAME_CHARS = 30;
export const STAFF_MAX_ROW_UNITS = 3;

export function staffRowUnits(name: string, diets: readonly DietTag[], note: string | null): number {
  const dietChars = diets.length * STAFF_BADGE_CHARS + (note ? Array.from(note).length + 2 : 0);
  const dietLines = Math.ceil(dietChars / STAFF_DIET_CHARS);
  const nameLines = Math.ceil(Array.from(name).length / STAFF_NAME_CHARS);
  return Math.min(STAFF_MAX_ROW_UNITS, Math.max(1, dietLines, nameLines));
}

function countsOf(holders: readonly { diets: readonly DietTag[] }[]): DietCountDto[] {
  return DIET_TAGS.map((tag) => ({ tag, count: holders.filter((holder) => holder.diets.includes(tag)).length })).filter(
    (entry) => entry.count > 0,
  );
}

export function staffList(published: PublishedSeatingDto | null, diets: DietBoardDto): StaffListDto {
  const dietAt = dietSeatLookup(diets);
  const rooms = boardShowsRooms(published);
  const tables: StaffTableDto[] = (published?.tables ?? [])
    .filter((table) => table.seats.length > 0)
    .map((table) => {
      const seats: StaffSeatDto[] = [...table.seats]
        .sort((a, b) => a.seat - b.seat)
        .map((seat) => {
          const diet = dietAt(table.name, seat.seat);
          const tags = diet ? [...diet.diets] : [];
          const note = diet?.note ?? null;
          return { seat: seat.seat, name: seat.name, diets: tags, note, units: staffRowUnits(seat.name, tags, note) };
        });
      return {
        name: table.name,
        room: rooms ? table.room : null,
        people: seats.length,
        counts: countsOf(seats),
        seats,
      };
    });
  return {
    tables,
    unplaced: diets.unplaced.map((guest) => ({ ...guest, diets: [...guest.diets] })),
    counts: diets.counts.map((entry) => ({ ...entry })),
    withDiets: diets.guests,
  };
}

function unplacedUnits(guest: DietGuestDto): number {
  return staffRowUnits(guest.guestName, guest.diets, guest.note);
}

// The list on pages: the summary first, then each table, then the unplaced guests.
export function staffListPages(list: StaffListDto): StaffPageDto[] {
  const pages: StaffPageDto[] = [];
  let blocks: StaffBlockDto[] = [];
  let used = 0;

  const newPage = () => {
    if (blocks.length > 0) {
      pages.push({ blocks });
    }
    blocks = [];
    used = 0;
  };

  // A block of `rows` under a header: whole on this page, else from the top of the next one (a table longer than a page
  // also starts on a fresh page, unless only the summary is on this one), split across pages when it is longer.
  function place<T>(
    rows: readonly T[],
    unitsOf: (row: T) => number,
    make: (rows: T[], continued: boolean) => StaffBlockDto,
  ) {
    const total = STAFF_HEADER_UNITS + rows.reduce((sum, row) => sum + unitsOf(row), 0);
    const onlySummary = blocks.every((block) => block.kind === "summary");
    if (used + total > STAFF_PAGE_UNITS && (total <= STAFF_PAGE_UNITS || !onlySummary)) {
      newPage();
    }
    let rest = [...rows];
    let continued = false;
    while (rest.length > 0) {
      let space = STAFF_PAGE_UNITS - used - STAFF_HEADER_UNITS;
      if (space < unitsOf(rest[0])) {
        newPage();
        space = STAFF_PAGE_UNITS - STAFF_HEADER_UNITS;
      }
      const taken: T[] = [];
      let takenUnits = 0;
      while (rest.length > 0 && (taken.length === 0 || takenUnits + unitsOf(rest[0]) <= space)) {
        const row = rest[0];
        takenUnits += unitsOf(row);
        taken.push(row);
        rest = rest.slice(1);
      }
      blocks.push(make(taken, continued));
      used += STAFF_HEADER_UNITS + takenUnits;
      continued = true;
      if (rest.length > 0) {
        newPage();
      }
    }
  }

  blocks.push({ kind: "summary", counts: list.counts, withDiets: list.withDiets });
  used = STAFF_SUMMARY_UNITS;
  for (const table of list.tables) {
    place(
      table.seats,
      (seat) => seat.units,
      (seats, continued) => ({ kind: "table", table: { ...table, seats }, continued }),
    );
  }
  if (list.unplaced.length > 0) {
    place(list.unplaced, unplacedUnits, (guests, continued) => ({ kind: "unplaced", guests, continued }));
  }
  newPage();
  return pages;
}
