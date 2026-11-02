import { displayNameLength } from "@/lib/guests/names";
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

// A chair centre and the outward unit normal (away from the table), in stage units. position: 1-based place along
// its side (rectangular) or around the table (round) — staggered names alternate by it.
export interface Chair {
  seat: number;
  position: number;
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
  const local: { seat: number; position: number; x: number; y: number; nx: number; ny: number }[] = [];
  if (table.shape === "round") {
    const ring = roundRadius(table.seatCount, pitch) + CHAIR_DISTANCE * pitch;
    for (let seat = 1; seat <= table.seatCount; seat++) {
      const angle = (2 * Math.PI * (seat - 1)) / table.seatCount;
      const nx = Math.sin(angle);
      const ny = -Math.cos(angle);
      local.push({ seat, position: seat, x: ring * nx, y: ring * ny, nx, ny });
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
        position,
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
    return {
      seat: chair.seat,
      position: chair.position,
      x: centre.x + point.x,
      y: centre.y + point.y,
      normalX: normal.x,
      normalY: normal.y,
    };
  });
}

// How far a name leans to one side: a normal component of ±0.5 or more puts the whole box on that side of its anchor.
function lean(component: number): number {
  return Math.max(-1, Math.min(1, component / 0.5));
}

// The name's box for a chair: anchored `offset` away from the chair centre along the outward normal and extending
// outward from there, so a name above or below the table is centred over its chair, a name to the side starts (or
// ends) at it, and a diagonal one sits in its corner, clear of the chair. The text stays horizontal.
export function labelBox(chair: Chair, offset: number, width: number, height: number): LabelBox {
  const anchorX = chair.x + chair.normalX * offset;
  const anchorY = chair.y + chair.normalY * offset;
  return {
    cx: anchorX + (lean(chair.normalX) * width) / 2,
    cy: anchorY + (lean(chair.normalY) * height) / 2,
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
// font size 1 (0 = empty chair, no box). stagger: every second chair along a side (or around a round table) pushes
// its name one line further out, so neighbours on a dense side do not collide.
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
    const extra = stagger && chair.position % 2 === 0 ? height : 0;
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

// One table laid out for drawing: body, chairs, the names at their chairs (one font per table) and the area it all
// covers. `measure(name)` = the name's text width at font size 1 (the views measure real text; tests pass a stub).

export interface DrawingSeat {
  seat: number;
  name: string;
}

export interface DrawingTableInput extends DrawnTable {
  name: string;
  seats: readonly DrawingSeat[];
}

export interface PlacedLabel {
  seat: number;
  name: string;
  box: LabelBox;
}

export interface LaidOutTable {
  body: TableBody;
  chairs: Chair[];
  occupied: ReadonlySet<number>;
  labels: PlacedLabel[];
  font: number;
  // The table's own name in its middle.
  nameFont: number;
  // Body and chairs.
  extent: StageRect;
  // Body, chairs and names.
  bounds: StageRect;
}

// Font range in chair pitches: names are at most this big, and shrink at a dense table down to the minimum.
export interface FontRange {
  max: number;
  min: number;
}

export const DEFAULT_FONTS: FontRange = { max: 0.62, min: 0.3 };
export const LINE_HEIGHT = 1.15;
// A rough text width per font unit for a name of this length (before the real text is measured).
export function estimateTextWidth(name: string): number {
  return 0.56 * displayNameLength(name);
}

function tableNameFont(body: TableBody, name: string, pitch: number): number {
  const room = body.shape === "round" ? body.r * 1.6 : body.length * 0.9;
  return Math.max(0.2 * pitch, Math.min(0.42 * pitch, room / Math.max(1, estimateTextWidth(name))));
}

export function layoutTable(
  table: DrawingTableInput,
  chairPitch: number,
  aspect: number,
  measure: (name: string) => number,
  fonts: FontRange = DEFAULT_FONTS,
): LaidOutTable {
  const pitch = pitchUnits(chairPitch);
  const body = tableBody(table, chairPitch, aspect);
  const chairs = chairPositions(table, chairPitch, aspect);
  const nameBySeat = new Map(table.seats.map((seat) => [seat.seat, seat.name]));
  const widths = chairs.map((chair) => {
    const name = nameBySeat.get(chair.seat);
    return name ? measure(name) : 0;
  });
  const options = { offset: labelOffset(chairPitch), lineHeight: LINE_HEIGHT };
  const { font, stagger } = fitTableFont(chairs, widths, fonts.max * pitch, fonts.min * pitch, options);
  const boxes = labelBoxes(chairs, widths, font, stagger, options);
  const labels = chairs.flatMap((chair, index): PlacedLabel[] => {
    const box = boxes[index];
    const name = nameBySeat.get(chair.seat);
    return box && name ? [{ seat: chair.seat, name, box }] : [];
  });
  const extent = tableExtent(table, chairPitch, aspect);
  return {
    body,
    chairs,
    occupied: new Set(nameBySeat.keys()),
    labels,
    font,
    nameFont: tableNameFont(body, table.name, pitch),
    extent,
    bounds: unionRect([extent, ...labels.map((label) => labelRect(label.box))]) ?? extent,
  };
}

function rectsOverlap(a: StageRect, b: StageRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// True when a name of `table` lands on (or right next to) a name, a chair or the body of `other`: names of different
// tables keep half a line apart, so two of them never read as one.
function crowds(table: LaidOutTable, other: LaidOutTable): boolean {
  const gap = table.font * 0.5;
  if (!rectsOverlap(padRect(table.bounds, gap), other.bounds)) {
    return false;
  }
  return table.labels.some((label) => {
    const rect = padRect(labelRect(label.box), gap);
    return (
      rectsOverlap(rect, other.extent) ||
      other.labels.some((otherLabel) => boxesOverlap(label.box, otherLabel.box, gap))
    );
  });
}

const CROWDED_SHRINK = 0.85;
const CROWDED_PASSES = 10;
// The largest names are at most this many times the smallest, so the tables look like one drawing.
const FONT_SPREAD = 1.6;

// Every table laid out together: names that would land on another table (or its names) shrink step by step, and
// the font sizes of different tables stay within FONT_SPREAD of each other. Deterministic and bounded.
export function layoutDrawing(
  tables: readonly DrawingTableInput[],
  chairPitch: number,
  aspect: number,
  measure: (name: string) => number,
  fonts: FontRange = DEFAULT_FONTS,
): LaidOutTable[] {
  const pitch = pitchUnits(chairPitch);
  const maxFonts = tables.map(() => fonts.max);
  const layOut = (index: number) =>
    layoutTable(tables[index], chairPitch, aspect, measure, { max: maxFonts[index], min: fonts.min });
  const laidOut = tables.map((_, index) => layOut(index));

  for (let pass = 0; pass < CROWDED_PASSES; pass++) {
    const crowded = laidOut.map(
      (table, index) =>
        maxFonts[index] > fonts.min &&
        laidOut.some((other, otherIndex) => otherIndex !== index && crowds(table, other)),
    );
    crowded.forEach((shrink, index) => {
      if (shrink) {
        maxFonts[index] = Math.max(fonts.min, maxFonts[index] * CROWDED_SHRINK);
      }
    });
    if (!crowded.includes(true)) {
      break;
    }
    tables.forEach((_, index) => {
      laidOut[index] = layOut(index);
    });
  }

  const named = laidOut.filter((table) => table.labels.length > 0);
  if (named.length > 1) {
    const cap = (Math.min(...named.map((table) => table.font)) * FONT_SPREAD) / pitch;
    laidOut.forEach((table, index) => {
      if (table.font / pitch > cap) {
        maxFonts[index] = Math.max(fonts.min, cap);
        laidOut[index] = layOut(index);
      }
    });
  }
  return laidOut;
}

// A rect grown by `margin` on every side.
export function padRect(rect: StageRect, margin: number): StageRect {
  return { left: rect.left - margin, top: rect.top - margin, right: rect.right + margin, bottom: rect.bottom + margin };
}

// The SVG viewBox of a rect.
export function viewBoxOf(rect: StageRect): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `${round(rect.left)} ${round(rect.top)} ${round(rect.right - rect.left)} ${round(rect.bottom - rect.top)}`;
}

// A room's outline in stage units.
export function roomRect(outline: { x: number; y: number; width: number; height: number }, aspect: number): StageRect {
  const topLeft = toStage(outline.x, outline.y, aspect);
  const bottomRight = toStage(outline.x + outline.width, outline.y + outline.height, aspect);
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}
