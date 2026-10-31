import { useEffect, useState } from "react";
import { rouletteSteps } from "@/lib/tv-spotlight/draw";
import { spotlightFontSize, TV_PERSON_DRAWING_LABEL, TV_SPOTLIGHT_LABELS } from "@/lib/tv-spotlight/rules";
import { cn } from "@/lib/utils";
import type { TvSpotlightDto } from "@/types";

interface Props {
  spotlight: TvSpotlightDto;
  // The seated names on the TV: what a drawn name spins through before the reveal.
  pool: readonly string[];
  // A fresh draw seen while the page runs spins first; on load (or with reduced motion) the name just shows.
  spin: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// What the organizer put on the TV (tv-spotlight), over the seating plan: one large card with a caption and the text,
// sized to its length. A drawn guest spins through the seated names (slowing down), then the name pops up. Mounted
// with key = shownAt, so every show starts fresh.
export function TvSpotlight({ spotlight, pool, spin }: Props) {
  // Computed once per show: a seating update during the spin must not restart it.
  const [steps] = useState(() =>
    spotlight.kind === "person" && spin && !prefersReducedMotion()
      ? rouletteSteps(pool, spotlight.text, Math.random)
      : [],
  );
  const [index, setIndex] = useState(0);
  const step = steps.at(index);

  useEffect(() => {
    if (!step) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIndex((current) => current + 1);
    }, step.ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [step]);

  const spinning = step !== undefined;
  const text = step?.name ?? spotlight.text;
  // One size for the whole spin, so the card does not jump with every name.
  const sizingText = steps.reduce(
    (longest, candidate) => (candidate.name.length > longest.length ? candidate.name : longest),
    spotlight.text,
  );

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/85 p-[5vh] backdrop-blur-sm">
      <figure className="animate-in fade-in flex max-h-full max-w-[86vw] flex-col items-center gap-[3vh] overflow-hidden rounded-[3vh] border border-white/10 bg-neutral-900/95 px-[6vh] py-[5vh] text-center shadow-2xl duration-500">
        <figcaption className="text-[3vh] font-semibold tracking-[0.2em] text-amber-400 uppercase">
          {spinning ? TV_PERSON_DRAWING_LABEL : TV_SPOTLIGHT_LABELS[spotlight.kind]}
        </figcaption>
        <p
          key={spinning ? `step-${String(index)}` : "final"}
          aria-hidden={spinning}
          className={cn(
            "leading-tight font-bold text-balance break-words",
            spotlight.kind === "person" && !spinning && "animate-in zoom-in-50 fade-in text-amber-300 duration-500",
          )}
          style={{ fontSize: `${String(spotlightFontSize(spotlight.kind, sizingText))}vh` }}
        >
          {text}
        </p>
      </figure>
      <p className="sr-only" aria-live="polite">
        {spinning ? "" : `${TV_SPOTLIGHT_LABELS[spotlight.kind]}: ${spotlight.text}`}
      </p>
    </div>
  );
}
