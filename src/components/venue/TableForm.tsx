import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromPercent, toPercent, type TableGeometry } from "@/lib/venue/editor";
import {
  DEFAULT_SEATS,
  MAX_SEATS,
  MAX_TABLE_NAME_LENGTH,
  MIN_SEATS,
  SEAT_COUNT_MESSAGE,
  TABLE_SHAPES,
  TABLE_SHAPE_LABELS,
  isValidSeatCount,
} from "@/lib/venue/rules";
import type { RoomDto, TableDto, TableShape } from "@/types";

export interface TableFormValues {
  roomId: number;
  name: string;
  seatCount: number;
  shape: TableShape;
  // Left out when editing a table whose position fields were not touched, so „Zapisz” never writes back a position
  // the table had before a drag or a nudge that is still being saved.
  x?: number;
  y?: number;
  rotation?: number;
}

interface Props {
  // The table being edited, or null for a new one.
  table: TableDto | null;
  rooms: RoomDto[];
  // For a new table: the preselected room and the suggested name („Stolik N”).
  defaultRoomId: number;
  suggestedName: string;
  // Where the table stands now (new table: the clicked point). The position fields follow it when it changes
  // (dragged on the plan), so a later „Zapisz” never moves the table back.
  geometry: TableGeometry;
  pending: boolean;
  // Resolves to true when the table was saved.
  onSubmit: (values: TableFormValues) => Promise<boolean>;
  onCancel: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

const NUMBERING_HINT =
  "Miejsca numerujemy od 1. Przy okrągłym — zgodnie z ruchem wskazówek zegara; przy prostokątnym najpierw jedna strona, potem druga, w tym samym kierunku.";

interface PlacementFields {
  source: string;
  x: string;
  y: string;
  rotation: string;
}

function placementFields(source: string, geometry: TableGeometry): PlacementFields {
  return { source, x: toPercent(geometry.x), y: toPercent(geometry.y), rotation: String(geometry.rotation) };
}

// New table / edit table (FR-006): room, name, seat count, type, and the position (also
// set by dragging on the plan).
export function TableForm({
  table,
  rooms,
  defaultRoomId,
  suggestedName,
  geometry,
  pending,
  onSubmit,
  onCancel,
  onMove,
  onDelete,
}: Props) {
  const formId = useId();
  const [roomId, setRoomId] = useState(table?.roomId ?? defaultRoomId);
  const [name, setName] = useState(table?.name ?? suggestedName);
  const [seats, setSeats] = useState(String(table?.seatCount ?? DEFAULT_SEATS));
  const [shape, setShape] = useState<TableShape>(table?.shape ?? "round");

  const source = `${geometry.x}|${geometry.y}|${geometry.rotation}`;
  const [placement, setPlacement] = useState(() => placementFields(source, geometry));
  const fields = placement.source === source ? placement : placementFields(source, geometry);

  const seatCount = Number(seats);
  const seatsValid = isValidSeatCount(seatCount);
  const x = fromPercent(fields.x);
  const y = fromPercent(fields.y);
  const rotation = fields.rotation.trim() === "" ? null : Number(fields.rotation.replace(",", "."));
  const placementValid = x !== null && y !== null && rotation !== null && Number.isFinite(rotation);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (x === null || y === null || rotation === null) {
      return;
    }
    const untouched =
      fields.x === toPercent(geometry.x) &&
      fields.y === toPercent(geometry.y) &&
      fields.rotation === String(geometry.rotation);
    await onSubmit(
      table && untouched
        ? { roomId, name, seatCount, shape }
        : { roomId, name, seatCount, shape, x, y, rotation: Math.round(rotation) },
    );
  }

  return (
    <form onSubmit={submit} aria-labelledby={`${formId}-heading`} className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 id={`${formId}-heading`} className="font-semibold">
        {table ? `Stolik „${table.name}”` : "Nowy stolik"}
      </h3>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-room`} className="text-sm font-medium">
          Sala
        </label>
        <select
          id={`${formId}-room`}
          value={roomId}
          onChange={(event) => {
            setRoomId(Number(event.target.value));
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-name`} className="text-sm font-medium">
          Nazwa stolika
        </label>
        <Input
          id={`${formId}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={MAX_TABLE_NAME_LENGTH}
          autoComplete="off"
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-seats`} className="text-sm font-medium">
          Liczba miejsc
        </label>
        <Input
          id={`${formId}-seats`}
          type="number"
          inputMode="numeric"
          min={MIN_SEATS}
          max={MAX_SEATS}
          step={1}
          value={seats}
          aria-invalid={!seatsValid}
          aria-describedby={`${formId}-seats-hint`}
          onChange={(event) => {
            setSeats(event.target.value);
          }}
          className="h-10 w-28"
        />
        <p
          id={`${formId}-seats-hint`}
          className={seatsValid ? "text-muted-foreground text-xs" : "text-destructive text-xs"}
        >
          {SEAT_COUNT_MESSAGE}
        </p>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Typ stolika</legend>
        <div className="flex flex-wrap gap-2">
          {TABLE_SHAPES.map((option) => (
            <label
              key={option}
              className="has-[:checked]:border-primary has-[:checked]:bg-primary/10 flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
            >
              <input
                type="radio"
                name={`${formId}-shape`}
                value={option}
                checked={shape === option}
                onChange={() => {
                  setShape(option);
                }}
                className="accent-primary size-4"
              />
              {TABLE_SHAPE_LABELS[option]}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{NUMBERING_HINT}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Położenie na planie</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["x", "Od lewej (%)", "0.1"],
              ["y", "Od góry (%)", "0.1"],
              ["rotation", "Obrót (°)", "1"],
            ] as const
          ).map(([field, text, step]) => (
            <div key={field} className="flex flex-col gap-1">
              <label htmlFor={`${formId}-${field}`} className="text-muted-foreground text-xs">
                {text}
              </label>
              <Input
                id={`${formId}-${field}`}
                type="number"
                inputMode="decimal"
                step={step}
                min={field === "rotation" ? undefined : 0}
                max={field === "rotation" ? undefined : 100}
                value={fields[field]}
                onChange={(event) => {
                  setPlacement({ ...fields, [field]: event.target.value });
                }}
                className="h-10"
              />
            </div>
          ))}
        </div>
        <p className={placementValid ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>
          Na komputerze wygodniej przeciągnąć stolik na planie; uchwyt nad nim obraca.
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="h-10"
          disabled={pending || !seatsValid || !placementValid || name.trim() === ""}
        >
          {table ? "Zapisz" : "Dodaj stolik"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
          Anuluj
        </Button>
      </div>

      {table && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={onMove}>
            Przestaw pinezkę
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive h-10"
            disabled={pending}
            onClick={onDelete}
          >
            Usuń stolik
          </Button>
        </div>
      )}
    </form>
  );
}
