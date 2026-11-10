import { displayNameKey } from "@/lib/guests/names";
import {
  STAGE_WIDTH,
  contentView,
  estimateTextWidth,
  layoutDrawing,
  pitchUnits,
  roomRect,
  stageHeight,
  type StageRect,
} from "@/lib/venue/drawing";
import { compareTableNames } from "@/lib/venue/rules";
import type { DrawingRoomDto, TvTableDto } from "@/types";

// The TV at the entrance (tv-room-rotation, S-20; FR-034, NFR-018): the whole venue while every seated name is
// readable, else room by room. Pure: the TV island calls it with the published snapshot and its screen size.

// NFR-006 / NFR-018: a name is readable when its font is at least 2.5% of the screen height.
export const TV_READABLE_FRACTION = 0.025;
// The TV's padding (`p-[1.5vh]` around the drawing): a fraction of the screen height on every side.
export const TV_PADDING_FRACTION = 0.015;
// How long one room stays on the screen while the TV rotates.
export const TV_ROOM_DWELL_MS = 12_000;
// The screen assumed on the server and during hydration (a 1080p TV); the browser then measures its own window.
export const DEFAULT_TV_SCREEN: TvScreenSize = { width: 1920, height: 1080 };

export interface TvScreenSize {
  width: number;
  height: number;
}

export type TvViewPlan = { mode: "venue" } | { mode: "room"; room: string } | { mode: "rotate"; rooms: string[] };

export interface TvViewInput {
  tables: readonly TvTableDto[];
  rooms: readonly DrawingRoomDto[];
  chairPitch: number;
  aspect: number;
  screen: TvScreenSize;
  // The room this TV is pinned to (already resolved against the rooms: `resolveRoomPin`), or null.
  pinnedRoom: string | null;
}

// The rooms that have at least one published table, in natural name order („Sala 2” before „Sala 10”), each once.
export function tvRoomNames(tables: readonly Pick<TvTableDto, "room">[]): string[] {
  const byKey = new Map<string, string>();
  for (const table of tables) {
    const key = displayNameKey(table.room);
    if (key !== "" && !byKey.has(key)) {
      byKey.set(key, table.room);
    }
  }
  return [...byKey.values()].sort(compareTableNames);
}

// What the TV draws for one room: its tables and its outline (when it has one; outlines are optional). The drawing
// fits its view to them, so a room is zoomed to its outline together with its tables, or to its tables alone.
export function roomScene<Table extends Pick<TvTableDto, "room">>(
  tables: readonly Table[],
  rooms: readonly DrawingRoomDto[],
  room: string,
): { tables: Table[]; rooms: DrawingRoomDto[] } {
  const key = displayNameKey(room);
  return {
    tables: tables.filter((table) => displayNameKey(table.room) === key),
    rooms: rooms.filter((outline) => displayNameKey(outline.name) === key),
  };
}

// How many screen pixels one stage unit becomes when `view` is fitted into the screen minus the TV's padding (the
// SVG's `preserveAspectRatio="xMidYMid meet"`).
export function stageScale(view: StageRect, screen: TvScreenSize): number {
  const padding = 2 * TV_PADDING_FRACTION * screen.height;
  const width = Math.max(1, screen.width - padding);
  const height = Math.max(1, screen.height - padding);
  return Math.min(width / Math.max(1e-6, view.right - view.left), height / Math.max(1e-6, view.bottom - view.top));
}

// The smallest seated-name font of the whole venue on this screen, in pixels (null: nobody is seated). Names are
// measured with the estimate (deterministic, the same on the server and in every browser).
export function smallestNameFontPx(
  input: Omit<TvViewInput, "pinnedRoom">,
  measure: (name: string) => number = estimateTextWidth,
): number | null {
  const laidOut = layoutDrawing(input.tables, input.chairPitch, input.aspect, measure);
  const named = laidOut.filter((table) => table.labels.length > 0);
  if (named.length === 0) {
    return null;
  }
  const stage: StageRect = { left: 0, top: 0, right: STAGE_WIDTH, bottom: stageHeight(input.aspect) };
  const view = contentView(
    [...laidOut.map((table) => table.bounds), ...input.rooms.map((room) => roomRect(room, input.aspect))],
    pitchUnits(input.chairPitch),
    stage,
  );
  return Math.min(...named.map((table) => table.font)) * stageScale(view, input.screen);
}

// True when every seated name of the whole venue is at least TV_READABLE_FRACTION of the screen height.
export function isVenueReadable(input: Omit<TvViewInput, "pinnedRoom">): boolean {
  const font = smallestNameFontPx(input);
  return font === null || font >= TV_READABLE_FRACTION * input.screen.height;
}

// The TV's mode: pinned to a room; else the whole venue when it is readable or there is nothing to rotate through
// (fewer than two rooms with tables); else room by room.
export function planTvView(input: TvViewInput): TvViewPlan {
  if (input.pinnedRoom !== null) {
    return { mode: "room", room: input.pinnedRoom };
  }
  const rooms = tvRoomNames(input.tables);
  if (rooms.length < 2 || isVenueReadable(input)) {
    return { mode: "venue" };
  }
  return { mode: "rotate", rooms };
}

// The next room of the rotation (wraps around).
export function nextRoomIndex(index: number, count: number): number {
  return count <= 0 ? 0 : (index + 1) % count;
}

// After a new publish: stay on the room shown so far when it is still there, else start at the first.
export function keepRoomIndex(previousRoom: string | null, rooms: readonly string[]): number {
  if (previousRoom === null) {
    return 0;
  }
  const key = displayNameKey(previousRoom);
  const index = rooms.findIndex((room) => displayNameKey(room) === key);
  return index < 0 ? 0 : index;
}
