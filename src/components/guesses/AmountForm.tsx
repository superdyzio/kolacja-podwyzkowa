import { useId, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmountInput, parseAmount } from "@/lib/guesses/amount";
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
  // Resolves to true when saved (the form then closes or clears in the parent).
  onSubmit: (amount: string) => Promise<boolean>;
  onCancel?: () => void;
  className?: string;
}

// An amount field for the organizer (S-06): the correct amount and guesses entered for guests. Accepts the same Polish
// formats as the guest's phone ("1500", "1 499,99 zł") and checks them before sending, so a typo never costs a
// request; the server parses again. Keeps its own draft, so a board refresh never overwrites what is being typed.
export function AmountForm({
  label,
  hideLabel = false,
  initialGrosze,
  submitLabel,
  pending,
  autoFocus = false,
  onSubmit,
  onCancel,
  className,
}: Props) {
  const inputId = useId();
  const problemId = useId();
  const [draft, setDraft] = useState(initialGrosze === null ? "" : formatAmountInput(initialGrosze));
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(draft);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    if (await onSubmit(formatAmountInput(parsed.grosze))) {
      setDraft("");
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
            placeholder="np. 1500 albo 1499,99"
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
              Anuluj
            </Button>
          )}
        </div>
      </div>
      {problem && (
        <p id={problemId} role="alert" className="text-destructive text-sm font-medium">
          {problem}
        </p>
      )}
    </form>
  );
}
