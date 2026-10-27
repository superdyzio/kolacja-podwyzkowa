import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import { cn } from "@/lib/utils";
import type { GuessGuestDto } from "@/types";
import { AmountForm } from "./AmountForm";

interface Props {
  guest: GuessGuestDto;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  // Resolves to true when saved.
  onSave: (amount: string) => Promise<boolean>;
  onDelete: () => void;
}

// One guest on the organizer's guesses page (S-06, FR-018): their guess or „brak strzału”, entering or correcting it
// for them (also after intake closed) and deleting a mistaken one.
export function GuessGuestRow({ guest, editing, pending, onEdit, onCancel, onSave, onDelete }: Props) {
  const hasGuess = guest.amountGrosze !== null;
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-3", guest.isAbsent && "bg-muted")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{guest.displayName}</span>
          <span className="text-muted-foreground flex flex-wrap gap-1 text-xs">
            {guest.isAbsent && <span className="rounded-full border px-2 py-0.5">nieobecny</span>}
            {guest.enteredBy === "organizer" && (
              <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
                wpisany przez organizatora
              </span>
            )}
          </span>
        </div>
        <span className={cn("text-lg whitespace-nowrap", hasGuess ? "font-semibold" : "text-muted-foreground")}>
          {guest.amountGrosze === null ? "brak strzału" : formatAmount(guest.amountGrosze)}
        </span>
      </div>

      {editing ? (
        <AmountForm
          label={`Strzał dla: ${guest.displayName}`}
          hideLabel
          initialGrosze={guest.amountGrosze}
          submitLabel="Zapisz"
          pending={pending}
          autoFocus
          onSubmit={onSave}
          onCancel={onCancel}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={pending}
            onClick={onEdit}
            aria-label={`${hasGuess ? "Popraw strzał" : "Wpisz strzał"}: ${guest.displayName}`}
          >
            {hasGuess ? "Popraw" : "Wpisz"}
          </Button>
          {hasGuess && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive h-10"
              disabled={pending}
              onClick={onDelete}
              aria-label={`Usuń strzał: ${guest.displayName}`}
            >
              Usuń strzał
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
