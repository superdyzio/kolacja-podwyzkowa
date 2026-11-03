import { useMemo, useState } from "react";
import { useRestaurantView } from "@/components/hooks/useRestaurantView";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import type { Locale } from "@/lib/i18n";
import { restaurantMessages } from "@/lib/orders/messages";
import { describeToServe } from "@/lib/orders/summary";
import { cn } from "@/lib/utils";
import { planImagePath } from "@/lib/venue/pin";
import type { RestaurantItemDto, RestaurantViewDto } from "@/types";

interface Props {
  // Restaurant API base, e.g. "/api/r/<key>".
  apiBase: string;
  initial: RestaurantViewDto;
  eventName: string;
  locale: Locale;
}

// Without a plan image (or until it has loaded) the drawing stands on a 16:9 stage (as on the TV).
const BLANK_ASPECT = 16 / 9;

function ItemList({ items, deliveredLabel }: { items: readonly RestaurantItemDto[]; deliveredLabel: string }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => (
        <li
          // Lines have no ids here; their order is stable (by id on the server).

          key={index}
          className={cn("flex flex-wrap items-baseline gap-x-2", item.delivered && "text-muted-foreground")}
        >
          <span className={cn("font-medium", item.delivered && "line-through")}>
            {item.name} × {item.quantity}
          </span>
          {item.note && <span className="text-amber-700 dark:text-amber-400">{item.note}</span>}
          {item.delivered && (
            <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {deliveredLabel}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// The restaurant's read-only page (restaurant-orders): what to prepare (dish × quantity, notes, what is still to
// serve) and where to serve it — the venue drawn from the PUBLISHED seating with the names at the chairs, then every
// table with its seats' dishes and the dishes for the middle of the table. No prices. Refreshed by polling.
export function RestaurantView({ apiBase, initial, eventName, locale }: Props) {
  const t = restaurantMessages(locale);
  const { view, gone, offline } = useRestaurantView(apiBase, initial);
  const { seating, placement, prep, totals } = view;
  const [loaded, setLoaded] = useState<{ version: number; aspect: number } | null>(null);
  const aspect = loaded !== null && loaded.version === seating.planVersion ? loaded.aspect : BLANK_ASPECT;

  // Tables without anything to serve are drawn faded.
  const tables = useMemo((): VenueDrawingTable[] => {
    const serving = new Set(placement.tables.map((table) => table.name));
    return seating.tables.map((table, index) => ({
      ...table,
      key: `${String(index).padStart(3, "0")} ${table.name}`,
      muted: !serving.has(table.name),
    }));
  }, [seating.tables, placement.tables]);

  function readNatural(img: HTMLImageElement | null) {
    const version = seating.planVersion;
    if (version !== null && img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setLoaded((previous) =>
        previous?.version === version && previous.aspect === ratio ? previous : { version, aspect: ratio },
      );
    }
  }

  if (gone) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl border p-4">
        <h1 className="text-2xl font-bold">{t.goneTitle}</h1>
        <p>{t.goneText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{t.kicker}</p>
        <h1 className="text-3xl font-bold">{eventName}</h1>
        <p className="text-lg font-medium" aria-live="polite">
          {describeToServe(totals.toServe, totals.quantity, locale)}
        </p>
        <p className="text-muted-foreground text-sm">{t.refreshes}</p>
        {offline && (
          <p role="status" className="self-start rounded-md bg-amber-500/15 px-2 py-1 text-sm">
            {t.offline}
          </p>
        )}
      </header>

      <section aria-labelledby="prep-heading" className="flex flex-col gap-3">
        <h2 id="prep-heading" className="text-xl font-semibold">
          {t.prepHeading}
        </h2>
        {prep.length === 0 ? (
          <p className="text-muted-foreground">{t.nothingYet}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-base">
              <thead className="bg-muted text-left text-sm">
                <tr>
                  <th className="p-2 font-medium">{t.dish}</th>
                  <th className="p-2 text-right font-medium">{t.total}</th>
                  <th className="p-2 text-right font-medium">{t.toServe}</th>
                </tr>
              </thead>
              <tbody>
                {prep.map((line) => (
                  <tr
                    key={line.name}
                    className={cn("border-t align-top", line.toServe === 0 && "text-muted-foreground")}
                  >
                    <td className="p-2">
                      <span className="font-medium">{line.name}</span>
                      {line.notes.map((note) => (
                        <span key={note.note} className="block text-sm text-amber-700 dark:text-amber-400">
                          {note.quantity} × {note.note}
                        </span>
                      ))}
                    </td>
                    <td className="p-2 text-right">{line.quantity}</td>
                    <td className="p-2 text-right font-semibold">{line.toServe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
        <h2 id="plan-heading" className="text-xl font-semibold">
          {t.planHeading}
        </h2>
        {seating.publishedAt === null ? (
          <p className="text-muted-foreground">{t.seatingNotReady}</p>
        ) : (
          <div className="bg-background rounded-xl border p-2">
            {seating.planVersion !== null && (
              <img
                key={seating.planVersion}
                ref={readNatural}
                src={planImagePath(apiBase, seating.planVersion)}
                alt=""
                aria-hidden
                onLoad={(event) => {
                  readNatural(event.currentTarget);
                }}
                className="hidden"
              />
            )}
            <VenueDrawing
              aspect={aspect}
              chairPitch={seating.chairPitch}
              rooms={seating.rooms}
              tables={tables}
              variant="phone"
              label={t.planLabel}
              className="h-auto max-h-[80vh] w-full"
            />
          </div>
        )}
      </section>

      <section aria-labelledby="serve-heading" className="flex flex-col gap-4">
        <h2 id="serve-heading" className="text-xl font-semibold">
          {t.serveHeading}
        </h2>
        {placement.tables.length === 0 && placement.unplaced.length === 0 && placement.unassigned.length === 0 && (
          <p className="text-muted-foreground">{t.nothingYet}</p>
        )}
        {placement.tables.map((table) => (
          <article
            key={`${table.room} ${table.name}`}
            className="flex flex-col gap-3 rounded-xl border p-4"
            aria-label={t.table(table.name)}
          >
            <h3 className="text-lg font-semibold">
              {table.name} <span className="text-muted-foreground text-sm font-normal">{table.room}</span>
            </h3>
            {table.seats.map((seat) => (
              <div key={seat.seat} className="flex flex-col gap-1 border-l-4 border-amber-500/60 pl-3">
                <h4 className="text-muted-foreground text-sm">
                  {`${t.seat(seat.seat)} · `}
                  <span className="text-foreground font-semibold">{seat.guestName}</span>
                </h4>
                <ItemList deliveredLabel={t.delivered} items={seat.items} />
              </div>
            ))}
            {table.tableItems.length > 0 && (
              <div className="flex flex-col gap-1 border-l-4 border-sky-500/60 pl-3">
                <h4 className="text-sm font-semibold">{t.middleOfTable}</h4>
                <ItemList deliveredLabel={t.delivered} items={table.tableItems} />
              </div>
            )}
          </article>
        ))}
        {placement.unplaced.length > 0 && (
          <article
            className="flex flex-col gap-3 rounded-xl border border-amber-500/50 p-4"
            aria-label={t.unplacedLabel}
          >
            <header className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">{t.unplacedHeading}</h3>
              <p className="text-muted-foreground text-sm">{t.unplacedText}</p>
            </header>
            {placement.unplaced.map((group) => (
              <div key={`${group.kind} ${group.name}`} className="flex flex-col gap-1 pl-3">
                <h4 className="text-sm font-semibold">{group.kind === "guest" ? group.name : t.table(group.name)}</h4>
                <ItemList deliveredLabel={t.delivered} items={group.items} />
              </div>
            ))}
          </article>
        )}
        {placement.unassigned.length > 0 && (
          <article className="flex flex-col gap-3 rounded-xl border p-4" aria-label={t.unassignedLabel}>
            <h3 className="text-lg font-semibold">{t.unassignedHeading}</h3>
            <ItemList deliveredLabel={t.delivered} items={placement.unassigned} />
          </article>
        )}
      </section>
    </div>
  );
}
