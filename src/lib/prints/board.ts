import { compareTableNames } from "@/lib/venue/rules";
import type { BoardEntryDto, BoardPageDto, BoardRowDto, PublishedSeatingDto } from "@/types";

// „Znajdź swój stolik” (room-prints, S-24; FR-038), pure: every published seat as „name → table (room)”, in Polish
// alphabetical order with a letter heading before each letter, laid out on fixed sheets of BOARD_COLUMNS columns of
// BOARD_ROWS rows (the A3 poster is the same layout scaled up, so it paginates identically). The pages are decided
// here because a print page has no margins (`@page { margin: 0 }`: no browser header with the address) and normal
// flow would run edge to edge from the second page on.

export const BOARD_COLUMNS = 3;
export const BOARD_ROWS = 34;
// Characters of name + table (+ room) that fit one row of a column; a longer row wraps and takes two.
export const BOARD_ROW_CHARS = 30;

const nameCollator = new Intl.Collator("pl");
const POLISH_LETTERS = "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ";

// More than one room in the published seating: then the board names the room too.
export function boardShowsRooms(published: PublishedSeatingDto | null): boolean {
  return new Set(published?.tables.map((table) => table.room) ?? []).size > 1;
}

// Every published seat, by name (Polish order), then table name (numeric-aware), then seat.
export function boardEntries(published: PublishedSeatingDto | null): BoardEntryDto[] {
  if (!published) {
    return [];
  }
  const rooms = boardShowsRooms(published);
  return published.tables
    .flatMap((table) =>
      table.seats.map((seat) => ({
        entry: { name: seat.name, table: table.name, room: rooms ? table.room : null },
        seat: seat.seat,
      })),
    )
    .sort(
      (a, b) =>
        nameCollator.compare(a.entry.name, b.entry.name) ||
        compareTableNames(a.entry.table, b.entry.table) ||
        a.seat - b.seat,
    )
    .map(({ entry }) => entry);
}

// The heading letter of a name: a letter of the Polish alphabet as it is (Ł, Ś, …), another letter as its base letter
// („É” → „E”, so it stays with the E's the collator puts it among), anything else „#” (digits and marks sort first).
export function boardLetter(name: string): string {
  const first = (Array.from(name.trim())[0] ?? "").toLocaleUpperCase("pl");
  if (first !== "" && POLISH_LETTERS.includes(first)) {
    return first;
  }
  const base = first.normalize("NFD").replace(/\p{M}/gu, "");
  return /^[A-Z]$/.test(base) ? base : "#";
}

export function boardRowUnits(entry: BoardEntryDto): number {
  const length =
    Array.from(entry.name).length +
    Array.from(entry.table).length +
    (entry.room ? Array.from(entry.room).length + 3 : 0) +
    2;
  return length > BOARD_ROW_CHARS ? 2 : 1;
}

// The entries in columns and pages: a letter heading (1 row) before each new letter — never as the last row of a
// column (it moves on with its first name) — and again, marked as continued, at the top of a column that starts in
// the middle of a letter.
export function boardPages(entries: readonly BoardEntryDto[]): BoardPageDto[] {
  const pages: BoardPageDto[] = [];
  let columns: BoardRowDto[][] = [];
  let column: BoardRowDto[] = [];
  let used = 0;
  let previous: string | null = null;

  const closeColumn = () => {
    columns.push(column);
    column = [];
    used = 0;
    if (columns.length === BOARD_COLUMNS) {
      pages.push({ columns });
      columns = [];
    }
  };

  for (const entry of entries) {
    const letter = boardLetter(entry.name);
    const units = boardRowUnits(entry);
    const fresh = letter !== previous;
    if (used + units + (fresh ? 1 : 0) > BOARD_ROWS) {
      closeColumn();
    }
    if (fresh || used === 0) {
      column.push({ kind: "letter", letter, continued: !fresh });
      used += 1;
    }
    column.push({ kind: "guest", units, ...entry });
    used += units;
    previous = letter;
  }
  if (column.length > 0) {
    closeColumn();
  }
  if (columns.length > 0) {
    pages.push({ columns });
  }
  return pages;
}
