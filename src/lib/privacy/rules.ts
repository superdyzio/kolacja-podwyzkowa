import type { StaffRole } from "@/lib/auth/types";
import { addDays, platformToday } from "@/lib/events/dates";

// Guest data retention (privacy-retention, S-26; PRD v2 FR-040, NFR-019). Pure rules shared by the DB service, the
// guards, the routes, the pages and the tests. The database decides with the same rule
// (`guest_data_expired(event_date, days, now)` in the migration 20261111050000_privacy_retention.sql).

// The restaurant's term in days after the event (restaurant.guest_retention_days; the DB CHECK mirrors the range).
export const DEFAULT_GUEST_RETENTION_DAYS = 30;
export const MIN_GUEST_RETENTION_DAYS = 1;
export const MAX_GUEST_RETENTION_DAYS = 365;

// The term is a restaurant SETTING (PRD Access Control): only owners change it; owners and managers read it.
export const RETENTION_EDIT_ROLES: readonly StaffRole[] = ["owner"];
export const RETENTION_VIEW_ROLES: readonly StaffRole[] = ["owner", "manager"];
// The export of an event's data: owners and managers (members only — never the admin's support mode).
export const EXPORT_ROLES: readonly StaffRole[] = ["owner", "manager"];

// The lazy sweep (panel page views): at most once per interval per server instance and once per interval in the
// database (claim_retention_sweep), at most this many events per run.
export const RETENTION_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
export const RETENTION_SWEEP_LIMIT = 25;

export type RetentionDaysResult = { ok: true; days: number } | { ok: false };

// A whole number of days in the allowed range (a JSON number; strings, fractions and anything else are refused).
export function parseRetentionDays(value: unknown): RetentionDaysResult {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_GUEST_RETENTION_DAYS ||
    value > MAX_GUEST_RETENTION_DAYS
  ) {
    return { ok: false };
  }
  return { ok: true, days: value };
}

// The same number written in a query parameter (`?days=7`; retention-preview): digits only, then the range.
export function parseRetentionDaysText(text: string): RetentionDaysResult {
  return /^\d{1,4}$/.test(text) ? parseRetentionDays(Number(text)) : { ok: false };
}

// The last day ("YYYY-MM-DD", Europe/Warsaw) the guests' data of an event dated `eventDate` is kept.
export function guestDataDeleteAfter(eventDate: string, retentionDays: number): string {
  return addDays(eventDate, retentionDays);
}

// True once the platform's day is later than the last day the data is kept. With retentionDays ≥ 1 this is never
// inside the event's floor window (its day until noon of the next one): the earliest is 00:00 two days after it.
export function isGuestDataExpired(eventDate: string, retentionDays: number, now: Date): boolean {
  return platformToday(now) > guestDataDeleteAfter(eventDate, retentionDays);
}

// The in-process half of the sweep's throttle: `due(nowMs)` is true at most once per interval (the first call is
// due). A server instance asks the database to claim the sweep only when it is due.
export function createSweepThrottle(intervalMs: number): { due: (nowMs: number) => boolean } {
  let nextAt = Number.NEGATIVE_INFINITY;
  return {
    due(nowMs: number) {
      if (nowMs < nextAt) {
        return false;
      }
      nextAt = nowMs + intervalMs;
      return true;
    },
  };
}
