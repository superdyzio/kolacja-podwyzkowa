import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/i18n";
import { offlineMessages } from "@/lib/offline/messages";
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
  locale: Locale;
}

function SeatingSearch({ seating, locale }: { seating: PublishedSeatingDto; locale: Locale }) {
  const t = offlineMessages(locale);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findGuestSeats(seating, query), [seating, query]);
  const searching = normalizeSearch(query) !== "";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={searchId} className="font-medium">
        {t.whereSits}
      </label>
      <Input
        id={searchId}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={t.searchPlaceholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className="h-11 text-base md:text-base"
      />
      <div aria-live="polite">
        {searching &&
          (matches.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.notFound}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {matches.map((match) => (
                <li key={`${match.table}\u0000${match.seat}`} className="rounded-lg border px-3 py-2">
                  <strong className="break-words">{match.name}</strong> — {seatLabel(match.table, match.seat, locale)} ·{" "}
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
export function OfflineSeating({ headingId, entry, now, locale }: Props) {
  const t = offlineMessages(locale);
  const seating = entry?.data ?? null;
  const rooms = useMemo(() => (seating ? seatingByRoom(seating) : []), [seating]);

  return (
    <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {t.seatingHeading}
      </h2>
      {entry === null ? (
        <p className="text-muted-foreground text-sm">{t.noSavedSeating}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {formatSavedAt(entry.savedAt, now, locale)}
          {seating && ` · ${formatPublishedLabel(seating.publishedAt, now, locale)}`}
        </p>
      )}
      {entry !== null && seating === null && <p>{t.nothingPublished}</p>}
      {seating?.tables.length === 0 && <p>{t.noTables}</p>}
      {seating && seating.tables.length > 0 && (
        <>
          <SeatingSearch seating={seating} locale={locale} />
          {rooms.map((room, index) => (
            <section key={`${index}\u0000${room.room}`} aria-label={room.room} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold break-words">{room.room}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {room.tables.map((table) => (
                  <div key={table.name} className="flex flex-col gap-2 rounded-xl border p-3">
                    <div>
                      <h4 className="font-semibold break-words">{table.name}</h4>
                      <p className="text-muted-foreground text-xs">
                        {t.shapes[table.shape]}, {t.seats(table.seatCount)}
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
