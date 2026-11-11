import { eventTiming } from "@/lib/events/dates";
import { displayNameLength, normalizeDisplayName } from "@/lib/guests/names";
import type { EventWaiterStatus } from "@/types";

// The per-event waiter („kelner na imprezę”, event-waiter-access, S-21b; PRD v2 FR-023, FR-029, US-08). Pure rules
// shared by the server, the islands and the tests. A per-event waiter is NOT an account: an owner or a manager adds a
// name, the server hands out once a one-time link and a short code, and whichever is used first opens the floor of
// that ONE event (S-21's floor) until noon Europe/Warsaw of the day after it.

// At most this many per-event waiters per event (rows of any status; a revoke deletes the row).
export const MAX_EVENT_WAITERS = 30;
export const WAITER_NAME_MAX_LENGTH = 40;

// The code: „<waiter id>-XXXX-XXXX”. The secret is 8 characters of an alphabet a phone keyboard cannot confuse — no 0,
// O, 1, I or L (31 characters, ≈ 39.6 bits). The prefix scopes it to one waiter row, whose DB throttle (10 tries per
// 15 minutes) leaves ≈ 2·10⁻⁹ odds over the at most 36-hour window.
export const WAITER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const WAITER_CODE_SECRET_LENGTH = 8;
const WAITER_CODE_GROUP = 4;
const MAX_WAITER_ID = Number.MAX_SAFE_INTEGER;

export function formatWaiterCode(waiterId: number, secret: string): string {
  return `${String(waiterId)}-${secret.slice(0, WAITER_CODE_GROUP)}-${secret.slice(WAITER_CODE_GROUP)}`;
}

// The typed code → the waiter id and the secret, or null when malformed. Case-insensitive; spaces and dashes between the
// parts are free („57 k7mq x3pa”, „57-K7MQX3PA”), but the id must be separated from the secret.
export function parseWaiterCode(raw: string): { waiterId: number; secret: string } | null {
  const parts = raw
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }
  const [idText, ...rest] = parts as [string, ...string[]];
  if (!/^[1-9][0-9]{0,15}$/.test(idText)) {
    return null;
  }
  const waiterId = Number(idText);
  const secret = rest.join("");
  if (waiterId > MAX_WAITER_ID || secret.length !== WAITER_CODE_SECRET_LENGTH) {
    return null;
  }
  for (const character of secret) {
    if (!WAITER_CODE_ALPHABET.includes(character)) {
      return null;
    }
  }
  return { waiterId, secret };
}

export type WaiterNameProblem = "empty" | "too-long";

// The name: normalized like a guest's name, 1–40 code points (the DB checks the same).
export function parseWaiterName(raw: string): { ok: true; name: string } | { ok: false; problem: WaiterNameProblem } {
  const name = normalizeDisplayName(raw);
  if (name === "") {
    return { ok: false, problem: "empty" };
  }
  if (displayNameLength(name) > WAITER_NAME_MAX_LENGTH) {
    return { ok: false, problem: "too-long" };
  }
  return { ok: true, name };
}

// Expired once its time is up (redeemed or not), else redeemed or still unused.
export function waiterStatus(row: { redeemedAt: string | null; expiresAt: string }, now: Date): EventWaiterStatus {
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  return row.redeemedAt === null ? "unused" : "redeemed";
}

// A waiter may be added to an event that is not archived and whose floor window has not ended yet: today's or an
// upcoming one (a manager prepares the night before). Mirrors add_event_waiter's EVENT_CLOSED (expiry = noon after).
export function canAddWaiter(eventDate: string, archivedAt: string | null, now: Date): boolean {
  return archivedAt === null && eventTiming(eventDate, now) !== "past";
}

// The cookie lives exactly as long as the waiter row (at least one second).
export function waiterCookieMaxAge(expiresAt: string, now: Date): number {
  return Math.max(1, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}
