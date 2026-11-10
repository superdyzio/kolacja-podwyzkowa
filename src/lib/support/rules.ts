import type { StaffRole } from "@/lib/auth/types";

// Rules of the platform admin's support access (admin-support-log, S-13; FR-021, US-05, US-10, NFR-012). Pure: routes,
// pages and islands share them (no DB, no node:crypto, no astro:*).
//
// Support mode is READ-ONLY: the central panel guard admits it only on reads (isReadMethod) and only on routes that
// admit the owner role (SUPPORT_ROLE: support mode sees what the restaurant's owner sees). It lasts SUPPORT_MINUTES
// from the entry, bound to the admin's login session. The reason is shown to the restaurant's owner in the log.

export const SUPPORT_MINUTES = 60;
export const SUPPORT_REASON_MIN = 3;
export const SUPPORT_REASON_MAX = 300;
// The owner's page and API show the newest entries only.
export const SUPPORT_LOG_LIMIT = 100;
// The longest request path the log keeps (the column's check); longer paths are cut, never refused.
export const SUPPORT_PATH_MAX = 300;

// Who reads the support log: the restaurant's owners (managers and waiters get the identical 404).
export const SUPPORT_LOG_ROLES: readonly StaffRole[] = ["owner"];
// The role whose view support mode gets (read-only).
export const SUPPORT_ROLE: StaffRole = "owner";

// The panel path where support mode starts for a restaurant.
export function supportStartPath(restaurantId: number): string {
  return `/panel/restauracje/${String(restaurantId)}`;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

export type SupportReasonProblem = "short" | "long";

export type SupportReasonResult = { ok: true; reason: string } | { ok: false; problem: SupportReasonProblem };

// Invisible format characters are dropped; control characters (line breaks of the text field) and every Unicode
// space become one plain space; trimmed (like guest names). Length in code points, like Postgres char_length().
const FORMAT_CHARACTERS = /\p{Cf}/gu;
const CONTROL_OR_SPACE_RUN = /[\p{Cc}\s]+/gu;

export function normalizeSupportReason(raw: string): string {
  return raw.normalize("NFC").replace(FORMAT_CHARACTERS, "").replace(CONTROL_OR_SPACE_RUN, " ").trim();
}

export function parseSupportReason(raw: string): SupportReasonResult {
  const reason = normalizeSupportReason(raw);
  const length = Array.from(reason).length;
  if (length < SUPPORT_REASON_MIN) {
    return { ok: false, problem: "short" };
  }
  if (length > SUPPORT_REASON_MAX) {
    return { ok: false, problem: "long" };
  }
  return { ok: true, reason };
}

// The request path as the log keeps it (cut to the column's limit, by code points).
export function loggedPath(path: string): string {
  const points = Array.from(path);
  return points.length <= SUPPORT_PATH_MAX ? path : points.slice(0, SUPPORT_PATH_MAX).join("");
}

// What part of the restaurant's data a logged path opened (for the owner's log).
export type SupportArea = "restaurant" | "events" | "team" | "log" | "event" | "other";

const AREAS: [RegExp, SupportArea][] = [
  [/^\/panel\/restauracje\/[^/]+\/?$/, "restaurant"],
  [/^\/panel\/wydarzenia\/[^/]+\/?$/, "event"],
  [/^\/api\/panel\/restaurants\/[^/]+\/?$/, "restaurant"],
  [/^\/api\/panel\/restaurants\/[^/]+\/events\/?$/, "events"],
  [/^\/api\/panel\/restaurants\/[^/]+\/team(\/.*)?$/, "team"],
  [/^\/api\/panel\/restaurants\/[^/]+\/support-log\/?$/, "log"],
  [/^\/api\/panel\/events\/[^/]+(\/.*)?$/, "event"],
];

export function supportArea(path: string): SupportArea {
  for (const [pattern, area] of AREAS) {
    if (pattern.test(path)) {
      return area;
    }
  }
  return "other";
}

export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}
