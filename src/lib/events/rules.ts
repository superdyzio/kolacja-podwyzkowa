import type { StaffRole } from "@/lib/auth/types";
import { normalizeDisplayName } from "@/lib/guests/names";

// Input rules and role sets of a restaurant's events (restaurant-events, S-11), shared by the API routes and the
// islands. Pure: no DB, no node:crypto, no `astro:*`. Lengths are counted in code points like Postgres char_length().

export const EVENT_NAME_MAX = 120;
export const EXPECTED_GUESTS_MAX = 1000;
// The DB check (event_date_range); a typo like 0026 or 20260 never becomes an event.
export const EVENT_DATE_MIN = "2000-01-01";
export const EVENT_DATE_MAX = "2100-12-31";

// Who manages a restaurant's events (PRD v2 access table): owners and managers create, list, open the card, copy and
// replace links, edit, archive and restore; only owners delete permanently. Waiters (their day view is S-21), staff of
// other restaurants and anyone else get the guard's one 404. S-12's managers inherit exactly these rights.
export const EVENT_STAFF_ROLES: readonly StaffRole[] = ["owner", "manager"];
export const EVENT_DELETE_ROLES: readonly StaffRole[] = ["owner"];

// review-fixes: the 409 code of a date change that would delete the guests' data at once — the new date is already past
// the restaurant's guest data term and the event still holds guest data (the next guard would purge it).
export const DATE_WOULD_PURGE_CODE = "date-would-purge";

export function canManageEvents(role: StaffRole): boolean {
  return EVENT_STAFF_ROLES.includes(role);
}

export function canDeleteEvents(role: StaffRole): boolean {
  return EVENT_DELETE_ROLES.includes(role);
}

// The three links of an event the panel can replace (guests' personal links are the client's, S-05).
export const EVENT_LINK_KINDS = ["organizer", "tv", "restaurant"] as const;
export type EventLinkKind = (typeof EVENT_LINK_KINDS)[number];

export function isEventLinkKind(value: unknown): value is EventLinkKind {
  return typeof value === "string" && (EVENT_LINK_KINDS as readonly string[]).includes(value);
}

function codePoints(text: string): number {
  return Array.from(text).length;
}

export type EventNameResult = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" };

// An event's name: normalized like guest names (NFC, no invisible characters, single spaces, trimmed), 1–120.
export function parseEventName(raw: string): EventNameResult {
  const name = normalizeDisplayName(raw);
  if (name === "") {
    return { ok: false, reason: "empty" };
  }
  if (codePoints(name) > EVENT_NAME_MAX) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, name };
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type EventDateResult = { ok: true; date: string } | { ok: false };

// A calendar date exactly as YYYY-MM-DD (what <input type="date"> sends), a real day, 2000-01-01…2100-12-31.
export function parseEventDate(raw: string): EventDateResult {
  const text = raw.trim();
  const match = DATE_PATTERN.exec(text);
  if (!match) {
    return { ok: false };
  }
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const real =
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day);
  if (!real || text < EVENT_DATE_MIN || text > EVENT_DATE_MAX) {
    return { ok: false };
  }
  return { ok: true, date: text };
}

export type ExpectedGuestsResult = { ok: true; value: number | null } | { ok: false };

// The expected number of guests: a whole number 1–1000, or none (null / undefined).
export function parseExpectedGuests(value: number | null | undefined): ExpectedGuestsResult {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!Number.isInteger(value) || value < 1 || value > EXPECTED_GUESTS_MAX) {
    return { ok: false };
  }
  return { ok: true, value };
}

// The form's text field → the API's value: "" → null, "80" → 80, anything else → NaN (refused by the server's rule).
export function expectedGuestsFromField(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
}

export type EventInputProblem = "name-empty" | "name-too-long" | "date" | "guests" | "nothing";

export interface EventInput {
  name?: string;
  date?: string;
  expectedGuests?: number | null;
}

export interface ValidEventInput {
  name?: string;
  date?: string;
  expectedGuests?: number | null;
}

export type EventInputResult = { ok: true; value: ValidEventInput } | { ok: false; problem: EventInputProblem };

// Validates the fields that are present (undefined = keep), in form order; the first problem wins.
export function validateEventInput(input: EventInput): EventInputResult {
  const value: ValidEventInput = {};
  if (input.name !== undefined) {
    const name = parseEventName(input.name);
    if (!name.ok) {
      return { ok: false, problem: name.reason === "empty" ? "name-empty" : "name-too-long" };
    }
    value.name = name.name;
  }
  if (input.date !== undefined) {
    const date = parseEventDate(input.date);
    if (!date.ok) {
      return { ok: false, problem: "date" };
    }
    value.date = date.date;
  }
  if (input.expectedGuests !== undefined) {
    const guests = parseExpectedGuests(input.expectedGuests);
    if (!guests.ok) {
      return { ok: false, problem: "guests" };
    }
    value.expectedGuests = guests.value;
  }
  return { ok: true, value };
}
