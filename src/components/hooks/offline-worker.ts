// Registration of the readout service worker (S-09, public/organizer-sw.js; staff-offline-readout S-27). One script,
// registered once per scope: the client's link `/o/<key>`, the kitchen tablet `/r/<key>`, the staff floor
// `/panel/obsluga/<id>` and the per-event waiter's floor `/kelner/sala/<id>` (no trailing slash, so the live page
// itself is covered too); the key is never in the script URL. Production builds only, and only where browsers allow
// workers at all (https or localhost): on a plain-http LAN address or in `npm run dev` only the in-page fallback works.
// Every failure is swallowed — the pages work without it.

export const ORGANIZER_WORKER_URL = "/organizer-sw.js";
// The worker's cache names: `kolacja-odczyt|<origin><scope>|<ms>`.
const READOUT_CACHE_PREFIX = "kolacja-odczyt|";

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

const registered = new Set<string>();

export function registerReadoutWorker(scopePath: string) {
  if (
    registered.has(scopePath) ||
    !import.meta.env.PROD ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    return;
  }
  registered.add(scopePath);
  navigator.serviceWorker
    .register(ORGANIZER_WORKER_URL, { scope: scopePath })
    .then((registration) => {
      // A worker installed earlier refreshes its copy of the readout page (at most every 10 minutes); a new one does
      // that while installing.
      registration.active?.postMessage({ type: "refresh" });
    })
    .catch(() => undefined);
}

export function registerOrganizerWorker(apiBase: string) {
  registerReadoutWorker(organizerScope(apiBase));
}

// The scope's full URL without a trailing slash, as the worker names its caches.
function scopeHref(scopePath: string): string {
  return new URL(scopePath, window.location.origin).href.replace(/\/$/, "");
}

// Unregisters the workers and deletes the caches whose scope matches (exact scope, or every scope under a prefix).
async function forget(matches: (href: string) => boolean) {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => matches(registration.scope.replace(/\/$/, "")))
          .map((registration) => registration.unregister()),
      );
    }
    if ("caches" in window) {
      const names = await window.caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(READOUT_CACHE_PREFIX) && matches(name.slice(READOUT_CACHE_PREFIX.length)))
          .map((name) => window.caches.delete(name)),
      );
    }
  } catch {
    // Nothing more to do: the worker drops itself at the app's next denial of its readout page.
  }
}

// One scope's worker and its copy (its access is gone). A cache name is `<scope href>|<ms>`.
export function forgetReadoutWorker(scopePath: string): Promise<void> {
  const href = scopeHref(scopePath);
  return forget((value) => value === href || value.startsWith(`${href}|`));
}

// Every worker and copy under a path prefix ("/panel/obsluga/", "/kelner/sala/"): a logout clears the area.
export function forgetReadoutArea(pathPrefix: string): Promise<void> {
  const prefix = scopeHref(pathPrefix) + "/";
  return forget((value) => value.startsWith(prefix));
}
