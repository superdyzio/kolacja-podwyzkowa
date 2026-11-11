import { useCallback, useMemo, useState } from "react";
import {
  MAP_SEARCH_LIMIT,
  hitTables,
  searchMarks,
  searchSeats,
  seatHitKey,
  type SearchMark,
  type SearchableTable,
  type SeatHit,
} from "@/lib/map-search/search";

export interface MapSearch {
  query: string;
  setQuery: (query: string) => void;
  // Every hit, then the ones listed (and lit) at once and how many more there are.
  hits: SeatHit[];
  shown: SeatHit[];
  more: number;
  // The picked hit while it still exists, else the only hit, else null: the one lit alone (and scrolled to).
  active: SeatHit | null;
  pick: (hit: SeatHit) => void;
  clear: () => void;
  // Violet chairs for the drawing: the active hit, else every listed hit.
  marks: SearchMark[];
  // The tables of those marks (kept bright where a plan fades the others).
  foundTables: Set<string>;
}

// The search on a venue map (guest-map-search, S-22): the query and the picked hit live in the page only; the names
// come from the tables the map already draws (the published snapshot), so a refresh of those tables re-runs the
// search and drops a pick that is gone.
export function useMapSearch(tables: readonly SearchableTable[]): MapSearch {
  const [query, setQueryState] = useState("");
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  const hits = useMemo(() => searchSeats(tables, query), [tables, query]);
  const shown = useMemo(() => hits.slice(0, MAP_SEARCH_LIMIT), [hits]);
  const active = useMemo(() => {
    const picked = pickedKey === null ? undefined : hits.find((hit) => seatHitKey(hit) === pickedKey);
    return picked ?? (hits.length === 1 ? hits[0] : null);
  }, [hits, pickedKey]);
  const marks = useMemo(() => searchMarks(active ? [active] : shown), [active, shown]);
  const foundTables = useMemo(() => hitTables(active ? [active] : shown), [active, shown]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setPickedKey(null);
  }, []);
  const pick = useCallback((hit: SeatHit) => {
    setPickedKey(seatHitKey(hit));
  }, []);
  const clear = useCallback(() => {
    setQueryState("");
    setPickedKey(null);
  }, []);

  return {
    query,
    setQuery,
    hits,
    shown,
    more: hits.length - shown.length,
    active,
    pick,
    clear,
    marks,
    foundTables,
  };
}
