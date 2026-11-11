import { useId, useState, type SubmitEvent } from "react";
import { DietBadges } from "@/components/diets/DietBadges";
import { Button } from "@/components/ui/button";
import { dietMessages } from "@/lib/diets/messages";
import type { DietTag } from "@/lib/diets/rules";
import { Input } from "@/components/ui/input";
import { guestManagerMessages } from "@/lib/guests/messages";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GuestDto } from "@/types";
import { DietEditor } from "./DietEditor";

interface Props {
  guest: GuestDto;
  // Names of the other members of the guest's group (empty when not in a group).
  groupPartners: string[];
  selected: boolean;
  pending: boolean;
  onToggleSelected: () => void;
  onRename: (displayName: string) => Promise<boolean>;
  onToggleAbsent: () => void;
  onDelete: () => void;
  // guest-import-diets (S-23): saves the guest's diet and note; resolves to true when saved.
  onSaveDiet: (diets: DietTag[], dietNote: string | null) => Promise<boolean>;
  locale: Locale;
}

// One guest on the organizer list: select for a group, rename, mark absent/present, the diet (S-23), delete.
export function GuestRow({
  guest,
  groupPartners,
  selected,
  pending,
  onToggleSelected,
  onRename,
  onToggleAbsent,
  onDelete,
  onSaveDiet,
  locale,
}: Props) {
  const t = guestManagerMessages(locale);
  const dt = dietMessages(locale);
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [editingDiet, setEditingDiet] = useState(false);
  const [draft, setDraft] = useState(guest.displayName);
  const grouped = guest.groupId !== null;

  async function submitRename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onRename(draft)) {
      setEditing(false);
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:flex-wrap sm:items-center",
        guest.isAbsent && "bg-muted",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <label
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            grouped ? "cursor-not-allowed opacity-40" : "hover:bg-accent cursor-pointer",
          )}
          title={grouped ? t.alreadyInGroup : t.selectForGroup}
        >
          <input
            type="checkbox"
            className="accent-primary size-5"
            checked={selected}
            disabled={grouped || pending}
            onChange={onToggleSelected}
            aria-label={t.selectForGroupLabel(guest.displayName)}
          />
        </label>

        {editing ? (
          <form onSubmit={submitRename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              {t.newNameFor(guest.displayName)}
            </label>
            <Input
              id={inputId}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 basis-40"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || draft.trim() === ""} className="h-10">
                {t.save}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setEditing(false);
                }}
              >
                {t.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn("truncate font-medium", guest.isAbsent && "text-muted-foreground line-through")}>
              {guest.displayName}
            </span>
            <span className="text-muted-foreground flex flex-wrap gap-1 text-xs">
              {guest.isAbsent && <span className="rounded-full border px-2 py-0.5">{t.absentBadge}</span>}
              {groupPartners.length > 0 && (
                <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
                  {groupPartners.length === 1 ? t.pairWith : t.groupWith}
                  {groupPartners.join(", ")}
                </span>
              )}
            </span>
            <DietBadges diets={guest.diets} note={guest.dietNote} locale={locale} className="mt-1" />
          </div>
        )}
      </div>

      {!editing && !editingDiet && (
        <div className="flex flex-wrap gap-2 pl-11 sm:pl-0">
          <Button
            type="button"
            variant={guest.isAbsent ? "secondary" : "outline"}
            className="h-10"
            aria-pressed={guest.isAbsent}
            disabled={pending}
            onClick={onToggleAbsent}
          >
            {guest.isAbsent ? t.presentAfterAll : t.absent}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={() => {
              setDraft(guest.displayName);
              setEditing(true);
            }}
          >
            {t.rename}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            aria-label={dt.editLabel(guest.displayName)}
            onClick={() => {
              setEditingDiet(true);
            }}
          >
            {dt.editButton}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive h-10"
            disabled={pending}
            onClick={onDelete}
          >
            {t.remove}
          </Button>
        </div>
      )}
      {editingDiet && (
        <div className="w-full sm:basis-full">
          <DietEditor
            guest={guest}
            pending={pending}
            onSave={onSaveDiet}
            onCancel={() => {
              setEditingDiet(false);
            }}
            locale={locale}
          />
        </div>
      )}
    </li>
  );
}
