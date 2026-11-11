import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dietMessages } from "@/lib/diets/messages";
import { DIET_TAGS, isAllergyTag, MAX_DIET_NOTE_LENGTH, type DietTag } from "@/lib/diets/rules";
import { normalizeDisplayName } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GuestDto } from "@/types";

interface Props {
  guest: GuestDto;
  pending: boolean;
  // PATCH /guests/<id> { diets, dietNote }; resolves to true when saved.
  onSave: (diets: DietTag[], dietNote: string | null) => Promise<boolean>;
  onCancel: () => void;
  locale: Locale;
}

// A guest's diet and allergies on the guest list (guest-import-diets, S-23; FR-036): one checkbox per tag of the fixed
// set and a short note for the kitchen and staff. Only the client and the staff see it — never the guest or the TV.
export function DietEditor({ guest, pending, onSave, onCancel, locale }: Props) {
  const t = dietMessages(locale);
  const noteId = useId();
  const [diets, setDiets] = useState<DietTag[]>(guest.diets);
  const [note, setNote] = useState(guest.dietNote ?? "");
  // Counted like the server (parseDietNote): normalized, in code points.
  const noteLength = Array.from(normalizeDisplayName(note)).length;
  const tooLong = noteLength > MAX_DIET_NOTE_LENGTH;

  function toggle(tag: DietTag) {
    setDiets((current) =>
      current.includes(tag)
        ? current.filter((other) => other !== tag)
        : DIET_TAGS.filter((other) => other === tag || current.includes(other)),
    );
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tooLong) {
      return;
    }
    const trimmed = note.trim();
    if (await onSave(diets, trimmed === "" ? null : trimmed)) {
      onCancel();
    }
  }

  return (
    <form
      data-diet-editor=""
      onSubmit={submit}
      aria-label={t.editLabel(guest.displayName)}
      className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.tagsLegend}</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {DIET_TAGS.map((tag) => (
            <label
              key={tag}
              className={cn(
                "hover:bg-accent flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2",
                isAllergyTag(tag) && "text-red-700 dark:text-red-400",
              )}
            >
              <input
                type="checkbox"
                className="accent-primary size-5"
                checked={diets.includes(tag)}
                disabled={pending}
                onChange={() => {
                  toggle(tag);
                }}
              />
              <span>
                {isAllergyTag(tag) ? "! " : ""}
                {t.labels[tag]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium">
          {t.noteLabel}
        </label>
        <Input
          id={noteId}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          maxLength={MAX_DIET_NOTE_LENGTH + 20}
          autoComplete="off"
          placeholder={t.notePlaceholder}
          aria-invalid={tooLong}
          className="h-10"
        />
        <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          {tooLong ? t.noteTooLong(MAX_DIET_NOTE_LENGTH) : t.noteCounter(noteLength, MAX_DIET_NOTE_LENGTH)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={pending || tooLong}>
          {t.save}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
