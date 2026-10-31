// Guest-name rules shared by the DB service, the API routes and the organizer UI (PRD FR-001, FR-002).
// Pure functions only: no DB, no `astro:*`.
//
// A display name is stored normalized (NFC, no invisible characters, single spaces, trimmed) and is 1–40
// characters long, counted in code points like Postgres char_length(). Names are unique per event regardless of
// letter case, so two guests never look the same on the TV plan or on the QR cards. The DB enforces the same rules
// (check constraint + unique index on lower(display_name)) as a backstop.

export const MAX_GUESTS = 100;
export const MAX_DISPLAY_NAME_LENGTH = 40;
export const MIN_GROUP_SIZE = 2;
export const MAX_GROUP_SIZE = 5;

export type DisplayNameProblem = "empty" | "too-long";

export type GuestListProblem =
  | { line: number; text: string; reason: "too-long" }
  | { line: number; text: string; reason: "duplicate"; firstLine: number };

export interface ParsedGuestList {
  names: string[];
  problems: GuestListProblem[];
}

// Invisible format characters (zero-width spaces/joiners, BOM, bidi marks, soft hyphen) are dropped; control
// characters (tabs from a spreadsheet, stray newlines) and every Unicode space become a single plain space.
const FORMAT_CHARACTERS = /\p{Cf}/gu;
const CONTROL_OR_SPACE_RUN = /[\p{Cc}\s]+/gu;
// "- Ania", "* Ania", "• Ania", "– Ania", "1. Ania", "12) Ania" → "Ania". A marker must be followed by a space,
// so names such as "2Pac" or "-Ania" stay untouched.
const LIST_MARKER = /^(?:[-*•–—]|\d{1,3}[.)]) /u;

// Drops one leading list marker from an already normalized line (also used by the question paste, S-07).
export function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER, "");
}
const LINE_BREAK = /\r\n|\n|\r/;
const PREVIEW_LENGTH = 50;

export function normalizeDisplayName(raw: string): string {
  return raw.normalize("NFC").replace(FORMAT_CHARACTERS, "").replace(CONTROL_OR_SPACE_RUN, " ").trim();
}

// Comparison key for the "same name" rule (mirrors lower(display_name) in the unique index).
export function displayNameKey(name: string): string {
  return normalizeDisplayName(name).toLocaleLowerCase("pl");
}

// Length in code points (an emoji counts once), like Postgres char_length().
export function displayNameLength(name: string): number {
  return Array.from(name).length;
}

// Expects a normalized name.
export function validateDisplayName(name: string): DisplayNameProblem | null {
  if (name === "") {
    return "empty";
  }
  if (displayNameLength(name) > MAX_DISPLAY_NAME_LENGTH) {
    return "too-long";
  }
  return null;
}

// Parses a pasted list, one person per line. Blank lines are skipped; list markers are stripped. Lines that are too
// long, and later repetitions of a name already on the list, are reported as problems (1-based line numbers,
// counting blank lines) instead of being added; the caller decides what to do with them.
export function parseGuestList(text: string): ParsedGuestList {
  const names: string[] = [];
  const problems: GuestListProblem[] = [];
  const firstLineByKey = new Map<string, number>();

  text.split(LINE_BREAK).forEach((rawLine, index) => {
    const line = index + 1;
    const name = stripListMarker(normalizeDisplayName(rawLine));
    const problem = validateDisplayName(name);
    if (problem === "empty") {
      return;
    }
    if (problem === "too-long") {
      problems.push({ line, text: name, reason: "too-long" });
      return;
    }
    const key = displayNameKey(name);
    const firstLine = firstLineByKey.get(key);
    if (firstLine !== undefined) {
      problems.push({ line, text: name, reason: "duplicate", firstLine });
      return;
    }
    firstLineByKey.set(key, line);
    names.push(name);
  });

  return { names, problems };
}

function preview(text: string): string {
  const characters = Array.from(text);
  return characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join("")}…` : text;
}

export function describeGuestListProblem(problem: GuestListProblem): string {
  switch (problem.reason) {
    case "too-long":
      return `Linia ${problem.line}: „${preview(problem.text)}” — za długa nazwa (najwyżej ${MAX_DISPLAY_NAME_LENGTH} znaków).`;
    case "duplicate":
      return `Linia ${problem.line}: „${problem.text}” — powtarza linię ${problem.firstLine}.`;
  }
}

export function describeDisplayNameProblem(problem: DisplayNameProblem): string {
  switch (problem) {
    case "empty":
      return "Wpisz imię lub ksywkę.";
    case "too-long":
      return `Nazwa może mieć najwyżej ${MAX_DISPLAY_NAME_LENGTH} znaków.`;
  }
}

// „Ania”, „Kuba” — for messages that list names.
export function quoteNames(names: readonly string[]): string {
  return names.map((name) => `„${name}”`).join(", ");
}

export function isValidGroupSize(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_GROUP_SIZE && count <= MAX_GROUP_SIZE;
}
