import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DRAW_MEMORY, type DrawMemory } from "@/lib/questions/draw-memory";
import { readDrawMemory, subscribeDrawMemory, writeDrawMemory } from "./draw-memory-store";

// The draw memory store (S-07) in Node with a stubbed window/localStorage: stable snapshots, writes reach storage and
// subscribers, and blocked storage still keeps the memory for the page.

const memory: DrawMemory = {
  category: "generyczne",
  recent: [4, 2],
  last: { id: 2, category: "generyczne", text: "Jaki był Twój najlepszy urlop?" },
};

let keyCounter = 0;
let store: Map<string, string>;
let blocked: boolean;

function freshKey() {
  keyCounter++;
  return `test:pytania:${keyCounter}`;
}

beforeEach(() => {
  store = new Map();
  blocked = false;
  const localStorage = {
    getItem: (key: string) => {
      if (blocked) {
        throw new Error("SecurityError");
      }
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) {
        throw new Error("QuotaExceededError");
      }
      store.set(key, value);
    },
  };
  vi.stubGlobal("window", { localStorage, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("draw memory store", () => {
  it("starts empty and returns the same snapshot until the stored text changes", () => {
    const key = freshKey();
    const first = readDrawMemory(key);
    expect(first).toEqual(EMPTY_DRAW_MEMORY);
    expect(readDrawMemory(key)).toBe(first);

    store.set(key, JSON.stringify(memory));
    const second = readDrawMemory(key);
    expect(second).toEqual(memory);
    expect(readDrawMemory(key)).toBe(second);
  });

  it("writes to storage and tells only the key's subscribers", () => {
    const key = freshKey();
    const listener = vi.fn();
    const other = vi.fn();
    const stop = subscribeDrawMemory(key, listener);
    subscribeDrawMemory(freshKey(), other);

    writeDrawMemory(key, memory);
    expect(readDrawMemory(key)).toEqual(memory);
    expect(JSON.parse(store.get(key) ?? "null")).toEqual(memory);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();

    stop();
    writeDrawMemory(key, EMPTY_DRAW_MEMORY);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the memory in the page when storage is blocked", () => {
    const key = freshKey();
    blocked = true;
    expect(readDrawMemory(key)).toEqual(EMPTY_DRAW_MEMORY);
    writeDrawMemory(key, memory);
    expect(readDrawMemory(key)).toEqual(memory);

    // Storage works again: the next write goes there.
    blocked = false;
    writeDrawMemory(key, { ...memory, category: null });
    expect(readDrawMemory(key).category).toBeNull();
    expect(store.has(key)).toBe(true);
  });

  it("ignores garbage in storage", () => {
    const key = freshKey();
    store.set(key, "{not json");
    expect(readDrawMemory(key)).toEqual(EMPTY_DRAW_MEMORY);
  });
});
