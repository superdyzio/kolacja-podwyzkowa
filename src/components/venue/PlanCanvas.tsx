import { useState, type MouseEvent } from "react";
import { fractionStyle, pointToFraction, type PinPosition } from "@/lib/venue/pin";
import { TABLE_SHAPE_LABELS } from "@/lib/venue/rules";
import { pluralPl } from "@/lib/guests/summary";
import { cn } from "@/lib/utils";
import type { TableDto } from "@/types";

interface Props {
  imageSrc: string;
  tables: TableDto[];
  roomNameById: Map<number, string>;
  // Highlighted table (being edited or moved).
  selectedId: number | null;
  // Where the new table will stand, while its form is open.
  draftPin: PinPosition | null;
  // Label of the clickable plan surface for screen readers (describes what a click does now).
  surfaceLabel: string;
  disabled: boolean;
  onPlanClick: (position: PinPosition) => void;
  onPinClick: (tableId: number) => void;
}

// The plan image with table pins. Pins are stored as fractions of the rendered image (src/lib/venue/pin.ts): the
// wrapper is sized by the <img> itself (block, full width, natural aspect ratio), so a pin stays on the same spot
// of the image at any window size. A transparent button under the pins takes the clicks; activating it from the
// keyboard (no pointer position) uses the centre of the plan.
export function PlanCanvas({
  imageSrc,
  tables,
  roomNameById,
  selectedId,
  draftPin,
  surfaceLabel,
  disabled,
  onPlanClick,
  onPinClick,
}: Props) {
  const [broken, setBroken] = useState(false);

  function handleSurfaceClick(event: MouseEvent<HTMLButtonElement>) {
    const position =
      event.detail === 0
        ? { x: 0.5, y: 0.5 }
        : pointToFraction(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    onPlanClick(position);
  }

  if (broken) {
    return (
      <p role="alert" className="text-destructive rounded-lg border p-4 text-sm">
        Nie udało się wczytać planu. Odśwież stronę albo wgraj plan ponownie.
      </p>
    );
  }

  return (
    <div className="relative select-none">
      <img
        src={imageSrc}
        alt="Plan lokalu"
        draggable={false}
        className="block h-auto w-full rounded-md"
        onError={() => {
          setBroken(true);
        }}
      />
      <button
        type="button"
        aria-label={surfaceLabel}
        disabled={disabled}
        className="focus-visible:ring-ring/50 absolute inset-0 cursor-crosshair rounded-md outline-none focus-visible:ring-[3px] disabled:cursor-wait"
        onClick={handleSurfaceClick}
      />
      {tables.map((table) => {
        const selected = table.id === selectedId;
        const seats = `${table.seatCount} ${pluralPl(table.seatCount, "miejsce", "miejsca", "miejsc")}`;
        return (
          <button
            key={table.id}
            type="button"
            disabled={disabled}
            style={fractionStyle(table)}
            aria-label={`${table.name}: ${seats}, ${TABLE_SHAPE_LABELS[table.shape]}, ${roomNameById.get(table.roomId) ?? ""}`}
            aria-pressed={selected}
            title={`${table.name} · ${seats} · ${TABLE_SHAPE_LABELS[table.shape]}`}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 border-2 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap shadow-md outline-none",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              table.shape === "round" ? "rounded-full" : "rounded-sm",
              selected
                ? "border-primary bg-primary text-primary-foreground z-10"
                : "border-foreground/70 bg-background/90 text-foreground hover:bg-accent",
            )}
            onClick={() => {
              onPinClick(table.id);
            }}
          >
            <span>{table.name}</span>
            <span className="font-normal opacity-75">{table.seatCount}</span>
          </button>
        );
      })}
      {draftPin && (
        <span
          aria-hidden="true"
          style={fractionStyle(draftPin)}
          className="border-primary bg-primary/20 text-primary pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
        >
          Nowy stolik
        </span>
      )}
    </div>
  );
}
