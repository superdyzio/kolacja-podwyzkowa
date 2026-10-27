import { useState, type SubmitEvent } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { isGuestState } from "@/components/hooks/guest-state-store";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatAmountInput, parseAmount } from "@/lib/guesses/amount";
import type { GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
}

const OFFLINE_MESSAGE = "Brak połączenia — spróbuj ponownie.";

// The guest's guess of the final raise amount on the phone (S-06, FR-017, NFR-001): enter it, change it until the
// organizer closes intake, and see ONLY the own guess. Reads the page's shared live state (one poll per phone), so a
// close, a reopen or the organizer typing the guess in for this guest shows up within one poll; a refreshed state
// never overwrites what the guest is typing. Without access (switched off, link revoked) it shows nothing: the seat
// section above already says why.
export function GuestGuessView({ apiBase, initial }: Props) {
  const { state, push, refresh } = useGuestState(apiBase, initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  if (!state) {
    return null;
  }

  const { intakeOpen, amountGrosze } = state.guess;
  const formOpen = intakeOpen && (editing || amountGrosze === null);

  function startEditing() {
    setDraft(amountGrosze === null ? "" : formatAmountInput(amountGrosze));
    setProblem(null);
    setJustSaved(false);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setProblem(null);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(draft);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch(`${apiBase}/guess`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: formatAmountInput(parsed.grosze) }),
      });
      const data = await readJson(response);
      if (response.ok && isGuestState(data)) {
        push(data);
        setEditing(false);
        setDraft("");
        setJustSaved(true);
        return;
      }
      if (response.status === 404) {
        // Access is gone: the next poll clears the page.
        refresh();
        return;
      }
      setProblem(toFailure(data).message);
      if (response.status === 409) {
        refresh();
      }
    } catch {
      setProblem(OFFLINE_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  const announcement = !intakeOpen
    ? "Przyjmowanie strzałów jest zamknięte."
    : justSaved && amountGrosze !== null
      ? `Zapisano Twój strzał: ${formatAmount(amountGrosze)}.`
      : "";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 p-5">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {!intakeOpen ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold">Przyjmowanie strzałów jest zamknięte.</p>
          {editing && <p className="text-muted-foreground text-sm">Zmiana nie została zapisana.</p>}
          {amountGrosze === null ? (
            <p className="text-muted-foreground">Nie oddano strzału.</p>
          ) : (
            <div>
              <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Twój strzał</p>
              <p className="text-4xl leading-tight font-bold">{formatAmount(amountGrosze)}</p>
            </div>
          )}
          <p className="text-muted-foreground text-sm">Wyniki ogłosi organizator.</p>
        </div>
      ) : formOpen ? (
        <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void save(event)}>
          <label htmlFor="guess-amount" className="text-lg font-medium">
            Ile wyniesie podwyżka? Wpisz swój strzał w złotych.
          </label>
          <div className="relative">
            <Input
              id="guess-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="np. 1500 albo 1499,99"
              // Only when the guest asked to change an existing guess: never pop the keyboard on page load.
              autoFocus={amountGrosze !== null}
              value={draft}
              aria-invalid={problem !== null}
              aria-describedby={problem ? "guess-problem" : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                // Typing a first guess counts as editing: a guess the organizer enters meanwhile must not hide the
                // form and lose the draft.
                setEditing(true);
              }}
              className="h-14 pr-12 text-2xl md:text-2xl"
            />
            <span
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-4 flex items-center text-xl"
            >
              zł
            </span>
          </div>
          {problem && (
            <p id="guess-problem" role="alert" className="text-destructive font-medium">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-12 text-base" disabled={saving}>
              {saving ? "Zapisuję…" : "Zapisz strzał"}
            </Button>
            {editing && amountGrosze !== null && (
              <Button type="button" variant="ghost" className="h-12 text-base" onClick={cancelEditing}>
                Anuluj
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Strzał widzisz tylko Ty. Możesz go zmieniać, dopóki organizator nie zamknie przyjmowania.
          </p>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Twój strzał</p>
            <p className="text-4xl leading-tight font-bold">
              {amountGrosze === null ? "" : formatAmount(amountGrosze)}
            </p>
          </div>
          {justSaved && (
            <p role="status" className="font-medium text-emerald-700">
              Zapisano.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            Widzisz go tylko Ty. Możesz go zmienić, dopóki organizator nie zamknie przyjmowania.
          </p>
          <Button type="button" variant="outline" className="h-12 self-start text-base" onClick={startEditing}>
            Zmień strzał
          </Button>
        </div>
      )}
    </div>
  );
}
