import { useId } from "react";
import { seatRows } from "@/lib/seating/board";
import { cn } from "@/lib/utils";
import { TABLE_SHAPE_LABELS } from "@/lib/venue/rules";
import type { TableDto } from "@/types";
import { GuestMarkers } from "./GuestMarkers";

export interface OccupantView {
  guestId: number;
  name: string;
  pinned: boolean;
  absent: boolean;
  partners: string[];
}

export interface SeatView {
  occupant: OccupantView | null;
  // The seat of the selected guest.
  selected: boolean;
  // Why a click here does nothing while a guest is selected (e.g. a pinned occupant), or null.
  refusal: string | null;
}

interface Props {
  table: TableDto;
  seatView: (seat: number) => SeatView;
  pending: boolean;
  onSeatClick: (seat: number) => void;
}

// One table with its seats as buttons: a rectangular table shows side A and side B next to each other (row by
// position), a round table its seats in order.
export function TableSeats({ table, seatView, pending, onSeatClick }: Props) {
  const headingId = useId();
  const rows = seatRows(table.shape, table.seatCount);
  const rectangular = table.shape === "rectangular";
  let taken = 0;
  for (let seat = 1; seat <= table.seatCount; seat++) {
    if (seatView(seat).occupant) {
      taken++;
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-xl border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 id={headingId} className="font-semibold break-words">
          {table.name}
        </h3>
        <span className="text-muted-foreground text-xs">
          zajęte {taken} z {table.seatCount} · {TABLE_SHAPE_LABELS[table.shape]}
        </span>
      </header>
      {rectangular && (
        <div aria-hidden className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
          <span>Strona A</span>
          <span>Strona B</span>
        </div>
      )}
      <ul className={cn("grid gap-2", rectangular ? "grid-cols-2" : "grid-cols-1")}>
        {rows.flat().map((seat, index) =>
          seat === null ? (
            <li key={`none-${index}`} aria-hidden />
          ) : (
            <li key={seat}>
              <SeatButton seat={seat} view={seatView(seat)} pending={pending} onClick={onSeatClick} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function SeatButton({
  seat,
  view,
  pending,
  onClick,
}: {
  seat: number;
  view: SeatView;
  pending: boolean;
  onClick: (seat: number) => void;
}) {
  const { occupant } = view;
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={view.selected}
      aria-disabled={view.refusal === null ? undefined : true}
      title={view.refusal ?? undefined}
      onClick={() => {
        onClick(seat);
      }}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring/50 flex min-h-11 w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px] disabled:opacity-60",
        !occupant && "border-dashed",
        occupant?.absent && "bg-muted/60",
        view.selected && "border-primary bg-primary/10 ring-primary ring-1",
        view.refusal !== null && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="text-muted-foreground w-5 shrink-0 pt-px text-right text-xs tabular-nums">
        <span className="sr-only">Miejsce </span>
        {seat}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {occupant ? (
          <span className={cn("font-medium break-words", occupant.absent && "text-muted-foreground")}>
            {occupant.name}
          </span>
        ) : (
          <span className="text-muted-foreground italic">wolne</span>
        )}
        {occupant && <GuestMarkers pinned={occupant.pinned} absent={occupant.absent} partners={occupant.partners} />}
      </span>
    </button>
  );
}
