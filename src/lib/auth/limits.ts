// Numbers of the staff accounts (staff-accounts, F-03; PRD v2 NFR-013, NFR-022). Pure: shared by the server, the
// tests and (copied) scripts/lib/platform.mjs.

// A login lasts 30 days on the device (fixed from the login, no sliding).
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

// One-time links: an invitation is valid a week, a password reset a day.
export const INVITE_TTL_DAYS = 7;
export const RESET_TTL_HOURS = 24;

// Throttle per typed e-mail: 10 failed attempts within 15 minutes, then refused until the oldest leaves the window.
// A few typos never come close; a guesser gets about 40 tries an hour per address.
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

// Passwords: at least 10 characters (code points), at most 200; no composition rules.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type StaffTokenKind = "invite" | "reset";

export function tokenTtlMs(kind: StaffTokenKind): number {
  return kind === "invite" ? INVITE_TTL_DAYS * 24 * 60 * 60 * 1000 : RESET_TTL_HOURS * 60 * 60 * 1000;
}
