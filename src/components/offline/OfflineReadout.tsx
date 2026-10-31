import { useId } from "react";
import { useOfflineCache } from "@/components/hooks/offline-cache-store";
import { Button } from "@/components/ui/button";
import { NO_OFFLINE_STATE, OFFLINE_READOUT_BANNER } from "@/lib/offline/readout";
import { OfflineRanking } from "./OfflineRanking";
import { OfflineSeating } from "./OfflineSeating";

interface Props {
  // Organizer API base, e.g. "/api/o/<key>" (only to pick this link's saved state).
  apiBase: string;
  offline: boolean;
}

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

// The organizer's last saved state (S-09, NFR-004): the published seating and the guesses with the ranking, read from
// this device's memory. Nothing is read in the server render (the page HTML never carries the saved state).
export function OfflineReadout({ apiBase, offline }: Props) {
  const cache = useOfflineCache(apiBase);
  const seatingId = useId();
  const guessesId = useId();

  if (cache === undefined) {
    return <p className="text-muted-foreground">Wczytuję zapisany stan…</p>;
  }

  const { seating, guesses } = cache;
  // Read when rendered; only "is it today" and the clock of the saved times depend on it.
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {offline && (
        <p role="status" className="rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900">
          {OFFLINE_READOUT_BANNER}
        </p>
      )}
      {seating === null && guesses === null ? (
        <p className="rounded-xl border border-dashed p-4">{NO_OFFLINE_STATE}</p>
      ) : (
        <>
          <nav aria-label="Części zapisanego stanu" className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                scrollToHeading(seatingId);
              }}
            >
              Rozsadzenie
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                scrollToHeading(guessesId);
              }}
            >
              Strzały i ranking
            </Button>
          </nav>
          <OfflineSeating headingId={seatingId} entry={seating} now={now} />
          <OfflineRanking headingId={guessesId} entry={guesses} now={now} />
        </>
      )}
    </div>
  );
}
