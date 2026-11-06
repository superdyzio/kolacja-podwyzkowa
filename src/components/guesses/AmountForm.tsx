import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmountInput, parseAmount } from "@/lib/guesses/amount";
import { guessUiMessages } from "@/lib/guesses/messages";
import { formatPlaceInput, parsePredictedPlace } from "@/lib/guesses/place";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  // The visible label (or, with `hideLabel`, the screen-reader one).
  label: string;
  hideLabel?: boolean;
  // Prefilled when correcting an amount; null starts empty.
  initialGrosze: number | null;
  submitLabel: string;
  pending: boolean;
  autoFocus?: boolean;
  // guess-place: also ask for the optional place prediction (a guest's guess): the prefilled one and the highest
  // allowed (the number of guests). Without it the form has the amount only.
  place?: { initial: number | null; max: number };
  // Resolves to true when saved (the form then closes or clears in the parent). `place` is the prediction as text
  // ("" = none) when the form asks for it, else undefined.
  onSubmit: (amount: string, place?: string) => Promise<boolean>;
  onCancel?: () => void;
  className?: string;
  locale: Locale;
}

// An amount field for the organizer (S-06): the correct amount and guesses entered for guests. Accepts the same Polish
// formats as the guest's phone ("1500", "1 499,99 zł") and checks them before sending, so a typo never costs a
// request; the server parses again. Keeps its own draft, so a board refresh never overwrites what is being typed.
// With `place` (a guest's guess) a second, optional field takes the prediction of the guest's own final place.
export function AmountForm({
  label,
  hideLabel = false,
  initialGrosze,
  submitLabel,
  pending,
  autoFocus = false,
  place,
  onSubmit,
  onCancel,
  className,
  locale,
}: Props) {
  const t = guessUiMessages(locale);
  const inputId = useId();
  const problemId = useId();
  const placeId = useId();
  const placeProblemId = useId();
  const [draft, setDraft] = useState(initialGrosze === null ? "" : formatAmountInput(initialGrosze));
  const [placeDraft, setPlaceDraft] = useState(formatPlaceInput(place?.initial ?? null));
  const [problem, setProblem] = useState<string | null>(null);
  const [placeProblem, setPlaceProblem] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(draft, locale);
    const parsedPlace = place ? parsePredictedPlace(placeDraft, place.max, locale) : null;
    setProblem(parsed.ok ? null : parsed.message);
    setPlaceProblem(parsedPlace && !parsedPlace.ok ? parsedPlace.message : null);
    if (!parsed.ok || (parsedPlace && !parsedPlace.ok)) {
      return;
    }
    const placeText = parsedPlace ? formatPlaceInput(parsedPlace.place) : undefined;
    if (await onSubmit(formatAmountInput(parsed.grosze), placeText)) {
      setDraft("");
      setPlaceDraft("");
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "font-medium"}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-40">
          <Input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={t.amountPlaceholder}
            autoFocus={autoFocus}
            value={draft}
            aria-invalid={problem !== null}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            className="h-11 pr-10 text-lg md:text-lg"
          />
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center"
          >
            zł
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-11" disabled={pending}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
              {t.cancel}
            </Button>
          )}
        </div>
      </div>
      {problem && (
        <p id={problemId} role="alert" className="text-destructive text-sm font-medium">
          {problem}
        </p>
      )}
      {place && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={placeId} className="text-sm font-medium">
            {t.placeFieldLabel}
          </label>
          <Input
            id={placeId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={t.placePlaceholder(place.max)}
            value={placeDraft}
            aria-invalid={placeProblem !== null}
            aria-describedby={placeProblem ? placeProblemId : undefined}
            onChange={(event) => {
              setPlaceDraft(event.target.value);
            }}
            className="h-11 w-24 text-lg md:text-lg"
          />
        </div>
      )}
      {placeProblem && (
        <p id={placeProblemId} role="alert" className="text-destructive text-sm font-medium">
          {placeProblem}
        </p>
      )}
    </form>
  );
}
