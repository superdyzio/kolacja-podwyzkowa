import type { StaffRole } from "./messages";

export type { StaffRole } from "./messages";
export type { StaffTokenKind } from "./limits";

// The logged-in person of a request (staff-accounts, F-03): set by the middleware as `locals.staff` in the staff
// areas. Carries no token or hash.
export interface StaffSession {
  sessionId: number;
  accountId: number;
  email: string;
  displayName: string | null;
  isPlatformAdmin: boolean;
  expiresAt: string;
}

// The person's role in one restaurant.
export interface StaffMembership {
  restaurantId: number;
  restaurantName: string;
  role: StaffRole;
}

// A new session's secret (goes only into the Set-Cookie header) and its end.
export interface NewStaffSession {
  token: string;
  expiresAt: string;
}

export const STAFF_ROLES: readonly StaffRole[] = ["owner", "manager", "waiter"];

export function isStaffRole(value: unknown): value is StaffRole {
  return value === "owner" || value === "manager" || value === "waiter";
}
