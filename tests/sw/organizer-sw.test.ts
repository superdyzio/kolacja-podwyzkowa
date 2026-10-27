import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shipped organizer service worker (S-09, public/organizer-sw.js) run in node:vm with a fake `self`, a Map-backed
// CacheStorage and a scripted fetch: what it copies, what it answers, when it falls back to the saved readout page,
// how a copy is replaced (all or nothing), the refresh throttle, forgetting a dead link and scope isolation.

const SOURCE = readFileSync(path.resolve(import.meta.dirname, "../../public/organizer-sw.js"), "utf8");
const ORIGIN = "https://kolacja.example";
const KEY = "AAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_KEY = "BBBBBBBBBBBBBBBBBBBBBBBB";
const SCOPE = `${ORIGIN}/o/${KEY}`;
const OTHER_SCOPE = `${ORIGIN}/o/${OTHER_KEY}`;
const READOUT = `${SCOPE}/odczyt`;
const PREFIX = `kolacja-odczyt|${SCOPE}|`;
const OTHER_PREFIX = `kolacja-odczyt|${OTHER_SCOPE}|`;
const T0 = Date.parse("2026-11-08T19:00:00.000Z");
const MINUTE = 60_000;

const asset = (name: string) => `${ORIGIN}/_astro/${name}`;

// Shaped like the real build: an island with component, renderer and before-hydration URLs, a stylesheet, a module
// script, a favicon outside /_astro/ and a link to another origin; props entity-encoded.
const READOUT_HTML = `<!doctype html><html lang="pl"><head>
<link rel="icon" type="image/png" href="/favicon.png" /><link rel="stylesheet" href="/_astro/Layout.abc.css" />
</head><body><main><h1>Odczyt bez sieci</h1>
<astro-island uid="Z1" component-url="/_astro/OfflineReadoutPage.aaa.js" component-export="OfflineReadoutPage"
 renderer-url="/_astro/client.bbb.js" before-hydration-url="/_astro/before.ccc.js"
 props="{&quot;apiBase&quot;:[0,&quot;/api/o/${KEY}&quot;]}" ssr client="load"></astro-island>
<script type="module" src="/_astro/page.ddd.js"></script><a href="https://elsewhere.example/_astro/x.js">x</a>
</main></body></html>`;

// Rolldown-style chunks: static `from"./…"`, a side-effect `import"./…"` and a dynamic `import("./…")`.
const CHUNKS: Record<string, string> = {
  "OfflineReadoutPage.aaa.js": `import{j as e}from"./jsx-runtime.eee.js";import"./side.fff.js";const l=()=>import("./lazy.ggg.js");export{l as OfflineReadoutPage};`,
  "jsx-runtime.eee.js": `import{r as t}from"./react.hhh.js";export{t as j};`,
  "react.hhh.js": `var r=1;export{r};`,
  "side.fff.js": `globalThis.x=1;`,
  "lazy.ggg.js": `export default 1;`,
  "client.bbb.js": `import{r}from"./react.hhh.js";export default r;`,
  "before.ccc.js": `export{};`,
  "page.ddd.js": `export{};`,
  "Layout.abc.css": `body{margin:0}`,
};
const CLOSURE = [READOUT, ...Object.keys(CHUNKS).map(asset)].sort();

const DENIAL_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}
type RequestLike = string | FakeRequest;
type Route = () => Response | Promise<Response>;
type Listener = (event: object) => void;

function urlOf(request: RequestLike): string {
  return typeof request === "string" ? request : request.url;
}

class FakeCache {
  readonly entries = new Map<string, Response>();

  put(request: RequestLike, response: Response): Promise<void> {
    if (response.bodyUsed) {
      return Promise.reject(new TypeError("Response body is already used"));
    }
    this.entries.set(urlOf(request), response);
    return Promise.resolve();
  }

  // Like the real Cache API, a stored response with a Vary header only matches with ignoreVary.
  find(request: RequestLike, options?: { ignoreVary?: boolean }): Response | undefined {
    const hit = this.entries.get(urlOf(request));
    if (!hit || (hit.headers.has("vary") && options?.ignoreVary !== true)) {
      return undefined;
    }
    return hit.clone();
  }

  match(request: RequestLike, options?: { ignoreVary?: boolean }): Promise<Response | undefined> {
    return Promise.resolve(this.find(request, options));
  }
}

class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>();

  open(name: string): Promise<FakeCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.stores.set(name, cache);
    }
    return Promise.resolve(cache);
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.stores.keys()]);
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.stores.delete(name));
  }

  match(request: RequestLike, options?: { ignoreVary?: boolean }): Promise<Response | undefined> {
    for (const cache of this.stores.values()) {
      const hit = cache.find(request, options);
      if (hit) {
        return Promise.resolve(hit);
      }
    }
    return Promise.resolve(undefined);
  }

  // Test helpers.
  namesOf(prefix: string): string[] {
    return [...this.stores.keys()].filter((name) => name.startsWith(prefix));
  }

  only(prefix: string): FakeCache {
    const names = this.namesOf(prefix);
    expect(names).toHaveLength(1);
    const cache = this.stores.get(names[0] ?? "");
    if (!cache) {
      throw new Error("no cache");
    }
    return cache;
  }
}

function page(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html", "Cache-Control": "no-store", Vary: "Accept-Encoding" },
  });
}

function defaultRoutes(): Map<string, Route> {
  const routes = new Map<string, Route>([[READOUT, () => page(READOUT_HTML)]]);
  for (const [name, body] of Object.entries(CHUNKS)) {
    routes.set(asset(name), () => new Response(body, { status: 200 }));
  }
  return routes;
}

function startWorker(caches: FakeCacheStorage, routes: Map<string, Route>, scope = SCOPE) {
  const listeners = new Map<string, Listener>();
  const fetched: string[] = [];
  const registration = { scope, unregister: vi.fn(() => Promise.resolve(true)) };
  const self = {
    registration,
    location: new URL(`${ORIGIN}/organizer-sw.js`),
    clients: { claim: vi.fn(() => Promise.resolve()) },
    skipWaiting: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
  };
  const fetch = vi.fn((request: RequestLike) => {
    const url = urlOf(request);
    fetched.push(url);
    const route = routes.get(url);
    return route ? Promise.resolve().then(route) : Promise.reject(new TypeError("Failed to fetch"));
  });
  const context = vm.createContext({
    self,
    caches,
    fetch,
    Response,
    URL,
    Date,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
      clearTimeout(timer);
    },
  });
  vm.runInContext(SOURCE, context, { filename: "organizer-sw.js" });

  function listener(type: string): Listener {
    const found = listeners.get(type);
    if (!found) {
      throw new Error(`no ${type} listener`);
    }
    return found;
  }

  async function extendable(type: string, extra: object = {}) {
    const pending: Promise<unknown>[] = [];
    listener(type)({ ...extra, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  }

  function request(url: string, init: Partial<FakeRequest> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listener("fetch")({
      request: { url, method: "GET", mode: "cors", ...init },
      respondWith: (answer: Promise<Response>) => {
        response = answer;
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    return {
      response,
      // Waits for the answer and for the work it started (a refresh, forgetting).
      async settled() {
        await response?.catch(() => undefined);
        await Promise.all(pending);
      },
    };
  }

  return {
    self,
    fetched,
    install: () => extendable("install"),
    activate: () => extendable("activate"),
    message: (data: unknown) => extendable("message", { data }),
    request,
    navigate: (url: string) => request(url, { mode: "navigate" }),
  };
}

async function text(response: Promise<Response | undefined> | Response | undefined): Promise<string> {
  const resolved = await response;
  if (!resolved) {
    throw new Error("no response");
  }
  return resolved.text();
}

let caches: FakeCacheStorage;
let routes: Map<string, Route>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
  caches = new FakeCacheStorage();
  routes = defaultRoutes();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("organizer service worker: install and copy", () => {
  it("takes over at once and copies the readout page with its whole /_astro/ closure", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    await worker.activate();

    expect(worker.self.skipWaiting).toHaveBeenCalled();
    expect(worker.self.clients.claim).toHaveBeenCalled();
    const cache = caches.only(PREFIX);
    expect([...cache.entries.keys()].sort()).toEqual(CLOSURE);
    expect(worker.fetched).not.toContain(`${ORIGIN}/favicon.png`);
    expect(worker.fetched).not.toContain("https://elsewhere.example/_astro/x.js");
    // Every file once (react.hhh.js is imported twice).
    expect(worker.fetched.filter((url) => url === asset("react.hhh.js"))).toHaveLength(1);
    expect(await text(cache.match(READOUT, { ignoreVary: true }))).toBe(READOUT_HTML);
  });

  it("never serves a copy that is still being made", async () => {
    let release: () => void = () => undefined;
    routes.set(
      asset("lazy.ggg.js"),
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(new Response(CHUNKS["lazy.ggg.js"]));
          };
        }),
    );
    const worker = startWorker(caches, routes);
    const installing = worker.install();
    for (let step = 0; step < 50 && !worker.fetched.includes(asset("lazy.ggg.js")); step++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(worker.fetched).toContain(asset("lazy.ggg.js"));
    await expect(worker.navigate(`${SCOPE}/strzaly`).response).rejects.toThrow("Failed to fetch");

    release();
    await installing;
    expect(await text(worker.navigate(`${SCOPE}/strzaly`).response)).toBe(READOUT_HTML);
  });

  it("installs even when the copy cannot be made", async () => {
    routes.clear();
    const worker = startWorker(caches, routes);
    await expect(worker.install()).resolves.toBeUndefined();
    expect(caches.namesOf(PREFIX)).toEqual([]);
  });
});

describe("organizer service worker: what it answers", () => {
  it("leaves non-GET, other origins and every API request to the network", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const untouched = [
      worker.request(`${SCOPE}/strzaly`, { method: "POST", mode: "navigate" }),
      worker.request(`${ORIGIN}/api/o/${KEY}/guesses`),
      worker.request(`${ORIGIN}/api/o/${KEY}/seating/published`),
      worker.request("https://cdn.example/_astro/react.hhh.js"),
      worker.request(`${ORIGIN}/favicon.png`),
    ];
    for (const event of untouched) {
      expect(event.response).toBeUndefined();
    }
  });

  it("passes an online navigation through untouched", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const live = page("<p>Strzały na żywo</p>");
    routes.set(`${SCOPE}/strzaly`, () => live);
    const event = worker.navigate(`${SCOPE}/strzaly`);
    expect(await event.response).toBe(live);
    await event.settled();
  });

  it("serves the saved readout page on a network error, a 5xx or 8 s without an answer", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();

    expect(await text(worker.navigate(`${SCOPE}/strzaly`).response)).toBe(READOUT_HTML);

    routes.set(`${SCOPE}/rozsadzenie`, () => new Response("Błąd", { status: 503 }));
    expect(await text(worker.navigate(`${SCOPE}/rozsadzenie`).response)).toBe(READOUT_HTML);

    routes.set(SCOPE, () => new Promise<Response>(() => undefined));
    const slow = worker.navigate(SCOPE);
    await vi.advanceTimersByTimeAsync(7_999);
    let answered = false;
    void slow.response?.then(() => {
      answered = true;
    });
    await Promise.resolve();
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await text(slow.response)).toBe(READOUT_HTML);
  });

  it("without a saved copy a failed navigation fails and a 5xx stays as it is", async () => {
    const worker = startWorker(caches, routes);
    routes.delete(READOUT);
    await expect(worker.navigate(`${SCOPE}/strzaly`).response).rejects.toThrow("Failed to fetch");
    routes.set(`${SCOPE}/sale`, () => new Response("Błąd", { status: 500 }));
    expect((await worker.navigate(`${SCOPE}/sale`).response)?.status).toBe(500);
  });

  it("serves /_astro/ files from the copy without the network, others from the network", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    routes.clear();
    worker.fetched.length = 0;
    expect(await text(worker.request(asset("react.hhh.js")).response)).toBe(CHUNKS["react.hhh.js"]);
    expect(worker.fetched).toEqual([]);

    routes.set(asset("new.zzz.js"), () => new Response("export{};"));
    expect(await text(worker.request(asset("new.zzz.js")).response)).toBe("export{};");
    expect(worker.fetched).toEqual([asset("new.zzz.js")]);
  });
});

describe("organizer service worker: a dead link", () => {
  it("drops the copy and unregisters when the readout page is denied", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const denial = () => Response.json({ error: "Brak dostępu" }, { status: 404, headers: DENIAL_HEADERS });
    routes.set(`${SCOPE}/strzaly`, denial);
    routes.set(READOUT, denial);

    const event = worker.navigate(`${SCOPE}/strzaly`);
    expect((await event.response)?.status).toBe(404);
    await event.settled();
    expect(caches.namesOf(PREFIX)).toEqual([]);
    expect(worker.self.registration.unregister).toHaveBeenCalled();
  });

  it("keeps the copy after a 404 for a mistyped page of a valid link", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    routes.set(`${SCOPE}/nie-ma`, () => new Response("Nie ma", { status: 404, headers: DENIAL_HEADERS }));

    const event = worker.navigate(`${SCOPE}/nie-ma`);
    expect((await event.response)?.status).toBe(404);
    await event.settled();
    expect(caches.namesOf(PREFIX)).toHaveLength(1);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it("keeps the copy when the readout page answers a 404 that is not the app's", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    routes.set(READOUT, () => new Response("Not found", { status: 404 }));
    routes.set(`${SCOPE}/strzaly`, () => new Response("Not found", { status: 404 }));

    await worker.navigate(`${SCOPE}/strzaly`).settled();
    expect(caches.namesOf(PREFIX)).toHaveLength(1);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });
});

describe("organizer service worker: replacing the copy", () => {
  const NEW_HTML = READOUT_HTML.replace("</main>", '<script type="module" src="/_astro/new.zzz.js"></script></main>');

  it("keeps the previous complete copy when a new one fails midway", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const [oldName] = caches.namesOf(PREFIX);

    vi.setSystemTime(T0 + 11 * MINUTE);
    routes.set(READOUT, () => page(NEW_HTML));
    routes.set(asset("new.zzz.js"), () => new Response("Błąd", { status: 500 }));
    await worker.message({ type: "refresh" });

    expect(caches.namesOf(PREFIX)).toEqual([oldName]);
    expect(await text(caches.only(PREFIX).match(READOUT, { ignoreVary: true }))).toBe(READOUT_HTML);
  });

  it("replaces the old copy with a complete new one, reusing the files it already has", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const [oldName] = caches.namesOf(PREFIX);

    vi.setSystemTime(T0 + 11 * MINUTE);
    routes.set(READOUT, () => page(NEW_HTML));
    routes.set(asset("new.zzz.js"), () => new Response("export{};"));
    worker.fetched.length = 0;
    await worker.message({ type: "refresh" });

    const names = caches.namesOf(PREFIX);
    expect(names).toHaveLength(1);
    expect(names[0]).not.toBe(oldName);
    const cache = caches.only(PREFIX);
    expect([...cache.entries.keys()].sort()).toEqual([...CLOSURE, asset("new.zzz.js")].sort());
    expect(await text(cache.match(READOUT, { ignoreVary: true }))).toBe(NEW_HTML);
    expect(worker.fetched.sort()).toEqual([READOUT, asset("new.zzz.js")].sort());
  });

  it("refreshes on request at most every 10 minutes, also after the worker restarts", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    const readoutReads = () => worker.fetched.filter((url) => url === READOUT).length;
    expect(readoutReads()).toBe(1);

    await worker.message({ type: "refresh" });
    vi.setSystemTime(T0 + 9 * MINUTE);
    await worker.message({ type: "refresh" });
    expect(readoutReads()).toBe(1);

    // A restarted worker (no memory) still sees the age of its copy.
    const restarted = startWorker(caches, routes);
    await restarted.message({ type: "refresh" });
    expect(restarted.fetched).toEqual([]);

    vi.setSystemTime(T0 + 10 * MINUTE);
    await worker.message({ type: "refresh" });
    expect(readoutReads()).toBe(2);
    await worker.message({ type: "unknown" });
    expect(readoutReads()).toBe(2);
  });

  it("refreshes after an online navigation, throttled the same way", async () => {
    const worker = startWorker(caches, routes);
    await worker.install();
    routes.set(SCOPE, () => page("<p>Panel</p>"));
    await worker.navigate(SCOPE).settled();
    expect(worker.fetched.filter((url) => url === READOUT)).toHaveLength(1);

    vi.setSystemTime(T0 + 11 * MINUTE);
    await worker.navigate(SCOPE).settled();
    expect(worker.fetched.filter((url) => url === READOUT)).toHaveLength(2);
  });
});

describe("organizer service worker: scopes", () => {
  it("never touches or serves another organizer link's copy", async () => {
    const other = new FakeCache();
    await other.put(`${OTHER_SCOPE}/odczyt`, page("<p>Inne wydarzenie</p>"));
    caches.stores.set(`${OTHER_PREFIX}${T0 - MINUTE}`, other);

    const worker = startWorker(caches, routes);
    routes.delete(READOUT);
    await worker.install();
    await expect(worker.navigate(`${SCOPE}/strzaly`).response).rejects.toThrow("Failed to fetch");

    routes.set(READOUT, () => page(READOUT_HTML));
    vi.setSystemTime(T0 + 11 * MINUTE);
    await worker.message({ type: "refresh" });
    expect(caches.namesOf(PREFIX)).toHaveLength(1);

    const denial = () => Response.json({ error: "Brak dostępu" }, { status: 404, headers: DENIAL_HEADERS });
    routes.set(READOUT, denial);
    routes.set(`${SCOPE}/strzaly`, denial);
    await worker.navigate(`${SCOPE}/strzaly`).settled();
    expect(caches.namesOf(PREFIX)).toEqual([]);
    expect(caches.namesOf(OTHER_PREFIX)).toEqual([`${OTHER_PREFIX}${T0 - MINUTE}`]);
  });

  it("derives the readout URL from a scope given with a trailing slash too", async () => {
    const worker = startWorker(caches, routes, `${SCOPE}/`);
    await worker.install();
    expect(caches.only(PREFIX).entries.has(READOUT)).toBe(true);
  });
});
