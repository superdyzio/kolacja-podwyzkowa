import { displayNameKey, displayNameLength, normalizeDisplayName } from "@/lib/guests/names";
import type { TableShape } from "@/types";

// Room and table rules shared by the DB service, the API routes and the organizer UI (PRD FR-005, FR-006).
// Pure functions only: no DB, no `astro:*`. The DB enforces the same limits (check constraints, unique indexes on
// lower(name)) as a backstop.
//
// Names are normalized like guest names (NFC, no invisible characters, single spaces, trimmed) and counted in code
// points. Room and table names are unique per event regardless of letter case: every table appears on the one TV
// plan, so two tables must never look the same.

export const MAX_ROOMS = 10;
export const MAX_TABLES = 40;
export const MAX_ROOM_NAME_LENGTH = 40;
export const MAX_TABLE_NAME_LENGTH = 24;
export const MIN_SEATS = 2;
export const MAX_SEATS = 20;
export const DEFAULT_SEATS = 8;

export const TABLE_SHAPES = ["round", "rectangular"] as const satisfies readonly TableShape[];

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  round: "okrągły",
  rectangular: "prostokątny",
};

export type VenueNameProblem = "empty" | "too-long";

const FRACTION_DECIMALS = 4;
const FRACTION_SCALE = 10 ** FRACTION_DECIMALS;
const TABLE_NAME_PREFIX = "Stolik";

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

export function describeRoomNameProblem(problem: VenueNameProblem): string {
  return problem === "empty" ? "Wpisz nazwę sali." : `Nazwa sali może mieć najwyżej ${MAX_ROOM_NAME_LENGTH} znaków.`;
}

export function describeTableNameProblem(problem: VenueNameProblem): string {
  return problem === "empty"
    ? "Wpisz nazwę stolika."
    : `Nazwa stolika może mieć najwyżej ${MAX_TABLE_NAME_LENGTH} znaków.`;
}

export const SEAT_COUNT_MESSAGE = `Stolik ma od ${MIN_SEATS} do ${MAX_SEATS} miejsc.`;
export const POSITION_MESSAGE = "Kliknij na planie, gdzie stoi stolik.";

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

// Clamps to [0, 1] and keeps 4 decimals (0.01% of the image is far below a click's precision).
export function roundFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * FRACTION_SCALE) / FRACTION_SCALE;
}

// The first free „Stolik N” (N = 1, 2, …), compared like the unique index.
export function nextTableName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map(venueNameKey));
  for (let number = 1; ; number++) {
    const name = `${TABLE_NAME_PREFIX} ${number}`;
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
