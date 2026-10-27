import type {
  GuessBoardDto,
  GuessGuestDto,
  GuessRankingDto,
  MissingGuessDto,
  PublishedSeatingDto,
  PublishedTableDto,
  RankingEntryDto,
} from "@/types";

// The organizer's offline memory (S-09, NFR-004): the latest published seating and the whole guess board, kept in
// this browser's localStorage under FIXED key names (no link key in them). Each value is an envelope with a version,
// the time of the last successful server read (`savedAt`) and an `owner` tag — a short hash of the organizer API base
// — so data saved under one organizer link (e.g. the rehearsal database) never shows under another. Storage is never
// trusted: every read is validated in depth and anything odd counts as "nothing saved".

export const OFFLINE_SEATING_STORAGE_KEY = "kolacja-podwyzkowa:odczyt:rozsadzenie";
export const OFFLINE_GUESSES_STORAGE_KEY = "kolacja-podwyzkowa:odczyt:strzaly";
export const OFFLINE_CACHE_VERSION = 1;

export interface OfflineEntry<T> {
  v: typeof OFFLINE_CACHE_VERSION;
  owner: string;
  // ISO time of the last successful read from the server (not of the last change).
  savedAt: string;
  data: T;
}

// data null: nothing was published yet when it was saved.
export type OfflineSeatingEntry = OfflineEntry<PublishedSeatingDto | null>;
export type OfflineGuessesEntry = OfflineEntry<GuessBoardDto>;

// FNV-1a (32 bit) over the UTF-16 code units, 8 lowercase hex chars. Not a secret and not reversible to the key: it
// only tells two organizer links apart.
export function offlineOwner(apiBase: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < apiBase.length; index++) {
    hash ^= apiBase.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function serializeOfflineEntry(entry: OfflineEntry<unknown> | null): string {
  return JSON.stringify(entry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCount(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isDateString(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function isArrayOf<T>(value: unknown, item: (element: unknown) => element is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

function isPublishedTable(value: unknown): value is PublishedTableDto {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.room) &&
    (value.shape === "round" || value.shape === "rectangular") &&
    isCount(value.seatCount, 1) &&
    isArrayOf(value.seats, (seat): seat is { seat: number; name: string } => {
      return isRecord(seat) && isCount(seat.seat, 1) && isString(seat.name);
    })
  );
}

export function isPublishedSeating(value: unknown): value is PublishedSeatingDto {
  return (
    isRecord(value) &&
    isCount(value.snapshotId, 1) &&
    isDateString(value.publishedAt) &&
    isArrayOf(value.tables, isPublishedTable)
  );
}

function isGuessGuest(value: unknown): value is GuessGuestDto {
  return (
    isRecord(value) &&
    isInteger(value.id) &&
    isString(value.displayName) &&
    typeof value.isAbsent === "boolean" &&
    (value.amountGrosze === null || isCount(value.amountGrosze)) &&
    (value.enteredBy === null || value.enteredBy === "guest" || value.enteredBy === "organizer")
  );
}

function isMissingGuess(value: unknown): value is MissingGuessDto {
  return isRecord(value) && isInteger(value.id) && isString(value.displayName) && typeof value.isAbsent === "boolean";
}

function isRankingEntry(value: unknown): value is RankingEntryDto {
  return (
    isRecord(value) &&
    isCount(value.place, 1) &&
    typeof value.tied === "boolean" &&
    isInteger(value.guestId) &&
    isString(value.displayName) &&
    typeof value.isAbsent === "boolean" &&
    isCount(value.amountGrosze) &&
    isInteger(value.differenceGrosze) &&
    isCount(value.distanceGrosze)
  );
}

function isRanking(value: unknown): value is GuessRankingDto {
  return isRecord(value) && isCount(value.correctAmountGrosze) && isArrayOf(value.entries, isRankingEntry);
}

// The whole guess board as the organizer API answers it (and as it is cached).
export function isGuessBoardData(value: unknown): value is GuessBoardDto {
  return (
    isRecord(value) &&
    typeof value.intakeOpen === "boolean" &&
    (value.correctAmountGrosze === null || isCount(value.correctAmountGrosze)) &&
    isArrayOf(value.guests, isGuessGuest) &&
    isArrayOf(value.missing, isMissingGuess) &&
    (value.ranking === null || isRanking(value.ranking))
  );
}

function parseEnvelope<T>(raw: string | null, isData: (data: unknown) => data is T): OfflineEntry<T> | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    value.v !== OFFLINE_CACHE_VERSION ||
    !isString(value.owner) ||
    value.owner === "" ||
    !isDateString(value.savedAt) ||
    !("data" in value) ||
    !isData(value.data)
  ) {
    return null;
  }
  return { v: OFFLINE_CACHE_VERSION, owner: value.owner, savedAt: value.savedAt, data: value.data };
}

export function parseOfflineSeating(raw: string | null): OfflineSeatingEntry | null {
  return parseEnvelope(raw, (data): data is PublishedSeatingDto | null => data === null || isPublishedSeating(data));
}

export function parseOfflineGuesses(raw: string | null): OfflineGuessesEntry | null {
  return parseEnvelope(raw, isGuessBoardData);
}

export function offlineEntry<T>(apiBase: string, data: T, savedAt: string): OfflineEntry<T> {
  return { v: OFFLINE_CACHE_VERSION, owner: offlineOwner(apiBase), savedAt, data };
}

// The entry itself (same object) when it belongs to `owner`, else null.
export function ownEntry<T>(entry: OfflineEntry<T> | null, owner: string): OfflineEntry<T> | null {
  return entry?.owner === owner ? entry : null;
}
