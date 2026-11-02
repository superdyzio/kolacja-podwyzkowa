import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromPercent, toPercent } from "@/lib/venue/editor";
import { OUTLINE_MESSAGE, isValidOutline } from "@/lib/venue/rules";
import type { RoomDto, RoomOutline } from "@/types";

interface Props {
  room: RoomDto;
  pending: boolean;
  onSave: (outline: RoomOutline | null) => Promise<boolean>;
  onDone: () => void;
}

const FIELDS = [
  ["x", "Od lewej (%)"],
  ["y", "Od góry (%)"],
  ["width", "Szerokość (%)"],
  ["height", "Wysokość (%)"],
] as const;

type FieldName = (typeof FIELDS)[number][0];
type OutlineTexts = Record<FieldName, string> & { source: string };

function textsOf(source: string, outline: RoomOutline | null): OutlineTexts {
  return {
    source,
    x: outline ? toPercent(outline.x) : "",
    y: outline ? toPercent(outline.y) : "",
    width: outline ? toPercent(outline.width) : "",
    height: outline ? toPercent(outline.height) : "",
  };
}

// The outline of one room („Kontur sali”): drawn on the plan by dragging, or typed as percentages of the plan (narrow
// screens). The fields follow the outline when it changes on the plan.
export function RoomOutlinePanel({ room, pending, onSave, onDone }: Props) {
  const formId = useId();
  const source = JSON.stringify(room.outline);
  const [draft, setDraft] = useState(() => textsOf(source, room.outline));
  const texts = draft.source === source ? draft : textsOf(source, room.outline);

  const values = FIELDS.map(([field]) => fromPercent(texts[field]));
  const [x, y, width, height] = values;
  const outline = x !== null && y !== null && width !== null && height !== null ? { x, y, width, height } : null;
  const valid =
    outline !== null &&
    isValidOutline(outline) &&
    outline.x + outline.width <= 1.0001 &&
    outline.y + outline.height <= 1.0001;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outline && valid) {
      await onSave(outline);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby={`${formId}-heading`} className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 id={`${formId}-heading`} className="font-semibold">
        Kontur sali „{room.name}”
      </h3>
      <p className="text-sm">
        Przeciągnij na planie prostokąt sali. Gotowy kontur przesuwasz za krawędź, a rogi zmieniają jego rozmiar. Na TV
        sala pojawi się z nazwą po publikacji.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([field, text]) => (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={`${formId}-${field}`} className="text-muted-foreground text-xs">
              {text}
            </label>
            <Input
              id={`${formId}-${field}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.1}
              value={texts[field]}
              onChange={(event) => {
                setDraft({ ...texts, [field]: event.target.value });
              }}
              className="h-10"
            />
          </div>
        ))}
      </div>
      {!valid && texts.x !== "" && <p className="text-destructive text-xs">{OUTLINE_MESSAGE}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-10" disabled={pending || !valid}>
          Zapisz kontur
        </Button>
        {room.outline && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive h-10"
            disabled={pending}
            onClick={() => void onSave(null)}
          >
            Usuń kontur
          </Button>
        )}
        <Button type="button" variant="outline" className="h-10" onClick={onDone}>
          Gotowe
        </Button>
      </div>
    </form>
  );
}
