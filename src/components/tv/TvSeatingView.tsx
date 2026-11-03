import { useMemo, useState } from "react";
import { useTvSeating } from "@/components/hooks/useTvSeating";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import type { Locale } from "@/lib/i18n";
import { tvScreenMessages } from "@/lib/tv-spotlight/messages";
import { planImagePath } from "@/lib/venue/pin";
import type { TvScreenDto } from "@/types";
import { TvSpotlight } from "./TvSpotlight";

interface Props {
  // TV API base, e.g. "/api/tv/<key>".
  apiBase: string;
  initial: TvScreenDto;
  eventName: string;
  locale: Locale;
}

// Without a plan image (or until it has loaded) the drawing stands on a 16:9 stage.
const BLANK_ASPECT = 16 / 9;

// The read-only TV screen (FR-008, NFR-003, NFR-006): the venue drawn from the PUBLISHED snapshot — room outlines,
// tables with their chairs and every seated name at its chair (venue-drawing) — fitted to the screen and refreshed by
// polling. The plan photo is never shown: it is loaded hidden only for its aspect ratio (the drawing's coordinates
// are fractions of it). On its own layer above (also before the first publish): what the organizer put on the TV
// (tv-spotlight).
export function TvSeatingView({ apiBase, initial, eventName, locale }: Props) {
  const t = tvScreenMessages(locale);
  const { tv, offline, updates } = useTvSeating(apiBase, initial);
  // A drawn guest spins only when the draw happens while this page runs, never for what was on the TV at load.
  const [loadedShownAt] = useState(initial.spotlight?.shownAt ?? null);
  const seatedNames = useMemo(() => tv.tables.flatMap((table) => table.seats.map((seat) => seat.name)), [tv.tables]);
  // The plan image's aspect ratio, tagged with its plan version (a replaced plan waits for its own).
  const [loaded, setLoaded] = useState<{ version: number; aspect: number } | null>(null);
  const aspect = loaded !== null && loaded.version === tv.planVersion ? loaded.aspect : BLANK_ASPECT;

  const tables = useMemo(
    (): VenueDrawingTable[] =>
      tv.tables.map((table, index) => ({ ...table, key: `${String(index).padStart(3, "0")} ${table.name}` })),
    [tv.tables],
  );

  // The image may finish loading before the page is interactive (no onLoad then): read it when it mounts, too.
  function readNatural(img: HTMLImageElement | null) {
    const version = tv.planVersion;
    if (version !== null && img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setLoaded((previous) =>
        previous?.version === version && previous.aspect === ratio ? previous : { version, aspect: ratio },
      );
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {tv.publishedAt === null ? (
        <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[4vh] text-center">
          <h1 className="text-[7vh] leading-tight font-bold">{eventName}</h1>
          <p className="text-[3.5vh] text-neutral-300">{t.notPublished}</p>
        </div>
      ) : (
        <>
          <h1 className="sr-only">{t.seatingHeading(eventName)}</h1>
          {tv.planVersion !== null && (
            <img
              key={tv.planVersion}
              ref={readNatural}
              src={planImagePath(apiBase, tv.planVersion)}
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
            chairPitch={tv.chairPitch}
            rooms={tv.rooms}
            tables={tables}
            variant="tv"
            label={t.planLabel}
            locale={locale}
            className="absolute inset-0 h-full w-full p-[1.5vh]"
          />
        </>
      )}
      {tv.spotlight && (
        <TvSpotlight
          key={tv.spotlight.shownAt}
          spotlight={tv.spotlight}
          pool={seatedNames}
          spin={tv.spotlight.shownAt !== loadedShownAt}
          locale={locale}
        />
      )}
      {offline && (
        <p
          role="status"
          className="absolute right-[1.5vh] bottom-[1.5vh] z-30 rounded-[0.8vh] bg-black/75 px-[1.2vh] py-[0.6vh] text-[1.8vh] text-neutral-200"
        >
          {t.offline}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {updates > 0 ? t.updated : ""}
      </p>
    </div>
  );
}
