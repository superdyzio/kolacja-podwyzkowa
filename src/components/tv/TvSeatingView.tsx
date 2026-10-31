import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTvSeating } from "@/components/hooks/useTvSeating";
import { containBox, layoutCards, type Size } from "@/lib/seating/tv-layout";
import { cn } from "@/lib/utils";
import { planImagePath } from "@/lib/venue/pin";
import type { TvScreenDto } from "@/types";
import { TableCard } from "./TableCard";
import { TvSpotlight } from "./TvSpotlight";

interface Props {
  // TV API base, e.g. "/api/tv/<key>".
  apiBase: string;
  initial: TvScreenDto;
  eventName: string;
}

// Without a plan image the tables stand on a blank 16:9 stage.
const BLANK_STAGE: Size = { width: 16, height: 9 };

function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
  };
}

function windowSize(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function noWindow(): string {
  return "0x0";
}

function parseSize(value: string): Size {
  const [width, height] = value.split("x").map(Number);
  return { width, height };
}

// Stable, unique card ids in the TV's table order.
function cardId(index: number, name: string): string {
  return `${String(index).padStart(3, "0")} ${name}`;
}

// The read-only TV screen (FR-008, NFR-003, NFR-006): the whole plan fitted to the screen, a card with the seated
// names next to each table pin, refreshed by polling. Shows only the PUBLISHED arrangement — and, on its own layer
// above it (also before the first publish), what the organizer put on the TV (tv-spotlight).
export function TvSeatingView({ apiBase, initial, eventName }: Props) {
  const { tv, offline, updates } = useTvSeating(apiBase, initial);
  // A drawn guest spins only when the draw happens while this page runs, never for what was on the TV at load.
  const [loadedShownAt] = useState(initial.spotlight?.shownAt ?? null);
  const seatedNames = useMemo(() => tv.tables.flatMap((table) => table.seats.map((seat) => seat.name)), [tv.tables]);
  const viewportKey = useSyncExternalStore(subscribeToResize, windowSize, noWindow);
  const viewport = useMemo(() => parseSize(viewportKey), [viewportKey]);
  // The natural size of the plan image, tagged with its plan version: a replaced plan (maybe another aspect ratio)
  // waits for its own size instead of being stretched to the old one while it downloads.
  const [loaded, setLoaded] = useState<{ version: number; size: Size } | null>(null);
  const natural = loaded !== null && loaded.version === tv.planVersion ? loaded.size : null;
  const cards = useRef(new Map<string, HTMLDivElement>());

  const hasPlan = tv.planVersion !== null;
  const box = useMemo(
    () => containBox(hasPlan ? (natural ?? BLANK_STAGE) : BLANK_STAGE, viewport),
    [hasPlan, natural, viewport],
  );

  // The image may finish loading before the page is interactive (no onLoad then): read it when it mounts, too.
  function readNatural(img: HTMLImageElement | null) {
    const version = tv.planVersion;
    if (version !== null && img?.complete && img.naturalWidth > 0) {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      setLoaded((previous) =>
        previous?.version === version && previous.size.width === size.width && previous.size.height === size.height
          ? previous
          : { version, size },
      );
    }
  }

  // Measure the cards, place them near their pins without overlapping, then show them. Positions go straight to the
  // DOM: nothing to re-render.
  useLayoutEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) {
      return;
    }
    const inputs = tv.tables.map((table, index) => {
      const id = cardId(index, table.name);
      const element = cards.current.get(id);
      return {
        id,
        anchorX: box.left + table.x * box.width,
        anchorY: box.top + table.y * box.height,
        width: element?.offsetWidth ?? 0,
        height: element?.offsetHeight ?? 0,
      };
    });
    for (const placement of layoutCards(inputs, viewport, { gap: viewport.height * 0.01 })) {
      const element = cards.current.get(placement.id);
      if (element) {
        element.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
        element.style.visibility = "visible";
      }
    }
  }, [tv.tables, box, viewport]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {tv.publishedAt === null ? (
        <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[4vh] text-center">
          <h1 className="text-[7vh] leading-tight font-bold">{eventName}</h1>
          <p className="text-[3.5vh] text-neutral-300">Rozsadzenie pojawi się tutaj po publikacji.</p>
        </div>
      ) : (
        <>
          <h1 className="sr-only">{eventName} — rozsadzenie</h1>
          {tv.planVersion === null ? (
            <div
              aria-hidden
              className="absolute rounded-[1vh] bg-neutral-900"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            />
          ) : (
            <img
              key={tv.planVersion}
              ref={readNatural}
              src={planImagePath(apiBase, tv.planVersion)}
              alt="Plan lokalu"
              draggable={false}
              onLoad={(event) => {
                readNatural(event.currentTarget);
              }}
              className={cn("absolute max-w-none select-none", natural === null && "opacity-0")}
              style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
            />
          )}
          {tv.tables.map((table, index) => (
            <span
              key={cardId(index, table.name)}
              aria-hidden
              className="absolute size-[1.4vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 ring-2 ring-neutral-950"
              style={{ left: box.left + table.x * box.width, top: box.top + table.y * box.height }}
            />
          ))}
          {tv.tables.map((table, index) => {
            const id = cardId(index, table.name);
            return (
              <TableCard
                key={id}
                table={table}
                ref={(element) => {
                  if (element) {
                    cards.current.set(id, element);
                  } else {
                    cards.current.delete(id);
                  }
                }}
              />
            );
          })}
        </>
      )}
      {tv.spotlight && (
        <TvSpotlight
          key={tv.spotlight.shownAt}
          spotlight={tv.spotlight}
          pool={seatedNames}
          spin={tv.spotlight.shownAt !== loadedShownAt}
        />
      )}
      {offline && (
        <p
          role="status"
          className="absolute right-[1.5vh] bottom-[1.5vh] z-30 rounded-[0.8vh] bg-black/75 px-[1.2vh] py-[0.6vh] text-[1.8vh] text-neutral-200"
        >
          Brak połączenia — ponawiam…
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {updates > 0 ? "Zaktualizowano" : ""}
      </p>
    </div>
  );
}
