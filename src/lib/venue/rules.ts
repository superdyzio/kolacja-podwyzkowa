import { displayNameKey, displayNameLength, normalizeDisplayName } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import type { TableShape } from "@/types";
import { venueMessages } from "./messages";

// Room and table rules shared by the DB service, the API routes and the organizer UI (PRD FR-005, FR-006).
// Pure functions only: no DB, no `astro:*`. The DB enforces the same limits (check constraints, unique indexes on
// lower(name)) as a backstop.
//
// Names are normalized like guest names (NFC, no invisible characters, single spaces, trimmed) and counted in code
// points. Room and table names are unique per event regardless of letter case: every table appears on the one TV
// plan, so two tables must never look the same.

export const MAX_ROOMS = 10;
export const MAX_TABLES = 60;
export const MAX_ROOM_NAME_LENGTH = 40;
export const MAX_TABLE_NAME_LENGTH = 24;
export const MIN_SEATS = 2;
export const MAX_SEATS = 30;
export const DEFAULT_SEATS = 8;

export const TABLE_SHAPES = ["round", "rectangular"] as const satisfies readonly TableShape[];

// The Polish labels (tests); views use venueMessages(locale).shapes.
export const TABLE_SHAPE_LABELS: Record<TableShape, string> = venueMessages("pl").shapes;

export type VenueNameProblem = "empty" | "too-long";

const FRACTION_DECIMALS = 4;
const FRACTION_SCALE = 10 ** FRACTION_DECIMALS;

export function normalizeVenueName(raw: string): string {
  return normalizeDisplayName(raw);
}

// Comparison key for the "same name" rule (mirrors lower(name) in the unique indexes).
export function venueNameKey(name: string): string {
  return displayNameKey(name);
}

function validateName(name: string, maxLength: number): VenueNameProblem | null {
  if (name === "") {
    return "empty";
  }
  return displayNameLength(name) > maxLength ? "too-long" : null;
}

// Both expect a normalized name.
export function validateRoomName(name: string): VenueNameProblem | null {
  return validateName(name, MAX_ROOM_NAME_LENGTH);
}

export function validateTableName(name: string): VenueNameProblem | null {
  return validateName(name, MAX_TABLE_NAME_LENGTH);
}

export function describeRoomNameProblem(problem: VenueNameProblem, locale: Locale = "pl"): string {
  const messages = venueMessages(locale);
  return problem === "empty" ? messages.roomNameEmpty : messages.roomNameTooLong(MAX_ROOM_NAME_LENGTH);
}

export function describeTableNameProblem(problem: VenueNameProblem, locale: Locale = "pl"): string {
  const messages = venueMessages(locale);
  return problem === "empty" ? messages.tableNameEmpty : messages.tableNameTooLong(MAX_TABLE_NAME_LENGTH);
}

export function seatCountMessage(locale: Locale = "pl"): string {
  return venueMessages(locale).seatCount(MIN_SEATS, MAX_SEATS);
}

export function roomsLimitMessage(locale: Locale = "pl"): string {
  return venueMessages(locale).roomsLimit(MAX_ROOMS);
}

export function tablesLimitMessage(locale: Locale = "pl"): string {
  return venueMessages(locale).tablesLimit(MAX_TABLES);
}

export function isValidSeatCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_SEATS && count <= MAX_SEATS;
}

export function isTableShape(value: unknown): value is TableShape {
  return (TABLE_SHAPES as readonly unknown[]).includes(value);
}

// A pin coordinate: a finite fraction of the plan image, 0 (left/top edge) to 1 (right/bottom edge).
export function isValidFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

// Everything that describes a table. x, y: the pin as fractions of the plan image (see pin.ts).
export interface TableFields {
  roomId: number;
  name: string;
  seatCount: number;
  shape: TableShape;
  x: number;
  y: number;
  // Degrees clockwise; any whole number is normalized to 0..359 on save (normalizeRotation). Optional: a new
  // table without it stands at 0°.
  rotation?: number;
}

export type TableFieldProblem =
  | { field: "name"; reason: VenueNameProblem }
  | { field: "seatCount" }
  | { field: "shape" }
  | { field: "position" }
  | { field: "rotation" };

// Checks the fields that are present (a full set for a new table, a patch for an edit). Expects a normalized name.
// The pin is all or nothing: x without y (or the other way round) is a position problem.
export function validateTableFields(fields: Partial<TableFields>): TableFieldProblem | null {
  if (fields.name !== undefined) {
    const reason = validateTableName(fields.name);
    if (reason) {
      return { field: "name", reason };
    }
  }
  if (fields.seatCount !== undefined && !isValidSeatCount(fields.seatCount)) {
    return { field: "seatCount" };
  }
  if (fields.shape !== undefined && !isTableShape(fields.shape)) {
    return { field: "shape" };
  }
  const hasX = fields.x !== undefined;
  const hasY = fields.y !== undefined;
  if (hasX !== hasY) {
    return { field: "position" };
  }
  if (hasX && hasY && !(isValidFraction(fields.x ?? Number.NaN) && isValidFraction(fields.y ?? Number.NaN))) {
    return { field: "position" };
  }
  if (fields.rotation !== undefined && !Number.isFinite(fields.rotation)) {
    return { field: "rotation" };
  }
  return null;
}

export function describeTableFieldProblem(problem: TableFieldProblem, locale: Locale = "pl"): string {
  const messages = venueMessages(locale);
  switch (problem.field) {
    case "name":
      return describeTableNameProblem(problem.reason, locale);
    case "seatCount":
      return seatCountMessage(locale);
    case "shape":
      return messages.shapeRequired;
    case "position":
      return messages.position;
    case "rotation":
      return messages.rotation;
  }
}

// The drawing (venue-drawing): one chair pitch for the whole venue (distance between two chairs as a fraction of
// the plan width), a rotation per table, a rectangle per room. The DB checks the same bounds.
export const DEFAULT_CHAIR_PITCH = 0.035;
export const MIN_CHAIR_PITCH = 0.005;
export const MAX_CHAIR_PITCH = 0.2;

export function isValidChairPitch(pitch: number): boolean {
  return Number.isFinite(pitch) && pitch >= MIN_CHAIR_PITCH && pitch <= MAX_CHAIR_PITCH;
}

// Any whole number of degrees → 0..359 (−90 → 270, 360 → 0); non-finite → 0.
export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }
  const whole = Math.round(degrees) % 360;
  return whole < 0 ? whole + 360 : whole;
}

export interface OutlineFields {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The corner on the plan, a positive size, and the rectangle may stick out of the plan by rounding only.
export function isValidOutline(outline: OutlineFields): boolean {
  const { x, y, width, height } = outline;
  return (
    isValidFraction(x) &&
    isValidFraction(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width <= 1 &&
    height <= 1 &&
    // Inside the plan (with room for 4-decimal rounding), whoever sends it: the editor, the API or the AI.
    x + width <= 1.0001 &&
    y + height <= 1.0001
  );
}

// 4 decimals like pins; the size keeps at least 0.0001 so a valid outline never rounds to zero.
export function roundOutline(outline: OutlineFields): OutlineFields {
  return {
    x: roundFraction(outline.x),
    y: roundFraction(outline.y),
    width: Math.max(1 / FRACTION_SCALE, roundFraction(outline.width)),
    height: Math.max(1 / FRACTION_SCALE, roundFraction(outline.height)),
  };
}

export function roundChairPitch(pitch: number): number {
  return Math.round(Math.min(MAX_CHAIR_PITCH, Math.max(MIN_CHAIR_PITCH, pitch)) * FRACTION_SCALE) / FRACTION_SCALE;
}

// Clamps to [0, 1] and keeps 4 decimals (0.01% of the image is far below a click's precision).
export function roundFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * FRACTION_SCALE) / FRACTION_SCALE;
}

// The first free „Stolik N” / "Table N" (N = 1, 2, …), compared like the unique index.
export function nextTableName(existingNames: readonly string[], locale: Locale = "pl"): string {
  const taken = new Set(existingNames.map(venueNameKey));
  const prefix = venueMessages(locale).tableNamePrefix;
  for (let number = 1; ; number++) {
    const name = `${prefix} ${number}`;
    if (!taken.has(venueNameKey(name))) {
      return name;
    }
  }
}

const tableNameCollator = new Intl.Collator("pl", { numeric: true });

// Polish alphabetical order with numbers compared by value: „Stolik 2” before „Stolik 10”.
export function compareTableNames(a: string, b: string): number {
  return tableNameCollator.compare(a, b);
}
