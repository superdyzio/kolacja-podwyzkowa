import type { TableShape } from "@/types";
import { sideALength } from "./seats";

// Geometry of the venue drawing (venue-drawing), pure: where a table's body, its chairs and the names at the chairs
// are. The TV, the guest phone and the organizer's editor all draw from these numbers, so they look the same.
//
// Stage units: the stage is the plan image's box, STAGE_WIDTH units wide and STAGE_WIDTH / aspect high (aspect =
// image width / height). A table's pin (x, y fractions of the image) is its centre. Sizes come from the venue's
// chair pitch (a fraction of the image WIDTH), so circles stay circles on any aspect ratio.
//
// Chairs follow the seat contract of seats.ts exactly (before the table's rotation):
//   round: seat 1 at the top (12 o'clock), then clockwise;
//   rectangular: side A along the top edge left → right (1..a), side B along the bottom edge left → right
//     (a+1..n), so seat p faces seat a+p; no chairs at the ends.
// rotation: degrees clockwise about the table centre (screen coordinates, y down).

export const STAGE_WIDTH = 1000;

// Proportions in chair pitches.
const ROUND_MIN_RADIUS = 0.8;
const RECT_DEPTH = 1.6;
const RECT_MIN_LENGTH = 1.2;
const CHAIR_DISTANCE = 0.5;
const CHAIR_RADIUS = 0.3;
const LABEL_GAP = 0.15;

export interface StagePoint {
  x: number;
  y: number;
}

export interface DrawnTable {
  shape: TableShape;
  seatCount: number;
  // The pin: fractions of the plan image.
  x: number;
  y: number;
  rotation: number;
}

export type TableBody =
  | { shape: "round"; cx: number; cy: number; r: number }
  | { shape: "rectangular"; cx: number; cy: number; length: number; depth: number; rotation: number };

// A chair centre and the outward unit normal (away from the table), in stage units.
export interface Chair {
  seat: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

// A name's box: centre and size, in stage units (text-anchor middle, dominant-baseline central).
export interface LabelBox {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface StageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function stageHeight(aspect: number): number {
  return STAGE_WIDTH / (aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9);
}

export function toStage(x: number, y: number, aspect: number): StagePoint {
  return { x: x * STAGE_WIDTH, y: y * stageHeight(aspect) };
}

// The inverse of toStage (not clamped; the editor rounds and clamps).
export function fromStage(point: StagePoint, aspect: number): StagePoint {
  return { x: point.x / STAGE_WIDTH, y: point.y / stageHeight(aspect) };
}

// The chair pitch in stage units.
export function pitchUnits(chairPitch: number): number {
  return chairPitch * STAGE_WIDTH;
}

export function chairRadius(chairPitch: number): number {
  return CHAIR_RADIUS * pitchUnits(chairPitch);
}

// Distance from a chair centre to the near edge of its name.
export function labelOffset(chairPitch: number): number {
  return (CHAIR_RADIUS + LABEL_GAP) * pitchUnits(chairPitch);
}

// Rotates (x, y) about the origin by `degrees` clockwise on screen.
export function rotatePoint(x: number, y: number, degrees: number): StagePoint {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function roundRadius(seatCount: number, pitch: number): number {
  return Math.max(ROUND_MIN_RADIUS * pitch, (seatCount * pitch) / (2 * Math.PI));
}

function rectLength(seatCount: number, pitch: number): number {
  return Math.max(RECT_MIN_LENGTH * pitch, sideALength(seatCount) * pitch);
}

export function tableBody(table: DrawnTable, chairPitch: number, aspect: number): TableBody {
  const pitch = pitchUnits(chairPitch);
  const centre = toStage(table.x, table.y, aspect);
  if (table.shape === "round") {
    return { shape: "round", cx: centre.x, cy: centre.y, r: roundRadius(table.seatCount, pitch) };
  }
  return {
    shape: "rectangular",
    cx: centre.x,
    cy: centre.y,
    length: rectLength(table.seatCount, pitch),
    depth: RECT_DEPTH * pitch,
    rotation: table.rotation,
  };
}

// Every chair of the table in seat order 1..n (see the contract above).
export function chairPositions(table: DrawnTable, chairPitch: number, aspect: number): Chair[] {
  const pitch = pitchUnits(chairPitch);
  const centre = toStage(table.x, table.y, aspect);
  const local: { seat: number; x: number; y: number; nx: number; ny: number }[] = [];
  if (table.shape === "round") {
    const ring = roundRadius(table.seatCount, pitch) + CHAIR_DISTANCE * pitch;
    for (let seat = 1; seat <= table.seatCount; seat++) {
      const angle = (2 * Math.PI * (seat - 1)) / table.seatCount;
      const nx = Math.sin(angle);
      const ny = -Math.cos(angle);
      local.push({ seat, x: ring * nx, y: ring * ny, nx, ny });
    }
  } else {
    const a = sideALength(table.seatCount);
    const length = rectLength(table.seatCount, pitch);
    const spacing = length / a;
    const edge = (RECT_DEPTH / 2 + CHAIR_DISTANCE) * pitch;
    for (let seat = 1; seat <= table.seatCount; seat++) {
      const onA = seat <= a;
      const position = onA ? seat : seat - a;
      local.push({
        seat,
        x: -length / 2 + (position - 0.5) * spacing,
        y: onA ? -edge : edge,
        nx: 0,
        ny: onA ? -1 : 1,
      });
    }
  }
  return local.map((chair) => {
    const point = rotatePoint(chair.x, chair.y, table.rotation);
    const normal = rotatePoint(chair.nx, chair.ny, table.rotation);
    return { seat: chair.seat, x: centre.x + point.x, y: centre.y + point.y, normalX: normal.x, normalY: normal.y };
  });
}

// The name's box for a chair: it starts `offset` away from the chair centre along the outward normal and extends
// further outward, so a name above the table is centred over its chair, a name to the right starts at the chair, and
// everything in between slides smoothly. The text stays horizontal.
export function labelBox(chair: Chair, offset: number, width: number, height: number): LabelBox {
  const anchorX = chair.x + chair.normalX * offset;
  const anchorY = chair.y + chair.normalY * offset;
  return {
    cx: anchorX + (chair.normalX * width) / 2,
    cy: anchorY + (chair.normalY * height) / 2,
    width,
    height,
  };
}

export function boxesOverlap(a: LabelBox, b: LabelBox, padding = 0): boolean {
  return (
    Math.abs(a.cx - b.cx) * 2 < a.width + b.width + padding * 2 &&
    Math.abs(a.cy - b.cy) * 2 < a.height + b.height + padding * 2
  );
}

export interface LabelLayoutOptions {
  // Distance from the chair centre to the label (labelOffset()).
  offset: number;
  // Text box height per font unit (line height).
  lineHeight: number;
}

// The boxes of a table's names at one font size. widthsPerFont[i] = the measured text width of chairs[i]'s name at
// font size 1 (0 = empty chair, no box). stagger: every second chair (seat order) pushes its name one line further
// out, so neighbours on a dense side do not collide.
export function labelBoxes(
  chairs: readonly Chair[],
  widthsPerFont: readonly number[],
  font: number,
  stagger: boolean,
  options: LabelLayoutOptions,
): (LabelBox | null)[] {
  const height = font * options.lineHeight;
  return chairs.map((chair, index) => {
    const unitWidth = widthsPerFont[index] ?? 0;
    if (unitWidth <= 0) {
      return null;
    }
    const extra = stagger && index % 2 === 1 ? height : 0;
    return labelBox(chair, options.offset + extra, unitWidth * font, height);
  });
}

function allApart(boxes: readonly (LabelBox | null)[], padding: number): boolean {
  const present = boxes.filter((box): box is LabelBox => box !== null);
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (boxesOverlap(present[i], present[j], padding)) {
        return false;
      }
    }
  }
  return true;
}

export interface TableFont {
  font: number;
  stagger: boolean;
}

const FONT_STEPS = 24;
// Staggered names are harder to read: only worth it when they allow a clearly larger font.
const STAGGER_GAIN = 1.25;

// One font size for all names at a table: the largest in [minFont, maxFont] at which no two of its names overlap,
// with staggering when that allows a clearly larger font. Never below minFont (very long names at a dense table may
// then touch; the organizer can shorten the display name).
export function fitTableFont(
  chairs: readonly Chair[],
  widthsPerFont: readonly number[],
  maxFont: number,
  minFont: number,
  options: LabelLayoutOptions,
): TableFont {
  const largest = (stagger: boolean): number | null => {
    for (let step = 0; step <= FONT_STEPS; step++) {
      const font = maxFont - ((maxFont - minFont) * step) / FONT_STEPS;
      const padding = font * 0.15;
      if (allApart(labelBoxes(chairs, widthsPerFont, font, stagger, options), padding)) {
        return font;
      }
    }
    return null;
  };
  const plain = largest(false);
  if (plain === maxFont) {
    return { font: plain, stagger: false };
  }
  const staggered = largest(true);
  if (plain !== null && (staggered === null || staggered < plain * STAGGER_GAIN)) {
    return { font: plain, stagger: false };
  }
  return staggered === null ? { font: minFont, stagger: true } : { font: staggered, stagger: true };
}

// The area a table covers with its chairs (not its names), in stage units.
export function tableExtent(table: DrawnTable, chairPitch: number, aspect: number): StageRect {
  const radius = chairRadius(chairPitch);
  const chairs = chairPositions(table, chairPitch, aspect);
  const centre = toStage(table.x, table.y, aspect);
  const body = tableBody(table, chairPitch, aspect);
  const corners =
    body.shape === "round"
      ? [
          { x: centre.x - body.r, y: centre.y - body.r },
          { x: centre.x + body.r, y: centre.y + body.r },
        ]
      : [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sx, sy]) => {
          const point = rotatePoint((sx * body.length) / 2, (sy * body.depth) / 2, body.rotation);
          return { x: centre.x + point.x, y: centre.y + point.y };
        });
  const points = [
    ...corners,
    ...chairs.flatMap((chair) => [
      { x: chair.x - radius, y: chair.y - radius },
      { x: chair.x + radius, y: chair.y + radius },
    ]),
  ];
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

// The smallest rect containing all the given rects (null for none).
export function unionRect(rects: readonly StageRect[]): StageRect | null {
  if (rects.length === 0) {
    return null;
  }
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function labelRect(box: LabelBox): StageRect {
  return {
    left: box.cx - box.width / 2,
    top: box.cy - box.height / 2,
    right: box.cx + box.width / 2,
    bottom: box.cy + box.height / 2,
  };
}
