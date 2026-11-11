// The staff areas of the app (staff-accounts, F-03) and their rules, decided by the path only. Pure.
//
// - panel      /panel, /panel/…          needs a session; without one → 303 to the login page
// - panel-api  /api/panel, /api/panel/…  needs a session; without one → 401 with one fixed body
// - auth-page  /logowanie, /haslo/<token>  public (login, setting a password from a one-time link)
// - auth-api   /api/auth/…               public form endpoints (login, logout, password link)
// Every mutation under panel-api and auth-api must carry a same-origin Origin header (middleware). The link-key areas
// (/o/ /tv/ /g/ /r/) are separate and unchanged.

export type AuthArea = "panel" | "panel-api" | "auth-page" | "auth-api";

export const LOGIN_PATH = "/logowanie";
export const PANEL_PATH = "/panel";

export function setPasswordPath(token: string): string {
  return `/haslo/${token}`;
}

const AREAS: [RegExp, AuthArea][] = [
  [/^\/panel(\/.*)?$/, "panel"],
  [/^\/api\/panel(\/.*)?$/, "panel-api"],
  [/^\/logowanie\/?$/, "auth-page"],
  [/^\/haslo\/[^/]+\/?$/, "auth-page"],
  [/^\/api\/auth(\/.*)?$/, "auth-api"],
];

export function classifyAuthPath(pathname: string): AuthArea | null {
  for (const [pattern, area] of AREAS) {
    if (pattern.test(pathname)) {
      return area;
    }
  }
  return null;
}

// Headers of every answer in the staff areas. Like the link-key areas (no caching, no indexing) plus no framing
// (password forms), BUT `Referrer-Policy: same-origin` instead of `no-referrer`: a plain HTML form post is a navigation
// request, and for those browsers send `Origin: null` when the page's policy is `no-referrer` (Fetch spec, "append a
// request Origin header") — Astro's own origin check and ours would then refuse every login. `same-origin` still never
// sends a referrer (so never a /haslo/<token> path) to another site.
export const AUTH_AREA_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
};
