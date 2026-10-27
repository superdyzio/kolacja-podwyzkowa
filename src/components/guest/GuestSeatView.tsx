import { useState } from "react";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import { NO_ACCESS_HINT, NO_ACCESS_TEXT, NO_ACCESS_TITLE } from "@/lib/access/messages";
import { GUEST_UNPUBLISHED_MESSAGE, GUEST_UNSEATED_MESSAGE, describeGuestSeat } from "@/lib/guest-links/state";
import { pluralPl } from "@/lib/guests/summary";
import { fractionStyle, planImagePath } from "@/lib/venue/pin";
import { cn } from "@/lib/utils";
import type { GuestSeatDto, GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
}

function tableKind(seat: GuestSeatDto): string {
  const shape = seat.shape === "round" ? "okrągły" : "prostokątny";
  return `Stolik ${shape} · ${seat.seatCount} ${pluralPl(seat.seatCount, "miejsce", "miejsca", "miejsc")}`;
}

// The guest's phone view of their own seat (S-05, FR-013): name, table, room and seat in the latest PUBLISHED
// arrangement, refreshed live; the plan with the table highlighted on request. When access is gone (switched off,
// link revoked) it shows the no-access message and nothing else.
export function GuestSeatView({ apiBase, initial }: Props) {
  const { state, offline, changed } = useGuestState(apiBase, initial);
  const [showPlan, setShowPlan] = useState(false);

  if (!state) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border p-5 text-center">
        <p className="text-2xl font-bold">{NO_ACCESS_TITLE}</p>
        <p className="text-muted-foreground">{NO_ACCESS_TEXT}</p>
        <p className="text-muted-foreground text-sm">{NO_ACCESS_HINT}</p>
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

      <p className="sr-only" aria-live="polite">
        {describeGuestSeat(state)}
      </p>

      {seat && state.planVersion !== null && (
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-12 self-start text-base"
            aria-expanded={showPlan}
            onClick={() => {
              setShowPlan((shown) => !shown);
            }}
          >
            {showPlan ? "Ukryj plan" : "Pokaż na planie"}
          </Button>
          {showPlan && (
            <div className="overflow-hidden rounded-lg border">
              {/* Pin contract: the wrapper is sized by the <img> itself (no padding, border or object-fit on it). */}
              <div className="relative">
                <img
                  src={planImagePath(apiBase, state.planVersion)}
                  alt={`Plan lokalu z zaznaczonym stolikiem ${seat.table}`}
                  className="block h-auto w-full"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={fractionStyle(seat)}
                >
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex size-4 rounded-full bg-red-600 ring-2 ring-white" />
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
