import type { Locale } from "@/lib/i18n/locale";
import { fromStage, type StagePoint } from "./drawing";
import { venueMessages } from "./messages";
import { normalizeRotation, roundFraction, type OutlineFields } from "./rules";
import type { PinPosition } from "./pin";

// Pure helpers of the drawing editor on /sale (venue-drawing): stage points → stored fractions, the rotate handle,
// room outlines from two corners, keyboard nudges. The canvas converts pointer positions to stage units with the
// SVG's own transform; everything after that is here.

export interface TableGeometry {
  x: number;
  y: number;
  rotation: number;
}

export const ROTATION_STEP = 15;
// Arrow keys move a table by this fraction of the plan (Shift: the large step).
export const NUDGE_STEP = 0.005;
export const NUDGE_STEP_LARGE = 0.02;
// An outline narrower or lower than this (fraction of the plan) is a click, not a drawn room.
export const MIN_OUTLINE_SIZE = 0.01;
// The „Skala krzeseł” slider: a chair pitch of 0.5–10% of the plan's width covers a single room up to a large hall
// (the API accepts MIN_CHAIR_PITCH..MAX_CHAIR_PITCH).
export const MIN_CHAIR_PITCH_SLIDER = 0.005;
export const MAX_CHAIR_PITCH_SLIDER = 0.1;

// „3,5%” / "3.5%" — the chair pitch as a share of the plan's width.
export function formatChairPitch(pitch: number, locale: Locale = "pl"): string {
  return `${(Math.round(pitch * 1000) / 10).toFixed(1).replace(".", venueMessages(locale).decimalSeparator)}%`;
}

// A stage point → pin fractions, clamped to the plan and rounded like every stored pin.
export function stageToFraction(point: StagePoint, aspect: number): PinPosition {
  const fraction = fromStage(point, aspect);
  return { x: roundFraction(fraction.x), y: roundFraction(fraction.y) };
}

export function snapRotation(degrees: number, step = ROTATION_STEP): number {
  return normalizeRotation(Math.round(degrees / step) * step);
}

// The rotation that points the table's top (seat 1 of a round table, side A of a rectangular one) at `point`:
// 0° = straight up, clockwise on screen. Snapped to 15° unless `free` (Shift held).
export function rotationTowards(centre: StagePoint, point: StagePoint, free: boolean): number {
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  if (dx === 0 && dy === 0) {
    return 0;
  }
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return free ? normalizeRotation(degrees) : snapRotation(degrees);
}

// The rectangle spanned by two corners given as fractions (any order), clamped to the plan and rounded; null when
// it is too small to be a room (a click).
export function outlineFromCorners(a: PinPosition, b: PinPosition): OutlineFields | null {
  const left = roundFraction(Math.min(a.x, b.x));
  const top = roundFraction(Math.min(a.y, b.y));
  const right = roundFraction(Math.max(a.x, b.x));
  const bottom = roundFraction(Math.max(a.y, b.y));
  const width = roundFraction(right - left);
  const height = roundFraction(bottom - top);
  if (width < MIN_OUTLINE_SIZE || height < MIN_OUTLINE_SIZE) {
    return null;
  }
  return { x: left, y: top, width, height };
}

// Moves an outline by (dx, dy) fractions, kept whole on the plan.
export function moveOutline(outline: OutlineFields, dx: number, dy: number): OutlineFields {
  const x = Math.min(1 - outline.width, Math.max(0, outline.x + dx));
  const y = Math.min(1 - outline.height, Math.max(0, outline.y + dy));
  return { ...outline, x: roundFraction(x), y: roundFraction(y) };
}

export type OutlineCorner = "nw" | "ne" | "se" | "sw";

export const OUTLINE_CORNERS: readonly OutlineCorner[] = ["nw", "ne", "se", "sw"];

export function cornerPoint(outline: OutlineFields, corner: OutlineCorner): PinPosition {
  return {
    x: corner === "ne" || corner === "se" ? outline.x + outline.width : outline.x,
    y: corner === "se" || corner === "sw" ? outline.y + outline.height : outline.y,
  };
}

const OPPOSITE: Record<OutlineCorner, OutlineCorner> = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

// Drags one corner to `point`; the opposite corner stays. Too small → the outline as it was.
export function resizeOutline(outline: OutlineFields, corner: OutlineCorner, point: PinPosition): OutlineFields {
  return outlineFromCorners(cornerPoint(outline, OPPOSITE[corner]), point) ?? outline;
}

// A key on the selected table: arrows move it, [ and ] rotate it (−/+ 15°, with Shift 1°). Other keys → null.
export function nudgeTable(geometry: TableGeometry, key: string, shift: boolean): TableGeometry | null {
  const step = shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
  const turn = shift ? 1 : ROTATION_STEP;
  switch (key) {
    case "ArrowLeft":
      return { ...geometry, x: roundFraction(geometry.x - step) };
    case "ArrowRight":
      return { ...geometry, x: roundFraction(geometry.x + step) };
    case "ArrowUp":
      return { ...geometry, y: roundFraction(geometry.y - step) };
    case "ArrowDown":
      return { ...geometry, y: roundFraction(geometry.y + step) };
    case "[":
    case "{":
      return { ...geometry, rotation: normalizeRotation(geometry.rotation - turn) };
    case "]":
    case "}":
      return { ...geometry, rotation: normalizeRotation(geometry.rotation + turn) };
    default:
      return null;
  }
}

// Fractions ↔ the percentages of the number fields (narrow screens): one decimal is about a centimetre of a room.
export function toPercent(fraction: number): string {
  return String(Math.round(fraction * 1000) / 10);
}

export function fromPercent(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

export const EXAMPLE_NAMES = [
  "Aleksandra",
  "Bartek",
  "Kasia",
  "Maksymilian",
  "Ola",
  "Grzegorz",
  "Zuzanna",
  "Piotr",
  "Magdalena",
  "Jan",
  "Weronika",
  "Krzysztof",
];

// Names for „Podgląd jak na TV”: who sits where in the working arrangement (what the TV shows after „Opublikuj”);
// with nobody seated yet, example names on every chair, so the organizer can judge how names fit.
export function previewSeats(
  tables: readonly { id: number; seatCount: number }[],
  occupancy: readonly { tableId: number; seat: number; guestName: string }[],
): Map<number, { seat: number; name: string }[]> {
  const result = new Map<number, { seat: number; name: string }[]>();
  const tableIds = new Set(tables.map((table) => table.id));
  const seated = occupancy.filter((occupant) => tableIds.has(occupant.tableId));
  if (seated.length > 0) {
    for (const occupant of seated) {
      const list = result.get(occupant.tableId) ?? [];
      list.push({ seat: occupant.seat, name: occupant.guestName });
      result.set(occupant.tableId, list);
    }
    return result;
  }
  let next = 0;
  for (const table of tables) {
    result.set(
      table.id,
      Array.from({ length: table.seatCount }, (_, index) => ({
        seat: index + 1,
        name: EXAMPLE_NAMES[next++ % EXAMPLE_NAMES.length],
      })),
    );
  }
  return result;
}
