// Organizer offline readout service worker (S-09, NFR-004). Registered by organizer pages with the scope `/o/<key>`
// (src/components/hooks/offline-worker.ts), so it only ever sees that organizer link's pages.
//
// It keeps ONE thing: a complete copy of the data-free readout page `<scope>/odczyt` and its `/_astro/` files. The
// saved state itself lives in the page's localStorage, never here. Navigations go to the network first; only when an
// organizer page cannot be loaded (network error, 8 s without an answer, 5xx) the copy of the readout page is served
// instead, so a refresh or the panel bookmark still shows the last saved state. API requests are never answered or
// stored here. A new copy replaces the old one only once it is complete; any failure keeps the old one. When the
// readout page answers with the app's denial (the key no longer opens anything), the copy is dropped and the worker
// unregisters itself. Every handler falls back to the plain network on any error. Tested in tests/sw/.

const CACHE_PREFIX = "kolacja-odczyt|";
const ASSET_PREFIX = "/_astro/";
const NAVIGATION_TIMEOUT_MS = 8000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_FILES = 200;
const ATTRIBUTE_URL = /\b(?:src|href|component-url|renderer-url|before-hydration-url)\s*=\s*["']([^"']+)["']/g;
const MODULE_IMPORT = /\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[\w.-]+\.(?:js|mjs|css))["']/g;

let lastAttempt = 0;
let refreshing = null;

function scopeUrl() {
  return self.registration.scope.replace(/\/$/, "");
}

function readoutUrl() {
  return scopeUrl() + "/odczyt";
}

function ownCachePrefix() {
  return CACHE_PREFIX + scopeUrl() + "|";
}

async function ownCacheNames() {
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(ownCachePrefix()));
}

// The app's own denial: a 404 with the private headers the key guard adds (a portal's or proxy's 404 is not one).
function isDenial(response) {
  return response.status === 404 && (response.headers.get("x-robots-tag") || "").includes("noindex");
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sameOriginAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(ASSET_PREFIX);
}

function pageAssetUrls(html, base) {
  const urls = [];
  for (const match of html.matchAll(ATTRIBUTE_URL)) {
    const url = new URL(match[1].replace(/&amp;/g, "&"), base);
    if (sameOriginAsset(url)) {
      urls.push(url.href);
    }
  }
  return urls;
}

// Stores every file the page needs: the page's own `/_astro/` references and, through the JS modules, their imports.
// A file already cached (they are content-hashed) is reused; any other one must load, or the whole copy fails.
async function storeAssets(cache, initial) {
  const queue = [...new Set(initial)];
  const seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) {
    if (index >= MAX_FILES) {
      throw new Error("too many files");
    }
    const url = queue[index];
    let response = await caches.match(url, { ignoreVary: true });
    if (!response) {
      response = await fetch(url);
      if (!response.ok) {
        throw new Error("missing file " + url);
      }
    }
    if (new URL(url).pathname.endsWith(".js")) {
      const code = await response.clone().text();
      for (const match of code.matchAll(MODULE_IMPORT)) {
        const next = new URL(match[1], url);
        if (sameOriginAsset(next) && !seen.has(next.href)) {
          seen.add(next.href);
          queue.push(next.href);
        }
      }
    }
    await cache.put(url, response);
  }
}

async function forget() {
  const names = await ownCacheNames();
  await Promise.all(names.map((name) => caches.delete(name)));
  await self.registration.unregister();
}

async function copyReadout() {
  const pageUrl = readoutUrl();
  const response = await fetch(pageUrl, { cache: "no-store" });
  if (isDenial(response)) {
    await forget();
    return;
  }
  if (!response.ok) {
    return;
  }
  const html = await response.text();
  const name = ownCachePrefix() + Date.now();
  const cache = await caches.open(name);
  try {
    await storeAssets(cache, pageAssetUrls(html, pageUrl));
    // The page goes in last: a copy without it is never served.
    await cache.put(pageUrl, new Response(html, { status: 200, headers: response.headers }));
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
  const older = (await ownCacheNames()).filter((other) => other !== name);
  await Promise.all(older.map((other) => caches.delete(other)));
}

// The newest own copy's age counts too, so a restarted worker does not copy again on every page load.
async function newestCopyTime() {
  const times = (await ownCacheNames()).map((name) => Number(name.slice(ownCachePrefix().length)) || 0);
  return Math.max(0, ...times);
}

// force: the install, and a 404 navigation (is the key still valid?). Otherwise at most every 10 minutes.
function refresh(force) {
  if (refreshing) {
    return refreshing;
  }
  refreshing = (async () => {
    try {
      const now = Date.now();
      if (!force && now - Math.max(lastAttempt, await newestCopyTime()) < REFRESH_INTERVAL_MS) {
        return;
      }
      lastAttempt = now;
      await copyReadout();
    } catch {
      // Keep the previous copy; the next refresh tries again.
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function cachedReadout() {
  try {
    return await caches.match(readoutUrl(), { ignoreVary: true });
  } catch {
    return undefined;
  }
}

async function navigate(event) {
  let response;
  try {
    response = await withTimeout(fetch(event.request), NAVIGATION_TIMEOUT_MS);
  } catch (error) {
    const copy = await cachedReadout();
    if (copy) {
      return copy;
    }
    throw error;
  }
  if (response.status >= 500) {
    return (await cachedReadout()) || response;
  }
  if (response.status === 404) {
    event.waitUntil(refresh(true));
  } else if (response.ok) {
    event.waitUntil(refresh(false));
  }
  return response;
}

async function asset(request) {
  try {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) {
      return cached;
    }
  } catch {
    // fall through to the network
  }
  return fetch(request);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(refresh(true));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "refresh") {
    event.waitUntil(refresh(false));
  }
});

self.addEventListener("fetch", (event) => {
  try {
    const request = event.request;
    if (request.method !== "GET") {
      return;
    }
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(navigate(event));
    } else if (url.pathname.startsWith(ASSET_PREFIX)) {
      event.respondWith(asset(request));
    }
  } catch {
    // Not answered: the browser goes to the network.
  }
});
