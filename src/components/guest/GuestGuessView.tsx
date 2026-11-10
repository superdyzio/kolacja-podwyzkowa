import { useState, type SubmitEvent } from "react";
import { readJson, toFailure } from "@/components/hooks/api-failure";
import { isGuestState } from "@/components/hooks/guest-state-store";
import { useGuestState } from "@/components/hooks/useGuestState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guestPhoneMessages } from "@/lib/guest-links/messages";
import { formatAmount, formatAmountInput, parseAmount } from "@/lib/guesses/amount";
import { formatPlaceInput, parsePredictedPlace } from "@/lib/guesses/place";
import type { Locale } from "@/lib/i18n";
import type { GuestStateDto } from "@/types";

interface Props {
  // Guest API base, e.g. "/api/g/<key>".
  apiBase: string;
  initial: GuestStateDto;
  locale: Locale;
}

// The guest's guess of the whole bill (tip included) on the phone (S-06, FR-017, NFR-001): enter it, change it until the
// organizer closes intake, and see ONLY the own guess. Reads the page's shared live state (one poll per phone), so a
// close, a reopen or the organizer typing the guess in for this guest shows up within one poll; a refreshed state
// never overwrites what the guest is typing. Without access (switched off, link revoked) it shows nothing: the seat
// section above already says why. guess-place: an optional second field predicts the guest's own final place
// (1 … number of guests); it is saved together with the amount and changes with it until intake closes.
export function GuestGuessView({ apiBase, initial, locale }: Props) {
  const t = guestPhoneMessages(locale);
  const { state, push, refresh } = useGuestState(apiBase, initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [placeDraft, setPlaceDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [placeProblem, setPlaceProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  if (!state) {
    return null;
  }

  const { intakeOpen, amountGrosze, predictedPlace, maxPlace } = state.guess;
  const formOpen = intakeOpen && (editing || amountGrosze === null);

  function startEditing() {
    setDraft(amountGrosze === null ? "" : formatAmountInput(amountGrosze));
    setPlaceDraft(formatPlaceInput(predictedPlace));
    setProblem(null);
    setPlaceProblem(null);
    setJustSaved(false);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setProblem(null);
    setPlaceProblem(null);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmount(draft, locale);
    const place = parsePredictedPlace(placeDraft, maxPlace, locale);
    setProblem(parsed.ok ? null : parsed.message);
    setPlaceProblem(place.ok ? null : place.message);
    if (!parsed.ok || !place.ok) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${apiBase}/guess`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: formatAmountInput(parsed.grosze), place: formatPlaceInput(place.place) }),
      });
      const data = await readJson(response);
      if (response.ok && isGuestState(data)) {
        push(data);
        setEditing(false);
        setDraft("");
        setPlaceDraft("");
        setJustSaved(true);
        return;
      }
      if (response.status === 404) {
        // Access is gone: the next poll clears the page.
        refresh();
        return;
      }
      // A place above a limit that changed since the last poll is the place field's problem.
      const placeField = typeof data === "object" && data !== null && "field" in data && data.field === "place";
      if (placeField) {
        setPlaceProblem(toFailure(data, locale).message);
        refresh();
      } else {
        setProblem(toFailure(data, locale).message);
      }
      if (response.status === 409) {
        refresh();
      }
    } catch {
      setProblem(t.guessOffline);
    } finally {
      setSaving(false);
    }
  }

  const announcement = !intakeOpen
    ? t.intakeClosed
    : justSaved && amountGrosze !== null
      ? t.guessSaved(formatAmount(amountGrosze), predictedPlace)
      : "";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 p-5">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {!intakeOpen ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{t.intakeClosed}</p>
          {editing && <p className="text-muted-foreground text-sm">{t.notSaved}</p>}
          {amountGrosze === null ? (
            <p className="text-muted-foreground">{t.noGuess}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.yourGuess}</p>
                <p className="text-4xl leading-tight font-bold">{formatAmount(amountGrosze)}</p>
              </div>
              <OwnPlace place={predictedPlace} label={t.yourPlace} none={t.noPlaceClosed} />
            </div>
          )}
          <p className="text-muted-foreground text-sm">{t.resultsByOrganizer}</p>
        </div>
      ) : formOpen ? (
        <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void save(event)}>
          <label htmlFor="guess-amount" className="text-lg font-medium">
            {t.guessLabel}
          </label>
          <p id="guess-hint" className="text-muted-foreground -mt-2 text-sm">
            {t.guessHint}
          </p>
          <div className="relative">
            <Input
              id="guess-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={t.guessPlaceholder}
              // Only when the guest asked to change an existing guess: never pop the keyboard on page load.
              autoFocus={amountGrosze !== null}
              value={draft}
              aria-invalid={problem !== null}
              aria-describedby={problem ? "guess-hint guess-problem" : "guess-hint"}
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
          <label htmlFor="guess-place" className="mt-2 text-lg font-medium">
            {t.placeLabel}
          </label>
          <p id="guess-place-hint" className="text-muted-foreground -mt-2 text-sm">
            {t.placeHint(maxPlace)}
          </p>
          <Input
            id="guess-place"
            name="place"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={`1–${maxPlace}`}
            value={placeDraft}
            aria-invalid={placeProblem !== null}
            aria-describedby={placeProblem ? "guess-place-hint guess-place-problem" : "guess-place-hint"}
            onChange={(event) => {
              setPlaceDraft(event.target.value);
              setEditing(true);
            }}
            className="h-14 w-32 text-2xl md:text-2xl"
          />
          {placeProblem && (
            <p id="guess-place-problem" role="alert" className="text-destructive font-medium">
              {placeProblem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-12 text-base" disabled={saving}>
              {saving ? t.saving : t.saveGuess}
            </Button>
            {editing && amountGrosze !== null && (
              <Button type="button" variant="ghost" className="h-12 text-base" onClick={cancelEditing}>
                {t.cancel}
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{t.onlyYouSeeGuess}</p>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{t.yourGuess}</p>
            <p className="text-4xl leading-tight font-bold">
              {amountGrosze === null ? "" : formatAmount(amountGrosze)}
            </p>
          </div>
          <OwnPlace place={predictedPlace} label={t.yourPlace} none={t.noPlace} />
          {justSaved && (
            <p role="status" className="font-medium text-emerald-700">
              {t.saved}
            </p>
          )}
          <p className="text-muted-foreground text-sm">{t.onlyYouSeeIt}</p>
          <Button type="button" variant="outline" className="h-12 self-start text-base" onClick={startEditing}>
            {t.changeGuess}
          </Button>
        </div>
      )}
    </div>
  );
}

// The guest's own place prediction under their amount, or a line saying there is none.
function OwnPlace({ place, label, none }: { place: number | null; label: string; none: string }) {
  if (place === null) {
    return <p className="text-muted-foreground">{none}</p>;
  }
  return (
    <div>
      <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{label}</p>
      <p className="text-3xl leading-tight font-bold">{place}</p>
    </div>
  );
}
