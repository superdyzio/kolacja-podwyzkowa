// CSRF guard of the staff areas (staff-accounts, F-03): the session cookie goes with every request, so every mutation
// under /api/panel/… and /api/auth/… must come from our own pages. Astro's built-in check covers only form content
// types and lets a request through when the header is missing; this one refuses any non-safe method whose Origin is
// missing or differs from the request URL's origin (https behind the Lambda proxy, where Astro trusts
// X-Forwarded-Proto). Pure.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isMutation(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOrigin(originHeader: string | null, urlOrigin: string): boolean {
  return originHeader !== null && originHeader === urlOrigin;
}
