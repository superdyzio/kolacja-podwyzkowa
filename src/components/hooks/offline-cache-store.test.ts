import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_GUESSES_STORAGE_KEY, OFFLINE_SEATING_STORAGE_KEY, offlineEntry } from "@/lib/offline/cache";
import type { GuessBoardDto, PublishedSeatingDto } from "@/types";

// The organizer's offline memory store (S-09) in Node with a stubbed window/localStorage: round trips, owner
// filtering, corrupted and blocked storage, and clearing only this link's entries. The store keeps module state (the
// key names are fixed), so every test imports a fresh copy.

const API = "/api/o/AAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_API = "/api/o/BBBBBBBBBBBBBBBBBBBBBBBB";
const SAVED_AT = "2026-11-08T20:34:00.000Z";

const seating: PublishedSeatingDto = {
  snapshotId: 3,
  publishedAt: "2026-11-08T20:05:00.000Z",
  tables: [{ name: "Okno", room: "Sala duża", shape: "round", seatCount: 4, seats: [{ seat: 2, name: "Ania" }] }],
};

const board: GuessBoardDto = {
  intakeOpen: true,
  correctAmountGrosze: null,
  guests: [{ id: 1, displayName: "Ania", isAbsent: false, amountGrosze: 450000, enteredBy: "guest" }],
  missing: [],
  ranking: null,
};

let storage: Map<string, string>;
let blocked: boolean;

async function freshStore() {
  vi.resetModules();
  return import("./offline-cache-store");
}

beforeEach(() => {
  storage = new Map();
  blocked = false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (blocked) {
          throw new Error("SecurityError");
        }
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (blocked) {
          throw new Error("QuotaExceededError");
        }
        storage.set(key, value);
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("offline cache store", () => {
  it("starts empty and reads back what was saved, as a stable snapshot", async () => {
    const store = await freshStore();
    const empty = store.readOfflineCache(API);
    expect(empty).toEqual({ seating: null, guesses: null });
    expect(store.readOfflineCache(API)).toBe(empty);

    store.saveOfflineSeating(API, seating, SAVED_AT);
    store.saveOfflineGuesses(API, board, SAVED_AT);
    const read = store.readOfflineCache(API);
    expect(read.seating).toEqual(offlineEntry(API, seating, SAVED_AT));
    expect(read.guesses).toEqual(offlineEntry(API, board, SAVED_AT));
    expect(store.readOfflineCache(API)).toBe(read);
    expect(storage.get(OFFLINE_SEATING_STORAGE_KEY)).not.toContain("AAAAAAAA");
  });

  it("remembers that nothing was published yet", async () => {
    const store = await freshStore();
    store.saveOfflineSeating(API, null, SAVED_AT);
    expect(store.readOfflineCache(API).seating).toEqual(offlineEntry(API, null, SAVED_AT));
  });

  it("never shows another organizer link's entries", async () => {
    const store = await freshStore();
    store.saveOfflineSeating(OTHER_API, seating, SAVED_AT);
    store.saveOfflineGuesses(OTHER_API, board, SAVED_AT);
    expect(store.readOfflineCache(API)).toEqual({ seating: null, guesses: null });
    expect(store.readOfflineCache(OTHER_API).seating?.data).toEqual(seating);
  });

  it("treats corrupted storage as nothing saved", async () => {
    storage.set(OFFLINE_SEATING_STORAGE_KEY, "{not json");
    storage.set(OFFLINE_GUESSES_STORAGE_KEY, JSON.stringify({ ...offlineEntry(API, board, SAVED_AT), v: 99 }));
    const store = await freshStore();
    expect(store.readOfflineCache(API)).toEqual({ seating: null, guesses: null });
  });

  it("keeps the state in the page when storage is blocked", async () => {
    blocked = true;
    const store = await freshStore();
    store.saveOfflineGuesses(API, board, SAVED_AT);
    expect(store.readOfflineCache(API).guesses?.data).toEqual(board);
    expect(storage.size).toBe(0);
  });

  it("notifies subscribers of both entries", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    const stop = store.subscribeOfflineCache(listener);
    store.saveOfflineSeating(API, seating, SAVED_AT);
    store.saveOfflineGuesses(API, board, SAVED_AT);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.saveOfflineGuesses(API, board, SAVED_AT);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears only this link's entries", async () => {
    const store = await freshStore();
    store.saveOfflineSeating(API, seating, SAVED_AT);
    store.saveOfflineGuesses(OTHER_API, board, SAVED_AT);
    store.clearOfflineCache(API);
    expect(store.readOfflineCache(API)).toEqual({ seating: null, guesses: null });
    expect(store.readOfflineCache(OTHER_API).guesses?.data).toEqual(board);
    expect(storage.get(OFFLINE_SEATING_STORAGE_KEY)).toBe("null");
  });
});
