import { useCallback, useRef, useState } from "react";
import { AmountForm } from "@/components/guesses/AmountForm";
import { RankingReadout } from "@/components/guesses/RankingReadout";
import { RankingTable } from "@/components/guesses/RankingTable";
import { Button } from "@/components/ui/button";
import { formatAmount, parseAmount } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n";
import type { OfflineGuessesEntry } from "@/lib/offline/cache";
import { offlineMessages } from "@/lib/offline/messages";
import { formatSavedAt, offlineRanking } from "@/lib/offline/readout";
import type { GuessRankingDto } from "@/types";

interface Props {
  headingId: string;
  entry: OfflineGuessesEntry | null;
  now: Date;
  locale: Locale;
}

// The guesses and the ranking as saved on this device (S-09, FR-020): intake and the guess count at that time, the
// correct amount, „Czytaj od końca” and the ranking, who was missing. Without a saved correct amount (or to try
// another one) the organizer types it here: the ranking is computed on this device and nothing is sent anywhere.
export function OfflineRanking({ headingId, entry, now, locale }: Props) {
  const t = offlineMessages(locale);
  const [localGrosze, setLocalGrosze] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [readout, setReadout] = useState<GuessRankingDto | null>(null);
  const readoutButton = useRef<HTMLButtonElement>(null);

  const closeReadout = useCallback(() => {
    setReadout(null);
    window.setTimeout(() => readoutButton.current?.focus(), 0);
  }, []);

  if (entry === null) {
    return (
      <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-3">
        <h2 id={headingId} className="text-xl font-semibold">
          {t.guessesHeading}
        </h2>
        <p className="text-muted-foreground text-sm">{t.noSavedGuesses}</p>
      </section>
    );
  }

  const board = entry.data;
  const savedGrosze = board.correctAmountGrosze;
  const ranking = offlineRanking(board, localGrosze);
  const guessCount = board.guests.length - board.missing.length;
  const showForm = editing || (savedGrosze === null && localGrosze === null);

  function applyLocalAmount(amount: string): Promise<boolean> {
    const parsed = parseAmount(amount, locale);
    if (parsed.ok) {
      setLocalGrosze(parsed.grosze);
      setEditing(false);
    }
    return Promise.resolve(parsed.ok);
  }

  return (
    <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {t.guessesHeading}
      </h2>
      <p className="text-muted-foreground text-sm">{formatSavedAt(entry.savedAt, now, locale)}</p>
      <div className="flex flex-col gap-1">
        <p>{t.intake(board.intakeOpen)}</p>
        <p className="text-2xl font-bold">{t.guessCount(guessCount, board.guests.length)}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        {localGrosze !== null ? (
          <>
            <p className="font-medium">{t.localAmount}</p>
            <p className="text-2xl font-bold">{formatAmount(localGrosze)}</p>
            <p className="text-muted-foreground text-sm">{t.localAmountNote}</p>
          </>
        ) : (
          savedGrosze !== null && (
            <>
              <p className="font-medium">{t.savedAmount}</p>
              <p className="text-2xl font-bold">{formatAmount(savedGrosze)}</p>
            </>
          )
        )}
        {showForm ? (
          <>
            <AmountForm
              label={t.localAmount}
              initialGrosze={localGrosze}
              submitLabel={t.computeRanking}
              locale={locale}
              pending={false}
              autoFocus={editing}
              onSubmit={applyLocalAmount}
              onCancel={
                editing
                  ? () => {
                      setEditing(false);
                    }
                  : undefined
              }
            />
            {localGrosze === null && <p className="text-muted-foreground text-sm">{t.localAmountNote}</p>}
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                setEditing(true);
              }}
            >
              {localGrosze === null ? t.otherAmount : t.change}
            </Button>
            {localGrosze !== null && (
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setLocalGrosze(null);
                }}
              >
                {savedGrosze === null ? t.removeAmount : t.backToSaved}
              </Button>
            )}
          </div>
        )}
      </div>

      {ranking === null ? (
        <p className="text-muted-foreground text-sm">{t.rankingAfterAmount}</p>
      ) : ranking.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noGuessesToRank}</p>
      ) : (
        <>
          <Button
            ref={readoutButton}
            type="button"
            className="h-16 text-xl font-bold"
            onClick={() => {
              setReadout(ranking);
            }}
          >
            {t.readFromLast}
          </Button>
          <RankingTable entries={ranking.entries} locale={locale} />
        </>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{t.missingHeading(board.missing.length)}</h3>
        {board.missing.length === 0 ? (
          <p className="text-sm">{board.guests.length === 0 ? t.noGuests : t.everyoneGuessed}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {board.missing.map((guest) => (
              <li key={guest.id} className="rounded-full border px-3 py-1 text-sm">
                {guest.displayName}
                {guest.isAbsent && <span className="text-muted-foreground">{t.absent}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {readout && <RankingReadout ranking={readout} onClose={closeReadout} locale={locale} />}
    </section>
  );
}
