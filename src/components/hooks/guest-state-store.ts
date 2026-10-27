import { describeGuestSeat } from "@/lib/guest-links/state";
import type { GuestStateDto } from "@/types";

// The guest's live state on the phone (S-05, NFR-003), shared by every guest island on the page (S-06+): ONE poll of
// `GET <apiBase>/state?since=<version>` per phone, however many sections read it. Astro islands on one page share ES
// module instances, so the module-level map below holds one store per apiBase. Browser only: the store is created
// lazily on first use in the browser (useSyncExternalStore uses the server snapshot during SSR), so nothing is ever
// shared between requests on the server.
//
// Polling (unchanged from S-05): every 2.5 s, 204 keeps the state, 200 replaces it, 404 means access is gone (switched
// off or the link revoked): the state becomes null (PRD: no data) and polling goes on, so switching access back on
// brings the page back. A failed or slow request (4 s limit) keeps the last state; after 3 failures in a row `offline`
// is set until the next answer. Phones freeze timers in the background: polling pauses while the page is hidden and
// runs at once when it becomes visible again. One request at a time (a setTimeout chain, never setInterval); it runs
// only while at least one island is subscribed.
//
// push(state) takes a fresher state from another request (the guess save answers with the whole state), so the next
// poll already sends the new version. `seatChanged` ("Nowe miejsce!") reacts to a different published seat only —
// never to a guess or intake change.

const POLL_MS = 2_500;
const TIMEOUT_MS = 4_000;
const OFFLINE_AFTER = 3;
// How long "Nowe miejsce!" stays highlighted after the seat changed.
const SEAT_CHANGED_MS = 10_000;

export interface GuestStateSnapshot {
  // null = access is gone.
  state: GuestStateDto | null;
  offline: boolean;
  seatChanged: boolean;
}

export interface GuestStateStore {
  getSnapshot(): GuestStateSnapshot;
  subscribe(listener: () => void): () => void;
  push(state: GuestStateDto): void;
  refresh(): void;
}

export function isGuestState(data: unknown): data is GuestStateDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestStateDto, unknown>>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.status === "string" &&
    "seat" in candidate &&
    typeof candidate.guess === "object" &&
    candidate.guess !== null
  );
}

function createStore(apiBase: string, initial: GuestStateDto): GuestStateStore {
  const listeners = new Set<() => void>();
  let snapshot: GuestStateSnapshot = { state: initial, offline: false, seatChanged: false };
  let failures = 0;
  let version = initial.version;
  let shownSeat = describeGuestSeat(initial);
  // Bumped by push(): a poll that started before it may carry an older state and is ignored.
  let generation = 0;
  let running = false;
  let timer: number | undefined;
  let seatTimer: number | undefined;
  let active: AbortController | null = null;

  function emit(next: Partial<GuestStateSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) {
      listener();
    }
  }

  function setFailures(count: number) {
    failures = count;
    if (snapshot.offline !== failures >= OFFLINE_AFTER) {
      emit({ offline: failures >= OFFLINE_AFTER });
    }
  }

  function accept(state: GuestStateDto) {
    const seat = describeGuestSeat(state);
    const seatChanged = shownSeat !== "" && seat !== shownSeat;
    shownSeat = seat;
    version = state.version;
    failures = 0;
    if (seatChanged) {
      window.clearTimeout(seatTimer);
      seatTimer = window.setTimeout(() => {
        emit({ seatChanged: false });
      }, SEAT_CHANGED_MS);
    }
    emit({ state, offline: false, ...(seatChanged ? { seatChanged: true } : {}) });
  }

  function schedule() {
    window.clearTimeout(timer);
    if (running && !document.hidden) {
      timer = window.setTimeout(() => void poll(), POLL_MS);
    }
  }

  async function poll() {
    if (!running || active) {
      return;
    }
    const controller = new AbortController();
    active = controller;
    const startedAt = generation;
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    try {
      const response = await fetch(`${apiBase}/state?since=${encodeURIComponent(version)}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 204) {
        setFailures(0);
      } else if (response.status === 404) {
        version = "";
        shownSeat = "";
        failures = 0;
        emit({ state: null, offline: false, seatChanged: false });
      } else if (response.ok) {
        const data: unknown = await response.json();
        if (!isGuestState(data)) {
          throw new Error("unexpected answer");
        }
        if (startedAt === generation) {
          accept(data);
        }
      } else {
        setFailures(failures + 1);
      }
    } catch {
      // Also reached when stop() aborts the request: then this request is no longer the active one.
      if (active === controller) {
        setFailures(failures + 1);
      }
    } finally {
      window.clearTimeout(timeout);
      if (active === controller) {
        active = null;
        schedule();
      }
    }
  }

  function onVisibilityChange() {
    window.clearTimeout(timer);
    if (!document.hidden) {
      void poll();
    }
  }

  function start() {
    running = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
  }

  function stop() {
    running = false;
    window.clearTimeout(timer);
    const controller = active;
    active = null;
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        start();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop();
        }
      };
    },
    push(state) {
      generation++;
      accept(state);
    },
    refresh() {
      if (running && !active) {
        window.clearTimeout(timer);
        void poll();
      }
    },
  };
}

const stores = new Map<string, GuestStateStore>();

// The page's store for this guest API base (browser only; see the header).
export function guestStateStore(apiBase: string, initial: GuestStateDto): GuestStateStore {
  let store = stores.get(apiBase);
  if (!store) {
    store = createStore(apiBase, initial);
    stores.set(apiBase, store);
  }
  return store;
}
