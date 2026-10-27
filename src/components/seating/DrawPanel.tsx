import { Button } from "@/components/ui/button";
import { describeRepeat, formatHistoryCount, formatRepeatCount, type RepeatedPair } from "@/lib/seating/neighbours";
import { formatPublishedAt } from "@/lib/seating/rules";
import type { PublicationDto } from "@/types";

interface Props {
  // Repeated neighbour pairs of the working arrangement against every published one.
  repeats: RepeatedPair[];
  snapshotCount: number;
  published: PublicationDto | null;
  previous: PublicationDto | null;
  upToDate: boolean;
  // The working arrangement is an untouched draw (the button says „Losuj ponownie”).
  drawn: boolean;
  canDraw: boolean;
  pending: boolean;
  drawing: boolean;
  onDraw: () => void;
  onDiscard: () => void;
  onRestorePrevious: () => void;
}

const wrapping = "h-auto min-h-10 whitespace-normal text-left";

function statsLine(repeats: number, snapshotCount: number, upToDate: boolean, published: boolean): string {
  if (snapshotCount === 0) {
    return "Brak historii — to będzie pierwszy opublikowany rozkład.";
  }
  // Right after a publish every pair of the arrangement is in the history by definition; counting them says nothing.
  if (upToDate && published) {
    return "Na TV jest ten rozkład. Wylosuj projekt, żeby zmienić sąsiadów.";
  }
  return repeats === 0
    ? `${formatRepeatCount(0)}. Nikt nie siedzi obok tych samych osób co wcześniej.`
    : `${formatRepeatCount(repeats)}:`;
}

// Draw (FR-009) and going back (FR-010): draw a draft, redraw, see how many neighbour pairs repeat, discard the
// draft or restore the previous published arrangement. Publishing stays in the publish bar.
export function DrawPanel({
  repeats,
  snapshotCount,
  published,
  previous,
  upToDate,
  drawn,
  canDraw,
  pending,
  drawing,
  onDraw,
  onDiscard,
  onRestorePrevious,
}: Props) {
  const showPairs = snapshotCount > 0 && !(upToDate && published !== null) && repeats.length > 0;
  return (
    <section aria-labelledby="draw-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <h2 id="draw-heading" className="font-semibold">
          Losowanie
        </h2>
        <p className="text-muted-foreground text-xs">
          Grupy razem na kolejnych miejscach, przypięci zostają, nieobecni bez miejsca, jak najmniej tych samych
          sąsiadów.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" disabled={pending || !canDraw} onClick={onDraw}>
          {drawing ? "Losuję…" : drawn ? "Losuj ponownie" : "Wylosuj projekt"}
        </Button>
        {published !== null && !upToDate && (
          <Button type="button" variant="outline" className={wrapping} disabled={pending} onClick={onDiscard}>
            Odrzuć zmiany — wróć do tego, co jest na TV
          </Button>
        )}
        {previous !== null && (
          <Button type="button" variant="outline" className={wrapping} disabled={pending} onClick={onRestorePrevious}>
            Wróć do poprzedniego rozkładu (z {formatPublishedAt(previous.publishedAt)})
          </Button>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-sm font-medium">{statsLine(repeats.length, snapshotCount, upToDate, published !== null)}</p>
        {showPairs && (
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
            {repeats.map((pair) => (
              <li key={`${pair.guestIds[0]}-${pair.guestIds[1]}`}>{describeRepeat(pair)}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-muted-foreground text-xs">{formatHistoryCount(snapshotCount)}</p>
    </section>
  );
}
