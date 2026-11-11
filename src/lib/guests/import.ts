import { foldDietWord, parseDietCell, parseDietNote, type DietTag } from "@/lib/diets/rules";
import type { Locale } from "@/lib/i18n/locale";
import type { GuestImportPreviewDto, GuestImportSeparator } from "@/types";
import { guestsMessages } from "./messages";
import {
  displayNameKey,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_GUESTS,
  normalizeDisplayName,
  stripListMarker,
  validateDisplayName,
} from "./names";

// The guest import (guest-import-diets, S-23; PRD v2 FR-035), pure: a CSV file or a paste from a spreadsheet with the
// columns name, diet, notes → the rows to add and every problem per line. No dependency, no `.xlsx`.
//
// Text: a UTF-8 BOM is dropped (the browser decodes the file: UTF-8, else Windows-1250 for Polish Excel). Records are
// split RFC 4180-style: double quotes, "" for a quote, line breaks inside quotes. Separator: a tab when the first
// non-blank line has one (a spreadsheet paste), else ";" or "," — whichever appears more often outside quotes, ";" on a
// tie (Polish Excel) — else one column (a plain list, one name per line; list markers are dropped like the paste).
// Header: the first record when one of its cells is a known column name (PL/EN); then the columns are found by name in
// any order, else they are positional (name, diet, notes; more columns are ignored). Groups are made on the list after
// the import (no group column). Saving is all-or-nothing: any problem saves nothing.

export const MAX_IMPORT_RECORDS = 1_000;
// Characters of one import's text (the island refuses more before sending; the route's body schema too).
export const MAX_IMPORT_TEXT_LENGTH = 200_000;

export interface GuestImportRow {
  line: number;
  name: string;
  diets: DietTag[];
  note: string | null;
}

export type GuestImportProblem =
  | { reason: "name-missing"; line: number }
  | { reason: "too-long"; line: number; text: string }
  | { reason: "duplicate"; line: number; text: string; firstLine: number }
  | { reason: "on-list"; line: number; text: string }
  | { reason: "unknown-diet"; line: number; text: string; words: string[] }
  | { reason: "note-too-long"; line: number; text: string }
  | { reason: "too-many"; existing: number; rows: number }
  | { reason: "too-many-lines" }
  | { reason: "empty" };

export interface ParsedGuestImport {
  rows: GuestImportRow[];
  problems: GuestImportProblem[];
  header: boolean;
  separator: GuestImportSeparator;
}

interface RawRecord {
  line: number;
  cells: string[];
}

const SEPARATOR_CHARS: Record<GuestImportSeparator, string | null> = {
  tab: "\t",
  semicolon: ";",
  comma: ",",
  none: null,
};

// Counts tabs, semicolons and commas outside double quotes in one line.
function countOutsideQuotes(line: string): { tab: number; semicolon: number; comma: number } {
  const counts = { tab: 0, semicolon: 0, comma: 0 };
  let quoted = false;
  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted) {
      if (character === "\t") {
        counts.tab += 1;
      } else if (character === ";") {
        counts.semicolon += 1;
      } else if (character === ",") {
        counts.comma += 1;
      }
    }
  }
  return counts;
}

export function detectSeparator(text: string): GuestImportSeparator {
  const first = text.split(/\r\n|\n|\r/).find((line) => line.trim() !== "");
  if (first === undefined) {
    return "none";
  }
  const counts = countOutsideQuotes(first);
  if (counts.tab > 0) {
    return "tab";
  }
  if (counts.semicolon > 0 && counts.semicolon >= counts.comma) {
    return "semicolon";
  }
  return counts.comma > 0 ? "comma" : "none";
}

// RFC 4180-style records with the 1-based line each starts on (line breaks inside quotes move the count on).
export function splitRecords(text: string, separator: string | null): RawRecord[] {
  const records: RawRecord[] = [];
  let index = 0;
  let line = 1;
  while (index < text.length) {
    const recordLine = line;
    const cells: string[] = [];
    let field = "";
    let quoted = false;
    let ended = false;
    while (index < text.length && !ended) {
      const character = text[index];
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 2;
          } else {
            quoted = false;
            index += 1;
          }
          continue;
        }
        if (character === "\r" || character === "\n") {
          line += 1;
          if (character === "\r" && text[index + 1] === "\n") {
            index += 1;
          }
          field += "\n";
          index += 1;
          continue;
        }
        field += character;
        index += 1;
        continue;
      }
      if (character === '"' && field.trim() === "") {
        quoted = true;
        field = "";
        index += 1;
      } else if (separator !== null && character === separator) {
        cells.push(field);
        field = "";
        index += 1;
      } else if (character === "\r" || character === "\n") {
        index += character === "\r" && text[index + 1] === "\n" ? 2 : 1;
        line += 1;
        ended = true;
      } else {
        field += character;
        index += 1;
      }
    }
    cells.push(field);
    records.push({ line: recordLine, cells });
  }
  return records;
}

// Column names a header may use (folded: lower case, no diacritics).
const NAME_HEADERS = new Set([
  "imie",
  "imiona",
  "imie i nazwisko",
  "nazwisko",
  "nazwa",
  "nazwa goscia",
  "gosc",
  "goscie",
  "osoba",
  "osoby",
  "uczestnik",
  "uczestnicy",
  "name",
  "names",
  "full name",
  "guest",
  "guests",
  "guest name",
  "first name",
]);
const DIET_HEADERS = new Set([
  "dieta",
  "diety",
  "alergia",
  "alergie",
  "dieta i alergie",
  "diety i alergie",
  "dieta/alergie",
  "dieta / alergie",
  "wymagania dietetyczne",
  "diet",
  "diets",
  "allergy",
  "allergies",
  "diet and allergies",
  "dietary requirements",
]);
const NOTE_HEADERS = new Set([
  "uwagi",
  "uwaga",
  "uwagi dla kuchni",
  "notatki",
  "notatka",
  "komentarz",
  "komentarze",
  "notes",
  "note",
  "comment",
  "comments",
  "remarks",
]);

type Column = "name" | "diet" | "note";

function headerColumn(cell: string): Column | null {
  const word = foldDietWord(cell);
  if (NAME_HEADERS.has(word)) {
    return "name";
  }
  if (DIET_HEADERS.has(word)) {
    return "diet";
  }
  return NOTE_HEADERS.has(word) ? "note" : null;
}

// The header's column positions, or null when the record is not a header.
function readHeader(cells: readonly string[]): Record<Column, number | null> | null {
  const found: Record<Column, number | null> = { name: null, diet: null, note: null };
  for (const [index, cell] of cells.entries()) {
    const column = headerColumn(cell);
    if (column !== null && found[column] === null) {
      found[column] = index;
    }
  }
  if (found.name === null && found.diet === null && found.note === null) {
    return null;
  }
  if (found.name === null) {
    // A header without a name column: the first column nobody else took.
    const taken = new Set([found.diet, found.note]);
    found.name = cells.findIndex((_, index) => !taken.has(index));
  }
  return found;
}

function cellAt(cells: readonly string[], index: number | null): string {
  return index === null || index < 0 ? "" : (cells[index] ?? "");
}

// Parses the text into rows and per-line problems (no list check: see checkImportAgainstList).
export function parseGuestImport(text: string): ParsedGuestImport {
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const separator = detectSeparator(body);
  const all = splitRecords(body, SEPARATOR_CHARS[separator]).filter((record) =>
    record.cells.some((cell) => cell.trim() !== ""),
  );
  const problems: GuestImportProblem[] = [];
  const rows: GuestImportRow[] = [];

  const columns = all.length > 0 ? readHeader(all[0].cells) : null;
  const header = columns !== null;
  const map: Record<Column, number | null> = columns ?? { name: 0, diet: 1, note: 2 };
  let records = header ? all.slice(1) : all;
  if (records.length > MAX_IMPORT_RECORDS) {
    problems.push({ reason: "too-many-lines" });
    records = records.slice(0, MAX_IMPORT_RECORDS);
  }

  const firstLineByKey = new Map<string, number>();
  for (const record of records) {
    const rawName = normalizeDisplayName(cellAt(record.cells, map.name));
    const name = separator === "none" ? stripListMarker(rawName) : rawName;
    const dietCell = cellAt(record.cells, map.diet);
    const noteCell = cellAt(record.cells, map.note);
    const line = record.line;

    if (validateDisplayName(name) === "empty") {
      if (dietCell.trim() !== "" || noteCell.trim() !== "") {
        problems.push({ reason: "name-missing", line });
      }
      continue;
    }
    let ok = true;
    if (validateDisplayName(name) === "too-long") {
      problems.push({ reason: "too-long", line, text: name });
      ok = false;
    } else {
      const key = displayNameKey(name);
      const firstLine = firstLineByKey.get(key);
      if (firstLine !== undefined) {
        problems.push({ reason: "duplicate", line, text: name, firstLine });
        ok = false;
      } else {
        firstLineByKey.set(key, line);
      }
    }
    const diet = parseDietCell(dietCell);
    if (diet.unknown.length > 0) {
      problems.push({ reason: "unknown-diet", line, text: name, words: diet.unknown });
      ok = false;
    }
    const note = parseDietNote(noteCell);
    if (!note.ok) {
      problems.push({ reason: "note-too-long", line, text: name });
      ok = false;
    }
    if (ok && note.ok) {
      rows.push({ line, name, diets: diet.tags, note: note.note });
    }
  }
  return { rows, problems, header, separator };
}

// Adds the problems that depend on the guest list: a name already on it, and the guest limit.
export function checkImportAgainstList(parsed: ParsedGuestImport, existingNames: readonly string[]): ParsedGuestImport {
  const taken = new Set(existingNames.map(displayNameKey));
  const problems = [...parsed.problems];
  const rows: GuestImportRow[] = [];
  for (const row of parsed.rows) {
    if (taken.has(displayNameKey(row.name))) {
      problems.push({ reason: "on-list", line: row.line, text: row.name });
    } else {
      rows.push(row);
    }
  }
  if (existingNames.length + rows.length > MAX_GUESTS) {
    problems.push({ reason: "too-many", existing: existingNames.length, rows: rows.length });
  }
  if (rows.length === 0 && problems.length === 0) {
    problems.push({ reason: "empty" });
  }
  problems.sort((a, b) => lineOf(a) - lineOf(b));
  return { ...parsed, rows, problems };
}

function lineOf(problem: GuestImportProblem): number {
  return "line" in problem ? problem.line : Number.MAX_SAFE_INTEGER;
}

const PREVIEW_LENGTH = 50;

function preview(text: string): string {
  const characters = Array.from(text);
  return characters.length > PREVIEW_LENGTH ? `${characters.slice(0, PREVIEW_LENGTH).join("")}…` : text;
}

export function describeImportProblem(problem: GuestImportProblem, locale: Locale = "pl"): string {
  const t = guestsMessages(locale);
  switch (problem.reason) {
    case "name-missing":
      return t.importNameMissing(problem.line);
    case "too-long":
      return t.lineTooLong(problem.line, preview(problem.text), MAX_DISPLAY_NAME_LENGTH);
    case "duplicate":
      return t.lineDuplicate(problem.line, problem.text, problem.firstLine);
    case "on-list":
      return t.importOnList(problem.line, problem.text);
    case "unknown-diet":
      return t.importUnknownDiet(problem.line, problem.text, problem.words.map((word) => t.quote(word)).join(", "));
    case "note-too-long":
      return t.importNoteTooLong(problem.line, problem.text);
    case "too-many":
      return t.importTooMany(MAX_GUESTS, problem.existing, problem.rows);
    case "too-many-lines":
      return t.importTooManyLines(MAX_IMPORT_RECORDS);
    case "empty":
      return t.importEmpty;
  }
}

// What the route answers (and the island shows) for a checked import.
export function toImportPreview(
  checked: ParsedGuestImport,
  existing: number,
  locale: Locale = "pl",
): GuestImportPreviewDto {
  return {
    rows: checked.rows.map((row) => ({ line: row.line, name: row.name, diets: row.diets, note: row.note })),
    problems: checked.problems.map((problem) => describeImportProblem(problem, locale)),
    header: checked.header,
    separator: checked.separator,
    existing,
    ready: checked.problems.length === 0 && checked.rows.length > 0,
  };
}
