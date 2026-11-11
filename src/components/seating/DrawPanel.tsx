import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { seatingEditorMessages } from "@/lib/seating/messages";
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
  // event-modules (S-17): the seating draw module is on (off: no draw button and no repeat stats; going back stays).
  drawEnabled?: boolean;
  pending: boolean;
  drawing: boolean;
  onDraw: () => void;
  onDiscard: () => void;
  onRestorePrevious: () => void;
  locale: Locale;
}

const wrapping = "h-auto min-h-10 whitespace-normal text-left";

function statsLine(
  repeats: number,
  snapshotCount: number,
  upToDate: boolean,
  published: boolean,
  locale: Locale,
): string {
  const t = seatingEditorMessages(locale);
  if (snapshotCount === 0) {
    return t.noHistory;
  }
  // Right after a publish every pair of the arrangement is in the history by definition; counting them says nothing.
  if (upToDate && published) {
    return t.onTvNow;
  }
  return repeats === 0 ? t.noRepeats(formatRepeatCount(0, locale)) : t.repeats(formatRepeatCount(repeats, locale));
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
  drawEnabled = true,
  pending,
  drawing,
  onDraw,
  onDiscard,
  onRestorePrevious,
  locale,
}: Props) {
  const t = seatingEditorMessages(locale);
  const showPairs = snapshotCount > 0 && !(upToDate && published !== null) && repeats.length > 0;
  return (
    <section aria-labelledby="draw-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <h2 id="draw-heading" className="font-semibold">
          {t.drawHeading}
        </h2>
        <p className="text-muted-foreground text-xs">{t.drawRules}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {drawEnabled && (
          <Button type="button" className="h-10" disabled={pending || !canDraw} onClick={onDraw} data-draw-button>
            {drawing ? t.drawing : drawn ? t.redraw : t.draw}
          </Button>
        )}
        {published !== null && !upToDate && (
          <Button type="button" variant="outline" className={wrapping} disabled={pending} onClick={onDiscard}>
            {t.discardChanges}
          </Button>
        )}
        {previous !== null && (
          <Button type="button" variant="outline" className={wrapping} disabled={pending} onClick={onRestorePrevious}>
            {t.restorePrevious(formatPublishedAt(previous.publishedAt, locale))}
          </Button>
        )}
      </div>

      {drawEnabled && (
        <div aria-live="polite" className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {statsLine(repeats.length, snapshotCount, upToDate, published !== null, locale)}
          </p>
          {showPairs && (
            <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
              {repeats.map((pair) => (
                <li key={`${pair.guestIds[0]}-${pair.guestIds[1]}`}>{describeRepeat(pair, locale)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {drawEnabled && <p className="text-muted-foreground text-xs">{formatHistoryCount(snapshotCount, locale)}</p>}
    </section>
  );
}
