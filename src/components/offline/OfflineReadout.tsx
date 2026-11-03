import { useId } from "react";
import { useOfflineCache } from "@/components/hooks/offline-cache-store";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import { offlineMessages } from "@/lib/offline/messages";
import { OfflineRanking } from "./OfflineRanking";
import { OfflineSeating } from "./OfflineSeating";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>" (only to pick this link's saved state).
  apiBase: string;
  offline: boolean;
  locale: Locale;
}

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

// The organizer's last saved state (S-09, NFR-004): the published seating and the guesses with the ranking, read from
// this device's memory. Nothing is read in the server render (the page HTML never carries the saved state).
export function OfflineReadout({ apiBase, offline, locale }: Props) {
  const t = offlineMessages(locale);
  const cache = useOfflineCache(apiBase);
  const seatingId = useId();
  const guessesId = useId();

  if (cache === undefined) {
    return <p className="text-muted-foreground">{t.loading}</p>;
  }

  const { seating, guesses } = cache;
  // Read when rendered; only "is it today" and the clock of the saved times depend on it.
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {offline && (
        <p role="status" className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900">
          {t.readoutBanner}
        </p>
      )}
      {seating === null && guesses === null ? (
        <p className="rounded-xl border border-dashed p-4">{t.noState}</p>
      ) : (
        <>
          <nav aria-label={t.partsNav} className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                scrollToHeading(seatingId);
              }}
            >
              {t.seatingButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                scrollToHeading(guessesId);
              }}
            >
              {t.guessesButton}
            </Button>
          </nav>
          <OfflineSeating headingId={seatingId} entry={seating} now={now} locale={locale} />
          <OfflineRanking headingId={guessesId} entry={guesses} now={now} locale={locale} />
        </>
      )}
    </div>
  );
}
