import { useCallback, useRef, useState } from "react";
import { AmountForm } from "@/components/guesses/AmountForm";
import { RankingReadout } from "@/components/guesses/RankingReadout";
import { RankingTable } from "@/components/guesses/RankingTable";
import { Button } from "@/components/ui/button";
import { formatAmount, parseAmount } from "@/lib/guesses/amount";
import type { OfflineGuessesEntry } from "@/lib/offline/cache";
import { LOCAL_AMOUNT_NOTE, formatSavedAt, offlineRanking } from "@/lib/offline/readout";
import type { GuessRankingDto } from "@/types";

interface Props {
  headingId: string;
  entry: OfflineGuessesEntry | null;
  now: Date;
}

// The guesses and the ranking as saved on this device (S-09, FR-020): intake and the guess count at that time, the
// correct amount, „Czytaj od końca” and the ranking, who was missing. Without a saved correct amount (or to try
// another one) the organizer types it here: the ranking is computed on this device and nothing is sent anywhere.
export function OfflineRanking({ headingId, entry, now }: Props) {
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
          Strzały i ranking
        </h2>
        <p className="text-muted-foreground text-sm">Na tym urządzeniu nie ma zapisanych strzałów.</p>
      </section>
    );
  }

  const board = entry.data;
  const savedGrosze = board.correctAmountGrosze;
  const ranking = offlineRanking(board, localGrosze);
  const guessCount = board.guests.length - board.missing.length;
  const showForm = editing || (savedGrosze === null && localGrosze === null);

  function applyLocalAmount(amount: string): Promise<boolean> {
    const parsed = parseAmount(amount);
    if (parsed.ok) {
      setLocalGrosze(parsed.grosze);
      setEditing(false);
    }
    return Promise.resolve(parsed.ok);
  }

  return (
    <section aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        Strzały i ranking
      </h2>
      <p className="text-muted-foreground text-sm">{formatSavedAt(entry.savedAt, now)}</p>
      <div className="flex flex-col gap-1">
        <p>Przyjmowanie strzałów było {board.intakeOpen ? "otwarte" : "zamknięte"}.</p>
        <p className="text-2xl font-bold">
          Strzały: {guessCount} z {board.guests.length}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        {localGrosze !== null ? (
          <>
            <p className="font-medium">Prawidłowa kwota (tylko na tym urządzeniu)</p>
            <p className="text-2xl font-bold">{formatAmount(localGrosze)}</p>
            <p className="text-muted-foreground text-sm">{LOCAL_AMOUNT_NOTE}</p>
          </>
        ) : (
          savedGrosze !== null && (
            <>
              <p className="font-medium">Prawidłowa kwota</p>
              <p className="text-2xl font-bold">{formatAmount(savedGrosze)}</p>
            </>
          )
        )}
        {showForm ? (
          <>
            <AmountForm
              label="Prawidłowa kwota (tylko na tym urządzeniu)"
              initialGrosze={localGrosze}
              submitLabel="Policz ranking"
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
            {localGrosze === null && <p className="text-muted-foreground text-sm">{LOCAL_AMOUNT_NOTE}</p>}
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
              {localGrosze === null ? "Policz z inną kwotą" : "Zmień"}
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
                {savedGrosze === null ? "Usuń kwotę" : "Wróć do zapisanej kwoty"}
              </Button>
            )}
          </div>
        )}
      </div>

      {ranking === null ? (
        <p className="text-muted-foreground text-sm">Ranking pojawi się po wpisaniu prawidłowej kwoty.</p>
      ) : ranking.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Brak strzałów do rankingu.</p>
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
            Czytaj od końca
          </Button>
          <RankingTable entries={ranking.entries} />
        </>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Brakuje strzałów ({board.missing.length})</h3>
        {board.missing.length === 0 ? (
          <p className="text-sm">
            {board.guests.length === 0 ? "Nie było jeszcze gości." : "Wszyscy goście oddali strzał."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {board.missing.map((guest) => (
              <li key={guest.id} className="rounded-full border px-3 py-1 text-sm">
                {guest.displayName}
                {guest.isAbsent && <span className="text-muted-foreground"> · nieobecny</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {readout && <RankingReadout ranking={readout} onClose={closeReadout} />}
    </section>
  );
}
