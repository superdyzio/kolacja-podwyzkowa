import { rankGuesses } from "@/lib/guesses/ranking";
import type { Locale } from "@/lib/i18n/locale";
import { compareTableNames } from "@/lib/venue/rules";
import type { GuessBoardDto, GuessRankingDto, PublishedSeatingDto, TableShape } from "@/types";
import { offlineMessages } from "./messages";

// What the organizer's offline readout shows (S-09), computed without React: the published seating by room and table
// with every seat, a name search („where do I sit?”), the ranking (or one computed on this device from a locally typed
// correct amount) and the „Stan z …” labels. Times are the device's local time, hand-formatted (no Intl), so tests
// need no time zone. The texts are in messages.ts (both languages, i18n).

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
            predictedPlace: guest.predictedPlace,
          },
        ],
  );
  return { correctAmountGrosze: localCorrectGrosze, entries: rankGuesses(guesses, localCorrectGrosze) };
}

function clock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// „6 listopada” / "6 November".
function dayLabel(date: Date, locale: Locale): string {
  return `${date.getDate()} ${offlineMessages(locale).months[date.getMonth()] ?? ""}`;
}

// „Stan z 21:34” today; „Stan z 6 listopada, 21:34” on another day (rehearsal data never passes as current).
export function formatSavedAt(iso: string, now: Date, locale: Locale = "pl"): string {
  const t = offlineMessages(locale);
  const date = new Date(iso);
  return sameDay(date, now) ? t.savedToday(clock(date)) : t.savedOn(dayLabel(date, locale), clock(date));
}

// „Opublikowano o 21:05” today; „Opublikowano 6 listopada o 21:05” on another day.
export function formatPublishedLabel(iso: string, now: Date, locale: Locale = "pl"): string {
  const t = offlineMessages(locale);
  const date = new Date(iso);
  return sameDay(date, now) ? t.publishedToday(clock(date)) : t.publishedOn(dayLabel(date, locale), clock(date));
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
