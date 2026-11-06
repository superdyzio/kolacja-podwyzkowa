import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import { guessUiMessages } from "@/lib/guesses/messages";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GuessGuestDto } from "@/types";
import { AmountForm } from "./AmountForm";

interface Props {
  guest: GuessGuestDto;
  // guess-place: the highest place a prediction may name (the number of guests).
  maxPlace: number;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  // Resolves to true when saved; `place` is the prediction as text ("" = none).
  onSave: (amount: string, place?: string) => Promise<boolean>;
  onDelete: () => void;
  locale: Locale;
}

// One guest on the organizer's guesses page (S-06, FR-018): their guess or „brak strzału”, entering or correcting it
// for them (also after intake closed) and deleting a mistaken one; guess-place: their place prediction next to it,
// entered or corrected in the same form.
export function GuessGuestRow({
  guest,
  maxPlace,
  editing,
  pending,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  locale,
}: Props) {
  const t = guessUiMessages(locale);
  const hasGuess = guest.amountGrosze !== null;
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3", guest.isAbsent && "bg-muted")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{guest.displayName}</span>
          <span className="text-muted-foreground flex flex-wrap gap-1 text-xs">
            {guest.isAbsent && <span className="rounded-full border px-2 py-0.5">{t.absent}</span>}
            {guest.enteredBy === "organizer" && (
              <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
                {t.enteredByOrganizer}
              </span>
            )}
          </span>
        </div>
        <span className="flex flex-col items-end">
          <span className={cn("text-lg whitespace-nowrap", hasGuess ? "font-semibold" : "text-muted-foreground")}>
            {guest.amountGrosze === null ? t.noGuess : formatAmount(guest.amountGrosze)}
          </span>
          {guest.predictedPlace !== null && (
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              {t.predictedPlace(guest.predictedPlace)}
            </span>
          )}
        </span>
      </div>

      {editing ? (
        <AmountForm
          label={t.guessFor(guest.displayName)}
          hideLabel
          initialGrosze={guest.amountGrosze}
          place={{ initial: guest.predictedPlace, max: maxPlace }}
          submitLabel={t.save}
          pending={pending}
          autoFocus
          onSubmit={onSave}
          onCancel={onCancel}
          locale={locale}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={onEdit}
            aria-label={hasGuess ? t.correctGuessLabel(guest.displayName) : t.enterGuessLabel(guest.displayName)}
          >
            {hasGuess ? t.correctGuess : t.enterGuess}
          </Button>
          {hasGuess && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive h-10"
              disabled={pending}
              onClick={onDelete}
              aria-label={t.deleteGuessLabel(guest.displayName)}
            >
              {t.deleteGuess}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
