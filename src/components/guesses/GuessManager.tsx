import { useCallback, useEffect, useRef, useState } from "react";
import { saveOfflineGuesses } from "@/components/hooks/offline-cache-store";
import { useGuessBoard } from "@/components/hooks/useGuessBoard";
import { useOfflineSync } from "@/components/hooks/useOfflineSync";
import { OfflineFallback } from "@/components/offline/OfflineFallback";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/guesses/amount";
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
}

function deleteQuestion(guest: GuessGuestDto): string {
  const amount = guest.amountGrosze === null ? "" : ` (${formatAmount(guest.amountGrosze)})`;
  return `Usunąć strzał „${guest.displayName}”${amount}? Gość będzie mógł oddać nowy, dopóki przyjmowanie jest otwarte.`;
}

// Organizer guesses page island (S-06, FR-018..FR-020), ordered for the evening's last act (< 1 minute from closing
// intake to reading the last place): intake, the correct amount, the ranking with „Czytaj od końca”, who is missing,
// then every guest with entering/correcting/deleting a guess for them. The board refreshes every 5 s while visible.
// Every board the server confirms is also saved on this device for the offline readout (S-09).
export function GuessManager({ apiBase, guestsPath, initial }: Props) {
  const { board, pending, failure, offline, send, dismissFailure } = useGuessBoard(apiBase, initial);
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

  async function saveGuess(guest: GuessGuestDto, amount: string): Promise<boolean> {
    const saved = await send({ method: "PUT", path: `/guesses/${guest.id}`, body: { amount } });
    if (saved) {
      setEditingGuestId(null);
    }
    return saved;
  }

  async function removeGuess(guest: GuessGuestDto) {
    if (!window.confirm(deleteQuestion(guest))) {
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
            Zamknij
          </Button>
        </div>
      )}
      <OfflineFallback apiBase={apiBase} offline={offline || syncOffline} />

      <section aria-labelledby="intake-heading" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="intake-heading" className="text-lg font-semibold">
          Przyjmowanie strzałów
        </h2>
        <p aria-live="polite">
          <strong>{board.intakeOpen ? "Otwarte" : "Zamknięte"}.</strong>{" "}
          <span className="text-muted-foreground">
            {board.intakeOpen
              ? "Goście wpisują i zmieniają strzały na swoich telefonach."
              : "Goście widzą tylko swój strzał. Ty nadal możesz wpisywać i poprawiać strzały za gości."}
          </span>
        </p>
        <p className="text-2xl font-bold">
          Strzały: {guessCount} z {board.guests.length}
        </p>
        <Button
          type="button"
          variant={board.intakeOpen ? "default" : "outline"}
          className="h-12 self-start text-base"
          disabled={pending}
          onClick={() => void toggleIntake()}
        >
          {board.intakeOpen ? "Zamknij przyjmowanie" : "Otwórz ponownie"}
        </Button>
      </section>

      <section aria-labelledby="correct-heading" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="correct-heading" className="text-lg font-semibold">
          Prawidłowa kwota
        </h2>
        {showCorrectForm ? (
          <AmountForm
            label="Ile kosztowała cała kolacja?"
            initialGrosze={board.correctAmountGrosze}
            submitLabel="Zapisz prawidłową kwotę"
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
                Zmień
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive h-10"
                disabled={pending}
                onClick={() => void send({ method: "PATCH", path: "/guesses", body: { correctAmount: null } })}
              >
                Usuń
              </Button>
            </div>
          </div>
        )}
        {board.correctAmountGrosze !== null && board.intakeOpen && (
          <p role="note" className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900">
            Goście nadal mogą zmieniać strzały — ranking może się zmienić. Zamknij przyjmowanie przed odczytem.
          </p>
        )}
      </section>

      <section aria-labelledby="ranking-heading" className="flex flex-col gap-3">
        <h2 id="ranking-heading" className="text-lg font-semibold">
          Ranking
        </h2>
        {board.ranking === null ? (
          <p className="text-muted-foreground text-sm">Ranking pojawi się po wpisaniu prawidłowej kwoty.</p>
        ) : board.ranking.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">Brak strzałów do rankingu.</p>
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
              Czytaj od końca
            </Button>
            <RankingTable entries={board.ranking.entries} />
          </>
        )}
      </section>

      <section aria-labelledby="missing-heading" className="flex flex-col gap-3">
        <h2 id="missing-heading" className="text-lg font-semibold">
          Brakuje strzałów ({board.missing.length})
        </h2>
        {board.guests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nie ma jeszcze gości.{" "}
            <a className="underline" href={guestsPath}>
              Dodaj gości
            </a>
            , a pojawią się tutaj.
          </p>
        ) : board.missing.length === 0 ? (
          <p className="text-sm">Wszyscy goście oddali strzał.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {board.missing.map((guest) => (
                <li key={guest.id} className="rounded-full border px-3 py-1 text-sm">
                  {guest.displayName}
                  {guest.isAbsent && <span className="text-muted-foreground"> · nieobecny</span>}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Jeśli jesteś na liście gości, Ty nie strzelasz — zostaniesz tutaj. Strzał gościa bez telefonu wpisz
              poniżej.
            </p>
          </>
        )}
      </section>

      {board.guests.length > 0 && (
        <section aria-labelledby="all-guesses-heading" className="flex flex-col gap-3">
          <h2 id="all-guesses-heading" className="text-lg font-semibold">
            Wszyscy goście ({board.guests.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {board.guests.map((guest) => (
              <GuessGuestRow
                key={guest.id}
                guest={guest}
                editing={editingGuestId === guest.id}
                pending={pending}
                onEdit={() => {
                  setEditingGuestId(guest.id);
                }}
                onCancel={() => {
                  setEditingGuestId(null);
                }}
                onSave={(amount) => saveGuess(guest, amount)}
                onDelete={() => void removeGuess(guest)}
              />
            ))}
          </ul>
        </section>
      )}

      {readout && <RankingReadout ranking={readout} onClose={closeReadout} />}
    </div>
  );
}
