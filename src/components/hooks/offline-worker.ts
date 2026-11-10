// Registration of the organizer's service worker (S-09, public/organizer-sw.js). Its scope is this organizer link's
// pages (`/o/<key>`, no trailing slash, so the panel itself is covered too); the key is never in the script URL.
// Production builds only, and only where browsers allow workers at all (https or localhost): on a plain-http LAN
// address or in `npm run dev` only the in-page fallback works. Every failure is swallowed — the pages work without it.

export const ORGANIZER_WORKER_URL = "/organizer-sw.js";

// Only the client's own link keeps an offline memory and a worker (client-restaurant-split, S-14): the same islands in
// the restaurant panel (/api/panel/events/<id>/klient) never register a worker or write the memory, which would replace
// the client's saved state in this browser.
export function isOrganizerApiBase(apiBase: string): boolean {
  return /^\/api\/o\/[^/]+$/.test(apiBase);
}

// "/api/o/<key>" → "/o/<key>".
export function organizerScope(apiBase: string): string {
  return apiBase.replace(/^\/api(?=\/)/, "");
}

let registered = false;

export function registerOrganizerWorker(apiBase: string) {
  if (registered || !import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) {
    return;
  }
  registered = true;
  navigator.serviceWorker
    .register(ORGANIZER_WORKER_URL, { scope: organizerScope(apiBase) })
    .then((registration) => {
      // A worker installed earlier refreshes its copy of the readout page (at most every 10 minutes); a new one does
      // that while installing.
      registration.active?.postMessage({ type: "refresh" });
    })
    .catch(() => undefined);
}
