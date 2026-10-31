import { rankGuesses } from "@/lib/guesses/ranking";
import { compareTableNames } from "@/lib/venue/rules";
import type { GuessBoardDto, GuessRankingDto, PublishedSeatingDto, TableShape } from "@/types";

// What the organizer's offline readout shows (S-09), computed without React: the published seating by room and table
// with every seat, a name search („where do I sit?”), the ranking (or one computed on this device from a locally typed
// correct amount) and the „Stan z …” labels. Times are the device's local time, hand-formatted (no Intl), so tests
// need no time zone.

export const OFFLINE_NOTICE =
  "Brak połączenia z serwerem. Możesz przełączyć się na hotspot w telefonie — strona połączy się sama.";
export const OFFLINE_READOUT_BANNER =
  "Brak połączenia — pokazuję ostatni zapisany stan. Możesz przełączyć się na hotspot w telefonie.";
export const LOCAL_AMOUNT_NOTE =
  "Kwota tylko na tym urządzeniu — nie zapisuje się na serwerze. Po powrocie sieci wpisz ją w „Strzały i ranking”.";
export const NO_OFFLINE_STATE =
  "Na tym urządzeniu nie ma jeszcze zapisanego stanu. Otwórz panel organizatora przy działającej sieci — stan zapisze się sam.";

export interface ReadoutSeat {
  seat: number;
  // null: nobody sat there in the published arrangement.
  name: string | null;
}

export interface ReadoutTable {
  name: string;
  shape: TableShape;
  seatCount: number;
  seats: ReadoutSeat[];
}

export interface ReadoutRoom {
  room: string;
  tables: ReadoutTable[];
}

// Rooms in the DTO's order (it is sorted by room, then table), each table with every seat 1..seatCount.
export function seatingByRoom(seating: PublishedSeatingDto): ReadoutRoom[] {
  const rooms: ReadoutRoom[] = [];
  for (const table of seating.tables) {
    const nameBySeat = new Map(table.seats.map((seat) => [seat.seat, seat.name]));
    const readoutTable: ReadoutTable = {
      name: table.name,
      shape: table.shape,
      seatCount: table.seatCount,
      seats: Array.from({ length: table.seatCount }, (_, index) => ({
        seat: index + 1,
        name: nameBySeat.get(index + 1) ?? null,
      })),
    };
    const current = rooms.at(-1);
    if (current?.room === table.room) {
      current.tables.push(readoutTable);
    } else {
      rooms.push({ room: table.room, tables: [readoutTable] });
    }
  }
  return rooms;
}

// Lower case without Polish letters' marks („Żółć” → „zolc”, „Łukasz” → „lukasz”), single spaces, trimmed.
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ł/g, "l").replace(/\s+/g, " ").trim();
}

export interface GuestSeatMatch {
  name: string;
  table: string;
  room: string;
  seat: number;
}

const polishCollator = new Intl.Collator("pl");

// Every seated guest whose name contains the query (case and Polish marks ignored); an empty query finds nobody.
export function findGuestSeats(seating: PublishedSeatingDto, query: string): GuestSeatMatch[] {
  const needle = normalizeSearch(query);
  if (needle === "") {
    return [];
  }
  return seating.tables
    .flatMap((table) =>
      table.seats
        .filter((seat) => normalizeSearch(seat.name).includes(needle))
        .map((seat) => ({ name: seat.name, table: table.name, room: table.room, seat: seat.seat })),
    )
    .sort((a, b) => polishCollator.compare(a.name, b.name) || compareTableNames(a.table, b.table) || a.seat - b.seat);
}

// The ranking to show: with an amount typed on this device, computed here from the saved guesses (never sent);
// otherwise the one saved from the server (null when no correct amount was entered before the outage).
export function offlineRanking(board: GuessBoardDto, localCorrectGrosze: number | null): GuessRankingDto | null {
  if (localCorrectGrosze === null) {
    return board.ranking;
  }
  const guesses = board.guests.flatMap((guest) =>
    guest.amountGrosze === null
      ? []
      : [
          {
            guestId: guest.id,
            displayName: guest.displayName,
            isAbsent: guest.isAbsent,
            amountGrosze: guest.amountGrosze,
          },
        ],
  );
  return { correctAmountGrosze: localCorrectGrosze, entries: rankGuesses(guesses, localCorrectGrosze) };
}

const MONTHS_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

function clock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date): string {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()] ?? ""}`;
}

// „Stan z 21:34” today; „Stan z 6 listopada, 21:34” on another day (rehearsal data never passes as current).
export function formatSavedAt(iso: string, now: Date): string {
  const date = new Date(iso);
  return sameDay(date, now) ? `Stan z ${clock(date)}` : `Stan z ${dayLabel(date)}, ${clock(date)}`;
}

// „Opublikowano o 21:05” today; „Opublikowano 6 listopada o 21:05” on another day.
export function formatPublishedLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  return sameDay(date, now) ? `Opublikowano o ${clock(date)}` : `Opublikowano ${dayLabel(date)} o ${clock(date)}`;
}

// The later of two ISO times (either may be missing).
export function latestSavedAt(a: string | null, b: string | null): string | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
