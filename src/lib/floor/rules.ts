import type { StaffRole } from "@/lib/auth/types";
import type { ClientRoutePattern } from "@/lib/client-routes/match";
import { addDays, DAY_ROLLOVER_HOUR, eventTiming, localHourToInstant } from "@/lib/events/dates";

// The floor — the waiter's day view (waiter-day-and-refills, S-21; PRD v2 FR-029, US-08). Pure rules shared by the
// guard, the floor dispatcher, the pages and the tests.

// Who works the floor: every member of the restaurant (a waiter has nothing else); the platform administrator never
// (no support mode on the floor).
export const FLOOR_ROLES: readonly StaffRole[] = ["owner", "manager", "waiter"];

// An event is on the floor while it runs today — from its day in Europe/Warsaw until noon of the next day
// (eventTiming's noon rule) — and is not archived. Outside that window every floor route and page is the identical 404.
export function isFloorOpen(eventDate: string, archivedAt: string | null, now: Date): boolean {
  return archivedAt === null && eventTiming(eventDate, now) === "today";
}

// The instant the floor window of an event dated `eventDate` closes: noon Europe/Warsaw of the next day (DST-correct).
// staff-offline-readout (S-27): the staff's offline copies expire then, so nothing of the event day outlives it.
// Any event date the rules allow works, the last one (2100-12-31 → 2101-01-01) included.
export function floorWindowEnd(eventDate: string): string {
  const instant = localHourToInstant(addDays(eventDate, 1), DAY_ROLLOVER_HOUR);
  if (instant === null) {
    throw new Error(`Nieprawidłowa data wydarzenia: ${eventDate}`);
  }
  return instant;
}

// What the floor may run of the client's order routes (the organizer route modules, through the floor dispatcher):
// the board (prices and the bill), new lines (refills — priced by the venue, never by the body), one piece served,
// new drinks on the bill (priced like the lines) and the plan image of the serving plan. „Wydane” for a whole line is
// `orders/:id` PATCH with exactly { delivered } — the dispatcher handles it itself (the organizer PATCH also renames,
// re-counts and moves lines). Nothing else: no guests, seating, links, settings, prices, deletes.
export const FLOOR_ROUTES: Readonly<Partial<Record<ClientRoutePattern, readonly string[]>>> = {
  orders: ["GET", "POST"],
  "orders/:id": ["PATCH"],
  "orders/:id/pieces": ["PUT"],
  drinks: ["POST"],
  "plan/image": ["GET"],
};

export function floorRouteAllows(pattern: ClientRoutePattern, method: string): boolean {
  return FLOOR_ROUTES[pattern]?.includes(method.toUpperCase()) ?? false;
}

export function floorPath(eventId: number): string {
  return `/panel/obsluga/${String(eventId)}`;
}

export function floorApiBase(eventId: number): string {
  return `/api/panel/events/${String(eventId)}/obsluga`;
}
