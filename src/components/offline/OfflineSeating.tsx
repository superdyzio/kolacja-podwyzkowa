import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { pluralPl } from "@/lib/guests/summary";
import type { OfflineSeatingEntry } from "@/lib/offline/cache";
import {
  findGuestSeats,
  formatPublishedLabel,
  formatSavedAt,
  normalizeSearch,
  seatingByRoom,
} from "@/lib/offline/readout";
import { seatLabel } from "@/lib/seating/rules";
import { cn } from "@/lib/utils";
import type { PublishedSeatingDto } from "@/types";

interface Props {
  headingId: string;
  entry: OfflineSeatingEntry | null;
  now: Date;
}

const SHAPE_LABELS = { round: "okrągły", rectangular: "prostokątny" } as const;

function SeatingSearch({ seating }: { seating: PublishedSeatingDto }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findGuestSeats(seating, query), [seating, query]);
  const searching = normalizeSearch(query) !== "";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={searchId} className="font-medium">
        Gdzie siedzi…?
      </label>
      <Input
        id={searchId}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Wpisz imię"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className="h-11 text-base md:text-base"
      />
      <div aria-live="polite">
        {searching &&
          (matches.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nie znaleziono.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {matches.map((match) => (
                <li key={`${match.table}\u0000${match.seat}`} className="rounded-lg border px-3 py-2">
                  <strong className="break-words">{match.name}</strong> — {seatLabel(match.table, match.seat)} ·{" "}
                  <span className="text-muted-foreground">{match.room}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

// The published seating as saved on this device (S-09): when it was saved and published, a name search, then every
// room, table and seat in order (empty seats „—”). The same arrangement the TV and the guests' phones show.
export function OfflineSeating({ headingId, entry, now }: Props) {
  const seating = entry?.data ?? null;
  const rooms = useMemo(() => (seating ? seatingByRoom(seating) : []), [seating]);

  return (
    <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Rozsadzenie (opublikowane)
      </h2>
      {entry === null ? (
        <p className="text-muted-foreground text-sm">Na tym urządzeniu nie ma zapisanego rozsadzenia.</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {formatSavedAt(entry.savedAt, now)}
          {seating && ` · ${formatPublishedLabel(seating.publishedAt, now)}`}
        </p>
      )}
      {entry !== null && seating === null && <p>Nic jeszcze nie opublikowano.</p>}
      {seating?.tables.length === 0 && <p>Opublikowany rozkład nie ma stolików.</p>}
      {seating && seating.tables.length > 0 && (
        <>
          <SeatingSearch seating={seating} />
          {rooms.map((room, index) => (
            <section key={`${index}\u0000${room.room}`} aria-label={room.room} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold break-words">{room.room}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {room.tables.map((table) => (
                  <div key={table.name} className="flex flex-col gap-2 rounded-xl border p-3">
                    <div>
                      <h4 className="font-semibold break-words">{table.name}</h4>
                      <p className="text-muted-foreground text-xs">
                        {SHAPE_LABELS[table.shape]}, {table.seatCount}{" "}
                        {pluralPl(table.seatCount, "miejsce", "miejsca", "miejsc")}
                      </p>
                    </div>
                    <ol className="flex flex-col gap-1 text-sm">
                      {table.seats.map((seat) => (
                        <li key={seat.seat} className="flex gap-2">
                          <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                            {seat.seat}.
                          </span>
                          <span className={cn("break-words", seat.name === null && "text-muted-foreground")}>
                            {seat.name ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
