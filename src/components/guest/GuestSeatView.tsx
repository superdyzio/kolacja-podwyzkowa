import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import { useMapSearch } from "@/components/hooks/useMapSearch";
import { MapSearch } from "@/components/map-search/MapSearch";
import { Button } from "@/components/ui/button";
import { VenueDrawing, type DrawingMark, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import { noAccessMessages } from "@/lib/access/messages";
import { guestPhoneMessages } from "@/lib/guest-links/messages";
import { describeGuestSeat } from "@/lib/guest-links/state";
import { VENUE_ZOOM_STEPS, initialVenueZoom, medianHeight, stepVenueZoom } from "@/lib/guest-links/venue-zoom";
import type { Locale } from "@/lib/i18n";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import { planImagePath } from "@/lib/venue/pin";
import { cn } from "@/lib/utils";
import type { GuestDrawingDto, GuestSeatDto, GuestStateDto, TablemateDto, TablemateRelation } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
}

function relationLabel(relation: TablemateRelation, locale: Locale): string {
  const t = guestPhoneMessages(locale);
  return relation === "side" ? t.nextToYou : t.opposite;
}

function tableKind(seat: GuestSeatDto, locale: Locale): string {
  const t = guestPhoneMessages(locale);
  const count = seat.seatCount;
  const seats =
    locale === "en"
      ? `${count} ${pluralEn(count, "seat", "seats")}`
      : `${count} ${pluralPl(count, "miejsce", "miejsca", "miejsc")}`;
  return seat.shape === "round" ? t.tableRound(seats) : t.tableRectangular(seats);
}

// Who else sits at the guest's table in the published arrangement, in seat order, neighbours marked.
function Tablemates({ tablemates, locale }: { tablemates: TablemateDto[]; locale: Locale }) {
  const t = guestPhoneMessages(locale);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-5">
      <h3 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.tablematesHeading}</h3>
      {tablemates.length === 0 ? (
        <p className="text-lg">{t.aloneAtTable}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {tablemates.map((mate) => (
            <li key={mate.seat} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={cn("text-lg break-words", mate.relation && "font-semibold")}>{mate.name}</span>
              {mate.relation && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
                  {relationLabel(mate.relation, locale)}
                </span>
              )}
              <span className="text-muted-foreground ml-auto text-sm tabular-nums">{t.tablemateSeat(mate.seat)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DEFAULT_ASPECT = 16 / 9;

// Where the plan's scroll box should look after a zoom: the guest's own table, a found guest's table
// (guest-map-search), or the point that was in the middle.
type ZoomAnchor = { kind: "own" } | { kind: "table"; key: string } | { kind: "point"; x: number; y: number };

// The table of the guest found by the search (guest-map-search): `nonce` grows with every explicit pick (a click or
// Enter), which also brings the map into view; the only hit while typing has nonce 0 and only scrolls the map.
interface MapTarget {
  table: string;
  nonce: number;
}

function targetId(target: MapTarget | null): string | null {
  return target === null ? null : `${String(target.nonce)}\u0000${target.table}`;
}

// Scrolls the plan's box so the table (by its key, the table's name) is in the middle.
function scrollToTable(box: HTMLDivElement, key: string, smooth: boolean) {
  const group = [...box.querySelectorAll<SVGGElement>("g[data-table]")].find(
    (element) => element.dataset.table === key,
  );
  if (!group) {
    return;
  }
  const area = box.getBoundingClientRect();
  const rect = group.getBoundingClientRect();
  box.scrollBy({
    left: rect.left + rect.width / 2 - (area.left + area.width / 2),
    top: rect.top + rect.height / 2 - (area.top + area.height / 2),
    behavior: smooth ? "smooth" : "instant",
  });
}

// The whole venue on a phone (guest-venue-names): every published name at its chair, the guest's table and chair in
// red, drawn wider than the screen and scrolled. The first zoom makes the names readable (measured in the page), then
// the plan scrolls to the guest's table — or to the table of the guest found by the search (violet marks); „−”/„+”
// keep the middle of the view, „Mój stolik” scrolls back.
function VenueMap({
  aspect,
  drawing,
  tables,
  ownTable,
  ownSeat,
  marks,
  target,
  locale,
}: {
  aspect: number;
  drawing: GuestDrawingDto;
  tables: VenueDrawingTable[];
  ownTable: string;
  ownSeat: number;
  marks: readonly DrawingMark[];
  target: MapTarget | null;
  locale: Locale;
}) {
  const t = guestPhoneMessages(locale);
  const scrollRef = useRef<HTMLDivElement>(null);
  // null until the names were measured at zoom 1 (before the first paint).
  const [zoom, setZoom] = useState<number | null>(null);
  const anchor = useRef<ZoomAnchor>(target ? { kind: "table", key: target.table } : { kind: "own" });
  const lastTarget = useRef(targetId(target));
  // The last pick brought into view (the page scrolls to the map once per pick).
  const revealed = useRef(0);
  // The guest's place the view was last scrolled for: a new one (a redraw, a republish that moved the table) scrolls
  // to the own table again.
  const own = tables.find((table) => table.key === ownTable);
  const place = [ownTable, ownSeat, own?.x, own?.y, own?.rotation, aspect].map(String).join("\u0000");
  const lastPlace = useRef(place);

  // An explicit pick brings the map itself into the page's view (once per pick).
  function reveal(box: HTMLDivElement) {
    if (target !== null && target.nonce > revealed.current) {
      revealed.current = target.nonce;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) {
      return;
    }
    if (zoom === null) {
      const heights = [...box.querySelectorAll<SVGTextElement>("text[data-seat-name]")].map(
        (text) => text.getBoundingClientRect().height,
      );
      setZoom(initialVenueZoom(medianHeight(heights)));
      return;
    }
    if (lastPlace.current !== place) {
      lastPlace.current = place;
      anchor.current = { kind: "own" };
    }
    const view = anchor.current;
    if (view.kind === "point") {
      box.scrollLeft = view.x * box.scrollWidth - box.clientWidth / 2;
      box.scrollTop = view.y * box.scrollHeight - box.clientHeight / 2;
      return;
    }
    scrollToTable(box, view.kind === "own" ? ownTable : view.key, false);
    if (view.kind === "table") {
      reveal(box);
    }
    // Only a new zoom or a new own place re-centres; the search's target has its own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, ownTable, place]);

  // guest-map-search: a new found table becomes the anchor and is scrolled to at the current zoom (or after the first
  // measure, by the effect above); a cleared search leaves the view where it is.
  const currentTarget = targetId(target);
  useLayoutEffect(() => {
    if (lastTarget.current === currentTarget) {
      return;
    }
    lastTarget.current = currentTarget;
    const box = scrollRef.current;
    if (target === null) {
      return;
    }
    anchor.current = { kind: "table", key: target.table };
    if (box && zoom !== null) {
      scrollToTable(box, target.table, true);
      reveal(box);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTarget, zoom]);

  function zoomBy(direction: 1 | -1) {
    const box = scrollRef.current;
    if (!box || zoom === null) {
      return;
    }
    anchor.current = {
      kind: "point",
      x: (box.scrollLeft + box.clientWidth / 2) / box.scrollWidth,
      y: (box.scrollTop + box.clientHeight / 2) / box.scrollHeight,
    };
    setZoom(stepVenueZoom(zoom, direction));
  }

  function centerOnMe() {
    anchor.current = { kind: "own" };
    // The same zoom does not re-run the effect: scroll here.
    const box = scrollRef.current;
    if (box) {
      scrollToTable(box, ownTable, true);
    }
  }

  const level = zoom ?? 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t.venueHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 text-xl"
          aria-label={t.zoomOut}
          disabled={zoom === null || level <= VENUE_ZOOM_STEPS[0]}
          onClick={() => {
            zoomBy(-1);
          }}
        >
          −
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 text-xl"
          aria-label={t.zoomIn}
          disabled={zoom === null || level >= VENUE_ZOOM_STEPS[VENUE_ZOOM_STEPS.length - 1]}
          onClick={() => {
            zoomBy(1);
          }}
        >
          +
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {t.zoomLevel(Math.round(level * 100))}
        </span>
        <Button type="button" variant="outline" className="ml-auto h-11" onClick={centerOnMe}>
          {t.centerOnMe}
        </Button>
      </div>
      <div ref={scrollRef} className="max-h-[75vh] overflow-auto rounded-2xl border">
        <div style={{ width: `${String(level * 100)}%` }}>
          <VenueDrawing
            aspect={aspect}
            chairPitch={drawing.chairPitch}
            rooms={drawing.rooms}
            tables={tables}
            variant="phone"
            highlight={{ table: ownTable, seat: ownSeat }}
            marks={marks}
            label={t.venueDrawingLabel(ownTable)}
            locale={locale}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

// The guest's table drawn with the names at their chairs (the guest's own chair highlighted), and on request the
// whole venue with every published name (guest-venue-names) — exactly what the TV shows — the guest's table and chair
// in red. The guest's own chair carries their current name. guest-map-search (S-22): a search over exactly those
// names (nothing the phone does not already have) lists the guests found and lights their chairs violet; picking one
// opens the whole venue and scrolls to that table. The field is outside the toggled plan, so the server renders it.
function SeatDrawing({
  apiBase,
  drawing,
  seat,
  name,
  planVersion,
  locale,
}: {
  apiBase: string;
  drawing: GuestDrawingDto;
  seat: GuestSeatDto;
  name: string;
  planVersion: number | null;
  locale: Locale;
}) {
  const t = guestPhoneMessages(locale);
  const [showVenue, setShowVenue] = useState(false);
  // The plan photo is read (hidden) only once the whole venue was asked for, then stays mounted: hiding and showing
  // again does not download it again.
  const [planWanted, setPlanWanted] = useState(false);
  // The plan photo's aspect ratio (the drawing's coordinates are fractions of it); a photo that fails to load counts
  // as the default.
  const [aspect, setAspect] = useState<{ version: number; value: number } | null>(null);
  // With their room's name (the search lists it).
  const tables = useMemo(
    (): (VenueDrawingTable & { room: string })[] =>
      drawing.tables.map((table) => {
        const mine = table.name === seat.table;
        // A state from a server without the names (only during a deploy) draws empty chairs.
        const published = Array.isArray(table.seats) ? table.seats : [];
        return {
          ...table,
          key: table.name,
          highlighted: mine,
          seats: mine
            ? [{ seat: seat.seat, name }, ...seat.tablemates.map((mate) => ({ seat: mate.seat, name: mate.name }))]
            : published.map((placed) => ({ seat: placed.seat, name: placed.name })),
        };
      }),
    [drawing.tables, seat, name],
  );
  const ownTable = useMemo(
    () => tables.filter((table) => table.key === seat.table).map((table) => ({ ...table, highlighted: false })),
    [tables, seat.table],
  );
  const search = useMapSearch(tables);
  // Bumped by every explicit pick: the map opens (once) and scrolls to the found table again.
  const [picks, setPicks] = useState(0);
  const activeTable = search.active?.table ?? null;
  const target = useMemo(
    (): MapTarget | null => (activeTable === null ? null : { table: activeTable, nonce: picks }),
    [activeTable, picks],
  );
  const ratio = aspect !== null && aspect.version === planVersion ? aspect.value : DEFAULT_ASPECT;
  // The whole venue waits for the real aspect: drawn at the default first, every table would move (and the view would
  // lose the guest's table) when the photo arrives.
  const aspectKnown = planVersion === null || aspect?.version === planVersion;
  const highlight = { table: seat.table, seat: seat.seat };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border">
        <VenueDrawing
          aspect={ratio}
          chairPitch={drawing.chairPitch}
          rooms={[]}
          tables={ownTable}
          variant="phone"
          highlight={highlight}
          marks={search.marks}
          focus={seat.table}
          label={t.tableDrawingLabel(seat.table, seat.seat)}
          locale={locale}
          className="max-h-[70vh] w-full"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-12 self-start text-base"
        aria-expanded={showVenue}
        onClick={() => {
          setPlanWanted(true);
          setShowVenue((shown) => !shown);
        }}
      >
        {showVenue ? t.hideVenue : t.showVenue}
      </Button>
      <MapSearch
        search={search}
        locale={locale}
        onPick={() => {
          setPlanWanted(true);
          setShowVenue(true);
          setPicks((count) => count + 1);
        }}
      />
      {planWanted && planVersion !== null && (
        <img
          src={planImagePath(apiBase, planVersion)}
          alt=""
          aria-hidden
          className="hidden"
          onLoad={(event) => {
            const img = event.currentTarget;
            setAspect({
              version: planVersion,
              value:
                img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : DEFAULT_ASPECT,
            });
          }}
          onError={() => {
            setAspect({ version: planVersion, value: DEFAULT_ASPECT });
          }}
        />
      )}
      {showVenue && !aspectKnown && (
        <p role="status" className="text-muted-foreground text-sm">
          {t.venueLoading}
        </p>
      )}
      {showVenue && aspectKnown && (
        <VenueMap
          aspect={ratio}
          drawing={drawing}
          tables={tables}
          ownTable={seat.table}
          ownSeat={seat.seat}
          marks={search.marks}
          target={target}
          locale={locale}
        />
      )}
    </div>
  );
}

// The guest's phone view of their own seat (S-05, FR-013): name, table, room and seat in the latest PUBLISHED
// arrangement, refreshed live, the table drawn with the names at their chairs, who else sits there (tablemates), and
// the whole venue with every published name on request. When access is gone (switched off, link revoked) it shows the no-access message
// and nothing else.
export function GuestSeatView({ apiBase, initial, locale }: Props) {
  const { state, offline, changed } = useGuestState(apiBase, initial);
  const t = guestPhoneMessages(locale);

  if (!state) {
    const noAccess = noAccessMessages(locale);
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border p-5 text-center">
        <p className="text-2xl font-bold">{noAccess.title}</p>
        <p className="text-muted-foreground">{noAccess.text}</p>
        <p className="text-muted-foreground text-sm">{noAccess.hint}</p>
      </div>
    );
  }

  const seat = state.status === "seated" ? state.seat : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-3xl font-bold break-words">{t.hello(state.name)}</p>

      {offline && (
        <p role="status" className="self-start rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
          {t.offline}
        </p>
      )}

      {seat ? (
        <div
          className={cn(
            "flex flex-col gap-4 rounded-2xl border-2 p-5 transition-shadow",
            changed && "border-amber-500 ring-4 ring-amber-300",
          )}
        >
          {changed && <p className="text-lg font-semibold text-amber-800">{t.newSeat}</p>}
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.yourTable}</dt>
              <dd className="text-4xl leading-tight font-bold break-words">{seat.table}</dd>
              <dd className="text-muted-foreground text-sm">{tableKind(seat, locale)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.seat}</dt>
                <dd className="text-5xl leading-none font-bold">{seat.seat}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.room}</dt>
                <dd className="text-2xl font-semibold break-words">{seat.room}</dd>
              </div>
            </div>
          </dl>
        </div>
      ) : (
        <p className="rounded-2xl border p-5 text-lg">{state.status === "unpublished" ? t.unpublished : t.unseated}</p>
      )}

      {seat && state.drawing && (
        <SeatDrawing
          apiBase={apiBase}
          drawing={state.drawing}
          seat={seat}
          name={state.name}
          planVersion={state.planVersion}
          locale={locale}
        />
      )}

      {seat && <Tablemates tablemates={seat.tablemates} locale={locale} />}

      <p className="sr-only" aria-live="polite">
        {describeGuestSeat(state, locale)}
      </p>
    </div>
  );
}
