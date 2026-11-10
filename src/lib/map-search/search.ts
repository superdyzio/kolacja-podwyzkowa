import { compareTableNames } from "@/lib/venue/rules";

// Finding a guest on the venue map (guest-map-search, S-22; FR-048): one matcher for every map that can search — the
// guest's phone, the order pages' plan (client, staff, the per-event waiter, the kitchen tablet) — and the organizer's
// offline readout (S-09). It searches only the tables the caller already holds (the published snapshot every one of
// those views draws), so it never needs new data. Pure: no React, no DB.

// A table as every drawing of the published seating carries it (TvTableDto, the guest's DrawingTableDto, the offline
// readout's PublishedSeatingDto tables): its name, its room's name and the names at its chairs.
export interface SearchableTable {
  name: string;
  room: string;
  seats: readonly { seat: number; name: string }[];
}

// One seated guest found: the name as published and where they sit.
export interface SeatHit {
  name: string;
  table: string;
  room: string;
  seat: number;
}

// A found seat as a mark of the venue drawing (the serving marks' shape plus the tone that draws it violet).
export interface SearchMark {
  table: string;
  seat: number;
  label: null;
  done: false;
  tone: "search";
}

// How many hits a map lists (and lights) at once; the rest is „and N more — type more letters”.
export const MAP_SEARCH_LIMIT = 8;

// Letters that keep their look after removing combining marks (NFD leaves them whole).
const FOLDED_LETTERS: Readonly<Record<string, string>> = {
  ł: "l",
  đ: "d",
  ø: "o",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

// Lower case without Polish letters' marks („Żółć” → „zolc”, „Łukasz” → „lukasz”), single spaces, trimmed.
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[łđøßæœ]/g, (letter) => FOLDED_LETTERS[letter] ?? letter)
    .replace(/\s+/g, " ")
    .trim();
}

const polishCollator = new Intl.Collator("pl");

// 0: every word of the query starts a word of the name („an” in „Anna Kowalska”); 1: found inside a word only
// („an” in „Joanna”). null: not every word of the query is in the name.
function matchRank(name: string, words: readonly string[]): 0 | 1 | null {
  if (!words.every((word) => name.includes(word))) {
    return null;
  }
  const nameWords = name.split(/[\s-]+/);
  return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word))) ? 0 : 1;
}

// Every seated guest whose name contains each word of the query (case and Polish marks ignored, words in any order),
// those whose words START with the query's first, then in Polish name order, then by table (natural order) and seat.
// An empty or blank query finds nobody. Returns every hit; a map lists the first MAP_SEARCH_LIMIT.
export function searchSeats(tables: readonly SearchableTable[], query: string): SeatHit[] {
  const needle = normalizeSearch(query);
  if (needle === "") {
    return [];
  }
  const words = needle.split(" ");
  const ranked: { hit: SeatHit; rank: number }[] = [];
  for (const table of tables) {
    for (const seat of table.seats) {
      const rank = matchRank(normalizeSearch(seat.name), words);
      if (rank !== null) {
        ranked.push({ hit: { name: seat.name, table: table.name, room: table.room, seat: seat.seat }, rank });
      }
    }
  }
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        polishCollator.compare(a.hit.name, b.hit.name) ||
        compareTableNames(a.hit.table, b.hit.table) ||
        a.hit.seat - b.hit.seat,
    )
    .map((entry) => entry.hit);
}

// A stable key of a hit (React keys, the picked hit): a seat of a table.
export function seatHitKey(hit: Pick<SeatHit, "table" | "seat">): string {
  return `${hit.table}\u0000${String(hit.seat)}`;
}

// The hits as marks of the venue drawing (one violet chair each).
export function searchMarks(hits: readonly SeatHit[]): SearchMark[] {
  return hits.map((hit) => ({ table: hit.table, seat: hit.seat, label: null, done: false, tone: "search" }));
}

// The tables the hits sit at (kept bright on a plan that fades the others).
export function hitTables(hits: readonly SeatHit[]): Set<string> {
  return new Set(hits.map((hit) => hit.table));
}
