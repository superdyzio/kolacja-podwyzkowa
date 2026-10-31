import type { TvSpotlightControls } from "@/components/hooks/useTvSpotlight";
import { Button } from "@/components/ui/button";
import { describeTvSpotlight } from "@/lib/tv-spotlight/rules";

interface Props {
  tv: TvSpotlightControls;
}

// The organizer's TV controls on the questions page (tv-spotlight): what the TV shows now, drawing a present guest
// onto the TV (the TV spins through the names, then reveals), and back to the plan. Questions and AI topics go to the
// TV with „Pokaż na TV” under them (ShowOnTvButton).
export function TvSpotlightPanel({ tv }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="font-medium break-words">
        {describeTvSpotlight(tv.spotlight)}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="h-14 text-lg sm:flex-1"
          disabled={tv.pending}
          onClick={() => void tv.drawPerson()}
        >
          {tv.spotlight?.kind === "person" ? "Wylosuj kolejną osobę" : "Wylosuj osobę na TV"}
        </Button>
        {tv.spotlight && (
          <Button
            type="button"
            variant="outline"
            className="h-14 text-lg sm:flex-1"
            disabled={tv.pending}
            onClick={() => void tv.hide()}
          >
            Schowaj z TV
          </Button>
        )}
      </div>
      {tv.failure && (
        <p role="alert" className="text-destructive font-medium">
          {tv.failure.message}
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        Losujemy spośród obecnych gości. Pytanie albo temat od AI wyślesz na TV przyciskiem „Pokaż na TV” pod nim —
        zostaje tam, dopóki go nie schowasz albo nie pokażesz czegoś innego.
      </p>
    </div>
  );
}
