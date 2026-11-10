import { useMemo, useState } from "react";
import { useRoomRotation, useTvScreenSize } from "@/components/hooks/useTvRooms";
import { useTvSeating } from "@/components/hooks/useTvSeating";
import { VenueDrawing, type VenueDrawingTable } from "@/components/venue-drawing/VenueDrawing";
import type { Locale } from "@/lib/i18n";
import { tvRoomMessages } from "@/lib/tv-rooms/messages";
import { resolveRoomPin } from "@/lib/tv-rooms/pin";
import { planTvView, roomScene, tvRoomNames } from "@/lib/tv-rooms/rotation";
import { tvScreenMessages } from "@/lib/tv-spotlight/messages";
import { cn } from "@/lib/utils";
import { planImagePath } from "@/lib/venue/pin";
import type { TvScreenDto } from "@/types";
import { TvQuiz } from "./TvQuiz";
import { TvSpotlight } from "./TvSpotlight";

interface Props {
  // TV API base, e.g. "/api/tv/<key>".
  apiBase: string;
  initial: TvScreenDto;
  eventName: string;
  // tv-room-rotation: the room this TV is pinned to (`?sala=`), already resolved on the server to a published room's
  // own name, or null. Re-checked against every new publish (a room that disappears gives the whole venue again).
  fixedRoom: string | null;
  locale: Locale;
}

const NO_ROOMS: readonly string[] = [];

// Without a plan image (or until it has loaded) the drawing stands on a 16:9 stage.
const BLANK_ASPECT = 16 / 9;

// The read-only TV screen (FR-008, NFR-003, NFR-006): the venue drawn from the PUBLISHED snapshot — room outlines,
// tables with their chairs and every seated name at its chair (venue-drawing) — fitted to the screen and refreshed by
// polling. The plan photo is never shown: it is loaded hidden only for its aspect ratio (the drawing's coordinates
// are fractions of it). On its own layer above (also before the first publish): what the organizer put on the TV
// (tv-spotlight). tv-room-rotation: the whole venue while every name is readable (≥ 2.5% of the screen height), else
// room by room (zoomed, with the room's name and where the rotation is); a pinned TV shows its room only. pub-quiz
// (S-28): a running quiz covers both on its own layer.
export function TvSeatingView({ apiBase, initial, eventName, fixedRoom, locale }: Props) {
  const t = tvScreenMessages(locale);
  const r = tvRoomMessages(locale);
  const { tv, offline, updates } = useTvSeating(apiBase, initial);
  // A drawn guest spins only when the draw happens while this page runs, never for what was on the TV at load.
  const [loadedShownAt] = useState(initial.spotlight?.shownAt ?? null);
  const seatedNames = useMemo(() => tv.tables.flatMap((table) => table.seats.map((seat) => seat.name)), [tv.tables]);
  // The plan image's aspect ratio, tagged with its plan version (a replaced plan waits for its own).
  const [loaded, setLoaded] = useState<{ version: number; aspect: number } | null>(null);
  const aspect = loaded !== null && loaded.version === tv.planVersion ? loaded.aspect : BLANK_ASPECT;

  const tables = useMemo(
    (): (VenueDrawingTable & { room: string })[] =>
      tv.tables.map((table, index) => ({ ...table, key: `${String(index).padStart(3, "0")} ${table.name}` })),
    [tv.tables],
  );

  const screen = useTvScreenSize();
  const plan = useMemo(
    () =>
      planTvView({
        tables: tv.tables,
        rooms: tv.rooms,
        chairPitch: tv.chairPitch,
        aspect,
        screen,
        pinnedRoom: resolveRoomPin(fixedRoom, tvRoomNames(tv.tables)),
      }),
    [tv.tables, tv.rooms, tv.chairPitch, aspect, screen, fixedRoom],
  );
  const rotation = plan.mode === "rotate" ? plan.rooms : NO_ROOMS;
  const roomIndex = useRoomRotation(rotation);
  const shownRoom = plan.mode === "room" ? plan.room : plan.mode === "rotate" ? plan.rooms[roomIndex] : null;
  const scene = useMemo(
    () => (shownRoom === null ? { tables, rooms: tv.rooms } : roomScene(tables, tv.rooms, shownRoom)),
    [shownRoom, tables, tv.rooms],
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
          {/* A new room fades in (only without prefers-reduced-motion; the rotation itself always runs). */}
          <div
            key={shownRoom ?? ""}
            className="motion-safe:animate-in motion-safe:fade-in absolute inset-0 motion-safe:duration-700"
          >
            <VenueDrawing
              aspect={aspect}
              chairPitch={tv.chairPitch}
              rooms={scene.rooms}
              tables={scene.tables}
              variant="tv"
              label={shownRoom === null ? t.planLabel : `${t.planLabel} — ${shownRoom}`}
              locale={locale}
              className="h-full w-full p-[1.5vh]"
            />
          </div>
          {shownRoom !== null && (
            <div
              data-tv-room={shownRoom}
              aria-label={
                plan.mode === "rotate"
                  ? r.positionLabel(roomIndex, rotation.length, shownRoom)
                  : r.pinnedLabel(shownRoom)
              }
              className="absolute top-[1.5vh] right-[1.5vw] z-10 flex max-w-[40vw] flex-col items-end gap-[0.6vh] rounded-[1vh] bg-neutral-900/80 px-[1.2vw] py-[0.8vh]"
            >
              <p className="truncate text-[4vh] leading-tight font-bold">{shownRoom}</p>
              {plan.mode === "rotate" && (
                <div className="flex items-center gap-[0.8vw] text-[2.2vh] text-neutral-300">
                  <span>{r.position(roomIndex, rotation.length)}</span>
                  <span className="flex gap-[0.5vw]" aria-hidden>
                    {rotation.map((room, index) => (
                      <span
                        key={room}
                        className={cn(
                          "size-[1.2vh] rounded-full",
                          index === roomIndex ? "bg-amber-400" : "bg-neutral-600",
                        )}
                      />
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
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
      {
        // pub-quiz (S-28): the running quiz covers the plan and the spotlight (the offline badge stays on top).
        tv.quiz && <TvQuiz quiz={tv.quiz} locale={locale} />
      }
      {offline && (
        <p
          role="status"
          className="absolute right-[1.5vh] bottom-[1.5vh] z-30 rounded-[0.8vh] bg-black/75 px-[1.2vh] py-[0.6vh] text-[1.8vh] text-neutral-200"
        >
          {t.offline}
        </p>
      )}
      {/* The text alternates, so every update is announced (an unchanged text is not); nothing visible changes. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {updates === 0 ? "" : updates % 2 === 1 ? t.updated : t.updatedAgain}
      </p>
    </div>
  );
}
