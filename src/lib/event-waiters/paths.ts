// The per-event waiter's own area (event-waiter-access, S-21b), decided by the path only. Pure.
//
// - waiter-floor      /kelner/sala/…        needs a waiter session; without one → 303 to the entry page
// - waiter-floor-api  /api/kelner/sala/…    needs a waiter session; without one → 401 with one fixed body
// - waiter-api        /api/kelner/…         the entry and logout forms (public)
// - waiter-entry      /kelner, /kelner/<t>  the code form and the one-time link page (public)
// Every mutation under /api/kelner/ must carry the page's own Origin (middleware, before any DB read). The waiter area
// reads only the waiter cookie and the staff areas only the staff cookie, so neither ever opens the other.

export type WaiterArea = "waiter-floor" | "waiter-floor-api" | "waiter-api" | "waiter-entry";

export const WAITER_ENTRY_PATH = "/kelner";
export const WAITER_ENTER_API = "/api/kelner/wejscie";
export const WAITER_LOGOUT_API = "/api/kelner/wyloguj";

export function waiterLinkPath(token: string): string {
  return `${WAITER_ENTRY_PATH}/${token}`;
}

export function waiterFloorPath(eventId: number): string {
  return `/kelner/sala/${String(eventId)}`;
}

export function waiterFloorApiBase(eventId: number): string {
  return `/api/kelner/sala/${String(eventId)}`;
}

// Error codes of the entry page (`/kelner?blad=<code>`): one code for every reason a link or a code does not work.
export const WAITER_ERRORS = { invalid: "niewazny", limit: "limit", db: "baza" } as const;
export type WaiterErrorCode = (typeof WAITER_ERRORS)[keyof typeof WAITER_ERRORS];

// Order matters: the floor areas before the general API and entry patterns.
const AREAS: [RegExp, WaiterArea][] = [
  [/^\/kelner\/sala(\/.*)?$/, "waiter-floor"],
  [/^\/api\/kelner\/sala(\/.*)?$/, "waiter-floor-api"],
  [/^\/api\/kelner(\/.*)?$/, "waiter-api"],
  [/^\/kelner(\/[^/]+)?\/?$/, "waiter-entry"],
];

export function classifyWaiterPath(pathname: string): WaiterArea | null {
  for (const [pattern, area] of AREAS) {
    if (pattern.test(pathname)) {
      return area;
    }
  }
  return null;
}
