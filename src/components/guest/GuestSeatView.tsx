import { useMemo, useState } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import { noAccessMessages } from "@/lib/access/messages";
import { GUEST_UNPUBLISHED_MESSAGE, GUEST_UNSEATED_MESSAGE, describeGuestSeat } from "@/lib/guest-links/state";
import { pluralPl } from "@/lib/guests/summary";
import { planImagePath } from "@/lib/venue/pin";
import { cn } from "@/lib/utils";
import type { GuestDrawingDto, GuestSeatDto, GuestStateDto, TablemateDto, TablemateRelation } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
}

const RELATION_LABELS: Record<TablemateRelation, string> = { side: "obok Ciebie", opposite: "naprzeciwko" };

function tableKind(seat: GuestSeatDto): string {
  const shape = seat.shape === "round" ? "okrągły" : "prostokątny";
  return `Stolik ${shape} · ${seat.seatCount} ${pluralPl(seat.seatCount, "miejsce", "miejsca", "miejsc")}`;
}

// Who else sits at the guest's table in the published arrangement, in seat order, neighbours marked.
function Tablemates({ tablemates }: { tablemates: TablemateDto[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-5">
      <h3 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Przy Twoim stoliku</h3>
      {tablemates.length === 0 ? (
        <p className="text-lg">Nikt więcej nie siedzi przy tym stoliku.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {tablemates.map((mate) => (
            <li key={mate.seat} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={cn("text-lg break-words", mate.relation && "font-semibold")}>{mate.name}</span>
              {mate.relation && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">
                  {RELATION_LABELS[mate.relation]}
                </span>
              )}
              <span className="text-muted-foreground ml-auto text-sm tabular-nums">miejsce {mate.seat}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DEFAULT_ASPECT = 16 / 9;

// The guest's table drawn with the names at their chairs (the guest's own chair highlighted), and the whole venue
// with that table emphasised on request (venue-drawing). Names come only from the guest's own table (tablemates and
// the guest), exactly what the TV shows for it.
function SeatDrawing({
  apiBase,
  drawing,
  seat,
  name,
  planVersion,
}: {
  apiBase: string;
  drawing: GuestDrawingDto;
  seat: GuestSeatDto;
  name: string;
  planVersion: number | null;
}) {
  const [showVenue, setShowVenue] = useState(false);
  // The plan photo's aspect ratio (the drawing's coordinates are fractions of it), read only for the whole-venue view.
  const [aspect, setAspect] = useState<{ version: number; value: number } | null>(null);
  const tables = useMemo(
    (): VenueDrawingTable[] =>
      drawing.tables.map((table) => {
        const mine = table.name === seat.table;
        return {
          ...table,
          key: table.name,
          muted: !mine,
          seats: mine
            ? [{ seat: seat.seat, name }, ...seat.tablemates.map((mate) => ({ seat: mate.seat, name: mate.name }))]
            : [],
        };
      }),
    [drawing.tables, seat, name],
  );
  const ratio = aspect !== null && aspect.version === planVersion ? aspect.value : DEFAULT_ASPECT;
  const highlight = { table: seat.table, seat: seat.seat };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl border">
        <VenueDrawing
          aspect={ratio}
          chairPitch={drawing.chairPitch}
          rooms={[]}
          tables={tables.filter((table) => table.key === seat.table)}
          variant="phone"
          highlight={highlight}
          focus={seat.table}
          label={`Stolik ${seat.table} z Twoim miejscem ${seat.seat} i imionami przy krzesłach`}
          className="max-h-[70vh] w-full"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-12 self-start text-base"
        aria-expanded={showVenue}
        onClick={() => {
          setShowVenue((shown) => !shown);
        }}
      >
        {showVenue ? "Ukryj plan sali" : "Pokaż na planie sali"}
      </Button>
      {showVenue && (
        <div className="overflow-hidden rounded-2xl border">
          {planVersion !== null && (
            <img
              src={planImagePath(apiBase, planVersion)}
              alt=""
              aria-hidden
              className="hidden"
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setAspect({ version: planVersion, value: img.naturalWidth / img.naturalHeight });
                }
              }}
            />
          )}
          <VenueDrawing
            aspect={ratio}
            chairPitch={drawing.chairPitch}
            rooms={drawing.rooms}
            tables={tables}
            variant="phone"
            highlight={highlight}
            label={`Plan sali z zaznaczonym stolikiem ${seat.table}`}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}

// The guest's phone view of their own seat (S-05, FR-013): name, table, room and seat in the latest PUBLISHED
// arrangement, refreshed live, the table drawn with the names at their chairs, who else sits there (tablemates), and
// the whole venue drawing on request. When access is gone (switched off, link revoked) it shows the no-access message
// and nothing else.
export function GuestSeatView({ apiBase, initial }: Props) {
  const { state, offline, changed } = useGuestState(apiBase, initial);

  if (!state) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border p-5 text-center">
        <p className="text-2xl font-bold">{noAccessMessages().title}</p>
        <p className="text-muted-foreground">{noAccessMessages().text}</p>
        <p className="text-muted-foreground text-sm">{noAccessMessages().hint}</p>
      </div>
    );
  }

  const seat = state.status === "seated" ? state.seat : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-3xl font-bold break-words">Cześć, {state.name}!</p>

      {offline && (
        <p role="status" className="self-start rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
          Brak połączenia — ponawiam…
        </p>
      )}

      {seat ? (
        <div
          className={cn(
            "flex flex-col gap-4 rounded-2xl border-2 p-5 transition-shadow",
            changed && "border-amber-500 ring-4 ring-amber-300",
          )}
        >
          {changed && <p className="text-lg font-semibold text-amber-800">Nowe miejsce!</p>}
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Twój stolik</dt>
              <dd className="text-4xl leading-tight font-bold break-words">{seat.table}</dd>
              <dd className="text-muted-foreground text-sm">{tableKind(seat)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Miejsce</dt>
                <dd className="text-5xl leading-none font-bold">{seat.seat}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Sala</dt>
                <dd className="text-2xl font-semibold break-words">{seat.room}</dd>
              </div>
            </div>
          </dl>
        </div>
      ) : (
        <p className="rounded-2xl border p-5 text-lg">
          {state.status === "unpublished" ? GUEST_UNPUBLISHED_MESSAGE : GUEST_UNSEATED_MESSAGE}
        </p>
      )}

      {seat && state.drawing && (
        <SeatDrawing
          apiBase={apiBase}
          drawing={state.drawing}
          seat={seat}
          name={state.name}
          planVersion={state.planVersion}
        />
      )}

      {seat && <Tablemates tablemates={seat.tablemates} />}

      <p className="sr-only" aria-live="polite">
        {describeGuestSeat(state)}
      </p>
    </div>
  );
}
