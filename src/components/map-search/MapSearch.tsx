import { useId, useRef, type KeyboardEvent } from "react";
import type { MapSearch as MapSearchState } from "@/components/hooks/useMapSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { mapSearchMessages } from "@/lib/map-search/messages";
import { seatHitKey, type SeatHit } from "@/lib/map-search/search";
import { cn } from "@/lib/utils";

interface Props {
  search: MapSearchState;
  locale: Locale;
  // Shown under the field (the organizer's and the staff's plan: which arrangement is searched).
  note?: string;
  // A hit chosen by click or Enter (the guest's phone opens and scrolls its map).
  onPick?: (hit: SeatHit) => void;
  className?: string;
}

// The field of the guest search on a venue map (guest-map-search, S-22; FR-048): a labelled search input, a polite
// live summary (how many found, nobody, or who is marked), the hits as buttons (name — table, seat · room; at most
// MAP_SEARCH_LIMIT, then „and N more”). Enter picks the first hit; Escape anywhere inside clears and returns to the
// field (and goes no further, so a picked dish of the serving plan stays). Rendered on the server too (`data-map-search`).
export function MapSearch({ search, locale, note, onPick, className }: Props) {
  const t = mapSearchMessages(locale);
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, shown, hits, more, active } = search;
  const searching = query.trim() !== "";

  function choose(hit: SeatHit) {
    search.pick(hit);
    onPick?.(hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      event.stopPropagation();
      search.clear();
      inputRef.current?.focus();
    }
  }

  const summary = !searching
    ? ""
    : hits.length === 0
      ? t.notFound(query.trim())
      : active
        ? t.shown(active.name, active.table, active.seat, active.room)
        : t.found(hits.length);

  return (
    <div data-map-search="" className={cn("flex flex-col gap-2", className)} onKeyDown={onKeyDown}>
      <label htmlFor={inputId} className="font-medium">
        {t.label}
      </label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          placeholder={t.placeholder}
          value={query}
          aria-describedby={hintId}
          onChange={(event) => {
            search.setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && shown.length > 0) {
              event.preventDefault();
              choose(shown[0]);
            }
          }}
          className="h-11 text-base md:text-base"
        />
        {query !== "" && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-label={t.clearLabel}
            onClick={() => {
              search.clear();
              inputRef.current?.focus();
            }}
          >
            {t.clear}
          </Button>
        )}
      </div>
      <p id={hintId} className={cn("text-muted-foreground text-sm", !note && "sr-only")}>
        {note ? `${note} ` : ""}
        <span className="sr-only">{t.keyboardHint}</span>
      </p>
      <p aria-live="polite" className={cn("text-sm", summary === "" && "sr-only")}>
        {summary}
      </p>
      {searching && shown.length > 0 && (
        <ul aria-label={t.resultsLabel} className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {shown.map((hit) => {
            const pressed = active !== null && seatHitKey(active) === seatHitKey(hit);
            return (
              <li key={seatHitKey(hit)}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  aria-label={t.showOnPlan(hit.name, hit.table, hit.seat)}
                  onClick={() => {
                    choose(hit);
                  }}
                  className={cn(
                    "flex min-h-10 w-full flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2 text-left",
                    "hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                    pressed && "border-violet-600 bg-violet-500/10 ring-2 ring-violet-600 hover:bg-violet-500/15",
                  )}
                >
                  <strong className="break-words">{hit.name}</strong>
                  <span className="text-muted-foreground text-sm">{t.place(hit.table, hit.seat, hit.room)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {searching && more > 0 && <p className="text-muted-foreground text-sm">{t.more(more)}</p>}
    </div>
  );
}
