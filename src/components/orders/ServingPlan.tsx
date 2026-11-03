import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import type { Locale } from "@/lib/i18n";
import { servingMessages } from "@/lib/orders/messages";
import { describeSelection, markedTables, type ResolvedSelection, type ServingLine } from "@/lib/orders/serving";
import { cn } from "@/lib/utils";
import { planImagePath } from "@/lib/venue/pin";
import type { TvSeatingDto } from "@/types";

interface Props {
  // API base of the page's link ("/api/r/<key>" or "/api/o/<key>"): the plan image only gives the aspect ratio.
  apiBase: string;
  seating: TvSeatingDto;
  // Tables that have something to serve; the others are faded.
  servingTables: ReadonlySet<string>;
  selection: ResolvedSelection<ServingLine> | null;
  onClear: () => void;
  locale: Locale;
  className?: string;
}

// Without a plan image (or until it has loaded) the drawing stands on a 16:9 stage (as on the TV).
const BLANK_ASPECT = 16 / 9;

// The plan of the order pages (serving-highlight): the venue drawn from the PUBLISHED seating with the names at the
// chairs, and the places of what is picked in the lists lit up (chairs, or the middle of a table, with the pieces'
// numbers); the caption says it in words. While something is picked, only the tables it touches stay bright.
export function ServingPlan({ apiBase, seating, servingTables, selection, onClear, locale, className }: Props) {
  const t = servingMessages(locale);
  const [loaded, setLoaded] = useState<{ version: number; aspect: number } | null>(null);
  const aspect = loaded !== null && loaded.version === seating.planVersion ? loaded.aspect : BLANK_ASPECT;
  const marks = selection?.marks;

  const tables = useMemo((): VenueDrawingTable[] => {
    const bright = marks ? markedTables(marks) : servingTables;
    return seating.tables.map((table, index) => ({
      ...table,
      key: `${String(index).padStart(3, "0")} ${table.name}`,
      muted: !bright.has(table.name),
    }));
  }, [seating.tables, servingTables, marks]);

  function readNatural(img: HTMLImageElement | null) {
    const version = seating.planVersion;
    if (version !== null && img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setLoaded((previous) =>
        previous?.version === version && previous.aspect === ratio ? previous : { version, aspect: ratio },
      );
    }
  }

  return (
    <section aria-labelledby="serving-plan-heading" className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="serving-plan-heading" className="text-xl font-semibold">
          {t.planHeading}
        </h2>
        {selection && (
          <Button type="button" variant="outline" className="h-10" onClick={onClear}>
            {t.clear}
          </Button>
        )}
      </div>
      <div aria-live="polite" className="min-h-6">
        {selection ? (
          <p className="text-base font-semibold text-red-700 dark:text-red-400">
            {describeSelection(selection, locale)}
            {selection.kind === "dish" && selection.instance === null && selection.offPlan > 0 && (
              <span className="text-muted-foreground block text-sm font-normal">{t.offPlan(selection.offPlan)}</span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t.hint}</p>
        )}
      </div>
      {seating.publishedAt === null ? (
        <p className="text-muted-foreground">{t.seatingNotReady}</p>
      ) : (
        <div className="bg-background rounded-xl border p-2">
          {seating.planVersion !== null && (
            <img
              key={seating.planVersion}
              ref={readNatural}
              src={planImagePath(apiBase, seating.planVersion)}
              alt=""
              aria-hidden
              onLoad={(event) => {
                readNatural(event.currentTarget);
              }}
              className="hidden"
            />
          )}
          <VenueDrawing
            aspect={aspect}
            chairPitch={seating.chairPitch}
            rooms={seating.rooms}
            tables={tables}
            marks={marks}
            variant="phone"
            label={t.planLabel}
            locale={locale}
            className="h-auto max-h-[40vh] w-full lg:max-h-[75vh]"
          />
        </div>
      )}
    </section>
  );
}
