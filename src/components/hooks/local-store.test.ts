import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStore } from "./local-store";

// The generic local store in Node with a stubbed window/localStorage: any parsed value type, stable snapshots,
// independent stores, the in-page fallback and other tabs' writes through the "storage" event.

interface Counter {
  count: number;
}

const parseCounter = (raw: string | null): Counter => {
  const count = Number(raw);
  return { count: Number.isInteger(count) && count >= 0 ? count : 0 };
};
const serializeCounter = (value: Counter) => String(value.count);

let storage: Map<string, string>;
let blocked: boolean;
let storageListeners: Set<(event: { key: string | null }) => void>;

beforeEach(() => {
  storage = new Map();
  blocked = false;
  storageListeners = new Set();
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
    addEventListener: (_type: string, listener: (event: { key: string | null }) => void) => {
      storageListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: { key: string | null }) => void) => {
      storageListeners.delete(listener);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local store", () => {
  it("parses whatever is stored and keeps the snapshot stable", () => {
    const store = createLocalStore(parseCounter, serializeCounter);
    expect(store.read("a")).toEqual({ count: 0 });
    expect(store.read("a")).toBe(store.read("a"));
    storage.set("a", "7");
    expect(store.read("a")).toEqual({ count: 7 });
    storage.set("a", "-1");
    expect(store.read("a")).toEqual({ count: 0 });
  });

  it("writes through serialize and notifies the key's subscribers", () => {
    const store = createLocalStore(parseCounter, serializeCounter);
    const listener = vi.fn();
    store.subscribe("a", listener);
    store.write("a", { count: 3 });
    expect(storage.get("a")).toBe("3");
    expect(store.read("a")).toEqual({ count: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps separate stores apart", () => {
    const first = createLocalStore(parseCounter, serializeCounter);
    const second = createLocalStore(parseCounter, serializeCounter);
    const listener = vi.fn();
    second.subscribe("a", listener);
    blocked = true;
    first.write("a", { count: 5 });
    expect(first.read("a")).toEqual({ count: 5 });
    expect(second.read("a")).toEqual({ count: 0 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("hears another tab and unsubscribes cleanly", () => {
    const store = createLocalStore(parseCounter, serializeCounter);
    const listener = vi.fn();
    const stop = store.subscribe("a", listener);
    for (const notifyTab of storageListeners) {
      notifyTab({ key: "b" });
      notifyTab({ key: "a" });
      notifyTab({ key: null });
    }
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    expect(storageListeners.size).toBe(0);
  });
});
