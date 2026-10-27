import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeDifference, formatAmount } from "@/lib/guesses/amount";
import { placesFromLast } from "@/lib/guesses/ranking";
import { pluralPl } from "@/lib/guests/summary";
import type { GuessRankingDto } from "@/types";

interface Props {
  // A frozen copy taken when the readout was opened: board refreshes never shift the steps.
  ranking: GuessRankingDto;
  onClose: () => void;
}

// "Czytaj od końca" (S-06, FR-020): the ranking read aloud from the LAST place on the organizer's phone, one place
// per step, tied guests together, big enough to read at arm's length. „Dalej” (or →, Space, Enter) moves on,
// „Wstecz” (←) goes back, „Zamknij” (Esc) closes; after the winner „Dalej” becomes „Zakończ”.
export function RankingReadout({ ranking, onClose }: Props) {
  const [steps] = useState(() => placesFromLast(ranking));
  const [index, setIndex] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const step = steps.at(index);
  const last = index === steps.length - 1;

  useEffect(() => {
    nextButton.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Enter and Space on a focused button already click it.
      const onButton = event.target instanceof HTMLButtonElement;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight" || ((event.key === " " || event.key === "Enter") && !onButton)) {
        event.preventDefault();
        if (last) {
          onClose();
        } else {
          setIndex((current) => Math.min(current + 1, steps.length - 1));
        }
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(current - 1, 0));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [last, onClose, steps.length]);

  if (!step) {
    return null;
  }

  const winners = step.place === 1;
  const title = winners ? (step.entries.length > 1 ? "Zwycięzcy!" : "Zwycięzca!") : `Miejsce ${step.place}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="readout-title"
      className="bg-background fixed inset-0 z-50 flex flex-col"
    >
      <header className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
        <div className="flex min-w-0 flex-col">
          <p className="text-muted-foreground text-sm">
            Krok {index + 1} z {steps.length}
          </p>
          <p className="truncate font-semibold sm:text-lg">
            Prawidłowa kwota: {formatAmount(ranking.correctAmountGrosze)}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={onClose}>
          Zamknij
        </Button>
      </header>

      <div aria-live="polite" className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
        <div className="flex flex-col gap-2">
          <h2 id="readout-title" className="text-5xl leading-none font-black tracking-tight sm:text-8xl">
            {title}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-2xl font-semibold sm:text-3xl">
            {winners && <span>Miejsce 1</span>}
            {step.tied && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xl text-amber-900 sm:text-2xl">
                remis: {step.entries.length} {pluralPl(step.entries.length, "osoba", "osoby", "osób")}
              </span>
            )}
          </p>
        </div>
        <ul className="flex flex-col gap-6">
          {step.entries.map((entry) => (
            <li key={entry.guestId} className="flex flex-col gap-1">
              <p className="text-[2.75rem] leading-tight font-bold break-words sm:text-6xl">{entry.displayName}</p>
              <p className="text-2xl sm:text-3xl">
                strzał: <strong>{formatAmount(entry.amountGrosze)}</strong>
              </p>
              <p className="text-muted-foreground text-xl sm:text-2xl">{describeDifference(entry.differenceGrosze)}</p>
              {entry.isAbsent && <p className="text-muted-foreground text-lg">nieobecny</p>}
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex gap-3 border-t p-3 sm:p-4">
        <Button
          type="button"
          variant="outline"
          className="h-20 px-5 text-xl"
          disabled={index === 0}
          onClick={() => {
            setIndex((current) => Math.max(current - 1, 0));
          }}
        >
          Wstecz
        </Button>
        <Button
          ref={nextButton}
          type="button"
          className="h-20 flex-1 text-3xl font-bold"
          onClick={() => {
            if (last) {
              onClose();
            } else {
              setIndex((current) => Math.min(current + 1, steps.length - 1));
            }
          }}
        >
          {last ? "Zakończ" : "Dalej"}
        </Button>
      </footer>
    </div>
  );
}
