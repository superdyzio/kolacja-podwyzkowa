import { useCallback, useEffect, useRef, useState } from "react";
import { saveOfflineGuesses } from "@/components/hooks/offline-cache-store";
import { useGuessBoard } from "@/components/hooks/useGuessBoard";
import { useOfflineSync } from "@/components/hooks/useOfflineSync";
import { OfflineFallback } from "@/components/offline/OfflineFallback";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
import { guessUiMessages } from "@/lib/guesses/messages";
import { placeLimit } from "@/lib/guesses/place";
import type { Locale } from "@/lib/i18n";
import type { GuessBoardDto, GuessGuestDto, GuessRankingDto } from "@/types";
import { AmountForm } from "./AmountForm";
import { GuessGuestRow } from "./GuessGuestRow";
import { RankingReadout } from "./RankingReadout";
import { RankingTable } from "./RankingTable";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>".
  apiBase: string;
  // Organizer guest list page (when there are no guests yet).
  guestsPath: string;
  initial: GuessBoardDto;
  locale: Locale;
}

function deleteQuestion(guest: GuessGuestDto, locale: Locale): string {
  const amount = guest.amountGrosze === null ? "" : ` (${formatAmount(guest.amountGrosze)})`;
  return guessUiMessages(locale).deleteConfirm(guest.displayName, amount);
}

// Organizer guesses page island (S-06, FR-018..FR-020), ordered for the evening's last act (< 1 minute from closing
// intake to reading the last place): intake, the correct amount, the ranking with „Czytaj od końca”, who is missing,
// then every guest with entering/correcting/deleting a guess for them. The board refreshes every 5 s while visible.
// Every board the server confirms is also saved on this device for the offline readout (S-09).
export function GuessManager({ apiBase, guestsPath, initial, locale }: Props) {
  const t = guessUiMessages(locale);
  const { board, pending, failure, offline, send, dismissFailure } = useGuessBoard(apiBase, initial, locale);
  const { offline: syncOffline } = useOfflineSync(apiBase);
  const [editingGuestId, setEditingGuestId] = useState<number | null>(null);
  const [editingCorrect, setEditingCorrect] = useState(false);
  const [readout, setReadout] = useState<GuessRankingDto | null>(null);
  const readoutButton = useRef<HTMLButtonElement>(null);

  const guessCount = board.guests.length - board.missing.length;
  const showCorrectForm = board.correctAmountGrosze === null || editingCorrect;

  const closeReadout = useCallback(() => {
    setReadout(null);
    window.setTimeout(() => readoutButton.current?.focus(), 0);
  }, []);

  // Each poll and each saved change gives a new board object: „Stan z …” is the time of the last confirmed read.
  useEffect(() => {
    saveOfflineGuesses(apiBase, board, new Date().toISOString());
  }, [apiBase, board]);

  async function toggleIntake() {
    await send({ method: "PATCH", path: "/guesses", body: { intakeOpen: !board.intakeOpen } });
  }

  async function saveCorrect(amount: string): Promise<boolean> {
    const saved = await send({ method: "PATCH", path: "/guesses", body: { correctAmount: amount } });
    if (saved) {
      setEditingCorrect(false);
    }
    return saved;
  }

  async function saveGuess(guest: GuessGuestDto, amount: string, place?: string): Promise<boolean> {
    const saved = await send({ method: "PUT", path: `/guesses/${guest.id}`, body: { amount, place } });
    if (saved) {
      setEditingGuestId(null);
    }
    return saved;
  }

  async function removeGuess(guest: GuessGuestDto) {
    if (!window.confirm(deleteQuestion(guest, locale))) {
      return;
    }
    await send({ method: "DELETE", path: `/guesses/${guest.id}` });
  }

  return (
    <div className="flex flex-col gap-6">
      {failure && (
        <div role="alert" className="border-destructive/50 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-destructive font-medium">{failure.message}</p>
          <Button type="button" variant="ghost" className="h-10 self-start" onClick={dismissFailure}>
            {t.close}
          </Button>
        </div>
      )}
      <OfflineFallback apiBase={apiBase} offline={offline || syncOffline} locale={locale} />

      <section aria-labelledby="intake-heading" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="intake-heading" className="text-lg font-semibold">
          {t.intakeHeading}
        </h2>
        <p aria-live="polite">
          <strong>{board.intakeOpen ? t.intakeOpen : t.intakeClosed}.</strong>{" "}
          <span className="text-muted-foreground">{board.intakeOpen ? t.intakeOpenText : t.intakeClosedText}</span>
        </p>
        <p className="text-2xl font-bold">{t.guessCount(guessCount, board.guests.length)}</p>
        <Button
          type="button"
          variant={board.intakeOpen ? "default" : "outline"}
          className="h-12 self-start text-base"
          disabled={pending}
          onClick={() => void toggleIntake()}
        >
          {board.intakeOpen ? t.closeIntake : t.reopenIntake}
        </Button>
      </section>

      <section aria-labelledby="correct-heading" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="correct-heading" className="text-lg font-semibold">
          {t.correctHeading}
        </h2>
        {showCorrectForm ? (
          <AmountForm
            label={t.correctLabel}
            initialGrosze={board.correctAmountGrosze}
            submitLabel={t.saveCorrect}
            pending={pending}
            autoFocus={editingCorrect}
            onSubmit={saveCorrect}
            onCancel={
              editingCorrect
                ? () => {
                    setEditingCorrect(false);
                  }
                : undefined
            }
            locale={locale}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-2xl font-bold">
              {board.correctAmountGrosze === null ? "" : formatAmount(board.correctAmountGrosze)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={pending}
                onClick={() => {
                  setEditingCorrect(true);
                }}
              >
                {t.change}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive h-10"
                disabled={pending}
                onClick={() => void send({ method: "PATCH", path: "/guesses", body: { correctAmount: null } })}
              >
                {t.remove}
              </Button>
            </div>
          </div>
        )}
        {board.correctAmountGrosze !== null && board.intakeOpen && (
          <p role="note" className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900">
            {t.stillOpenNote}
          </p>
        )}
      </section>

      <section aria-labelledby="ranking-heading" className="flex flex-col gap-3">
        <h2 id="ranking-heading" className="text-lg font-semibold">
          {t.rankingHeading}
        </h2>
        {board.ranking === null ? (
          <p className="text-muted-foreground text-sm">{t.rankingAfterCorrect}</p>
        ) : board.ranking.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.rankingEmpty}</p>
        ) : (
          <>
            <Button
              ref={readoutButton}
              type="button"
              className="h-16 text-xl font-bold"
              onClick={() => {
                setReadout(board.ranking);
              }}
            >
              {t.readFromLast}
            </Button>
            <RankingTable entries={board.ranking.entries} locale={locale} />
          </>
        )}
      </section>

      <section aria-labelledby="missing-heading" className="flex flex-col gap-3">
        <h2 id="missing-heading" className="text-lg font-semibold">
          {t.missingHeading(board.missing.length)}
        </h2>
        {board.guests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.noGuestsYet}{" "}
            <a className="underline" href={guestsPath}>
              {t.addGuests}
            </a>
            {t.noGuestsAfter}
          </p>
        ) : board.missing.length === 0 ? (
          <p className="text-sm">{t.allGuessed}</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {board.missing.map((guest) => (
                <li key={guest.id} className="rounded-full border px-3 py-1 text-sm">
                  {guest.displayName}
                  {guest.isAbsent && <span className="text-muted-foreground">{t.absentSuffix}</span>}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">{t.missingNote}</p>
          </>
        )}
      </section>

      {board.guests.length > 0 && (
        <section aria-labelledby="all-guesses-heading" className="flex flex-col gap-3">
          <h2 id="all-guesses-heading" className="text-lg font-semibold">
            {t.allGuestsHeading(board.guests.length)}
          </h2>
          <ul className="flex flex-col gap-2">
            {board.guests.map((guest) => (
              <GuessGuestRow
                key={guest.id}
                guest={guest}
                maxPlace={placeLimit(board.guests.length)}
                editing={editingGuestId === guest.id}
                pending={pending}
                onEdit={() => {
                  setEditingGuestId(guest.id);
                }}
                onCancel={() => {
                  setEditingGuestId(null);
                }}
                onSave={(amount, place) => saveGuess(guest, amount, place)}
                onDelete={() => void removeGuess(guest)}
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}

      {readout && <RankingReadout ranking={readout} onClose={closeReadout} locale={locale} />}
    </div>
  );
}
