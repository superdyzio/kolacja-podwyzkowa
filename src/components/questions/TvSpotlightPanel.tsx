import type { TvSpotlightControls } from "@/components/hooks/useTvSpotlight";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { tvSpotlightMessages } from "@/lib/tv-spotlight/messages";
import { describeTvSpotlight } from "@/lib/tv-spotlight/rules";

interface Props {
  tv: TvSpotlightControls;
  locale: Locale;
}

// The organizer's TV controls on the questions page (tv-spotlight): what the TV shows now, drawing a present guest
// onto the TV (the TV spins through the names, then reveals), and back to the plan. Questions and AI topics go to the
// TV with „Pokaż na TV” under them (ShowOnTvButton).
export function TvSpotlightPanel({ tv, locale }: Props) {
  const t = tvSpotlightMessages(locale);
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="font-medium break-words">
        {describeTvSpotlight(tv.spotlight, locale)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="h-14 text-lg sm:flex-1"
          disabled={tv.pending}
          onClick={() => void tv.drawPerson()}
        >
          {tv.spotlight?.kind === "person" ? t.drawAnother : t.drawPerson}
        </Button>
        {tv.spotlight && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-lg sm:flex-1"
            disabled={tv.pending}
            onClick={() => void tv.hide()}
          >
            {t.hide}
          </Button>
        )}
      </div>
      {tv.failure && (
        <p role="alert" className="text-destructive font-medium">
          {tv.failure.message}
        </p>
      )}
      <p className="text-muted-foreground text-sm">{t.panelHint}</p>
    </div>
  );
}
