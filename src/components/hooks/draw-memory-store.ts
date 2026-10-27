import { parseDrawMemory, serializeDrawMemory, type DrawMemory } from "@/lib/questions/draw-memory";

// A tiny external store over localStorage for the question draw memory (S-07), read with useSyncExternalStore so the
// server render and hydration use the empty memory and the browser then shows what it remembered — no setState in an
// effect, no hydration mismatch. Storage is never trusted: blocked or full storage falls back to memory kept in this
// page (a reload forgets it), and a value written by another tab shows up here through the "storage" event.
// Browser only: every function reads `window` lazily.

const listeners = new Map<string, Set<() => void>>();
// The last parsed value per key, so a snapshot read is the same object until the stored text changes.
const parsed = new Map<string, { raw: string | null; memory: DrawMemory }>();
// Keys whose last write could not reach storage.
const inPage = new Map<string, DrawMemory>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function notify(key: string) {
  for (const listener of listeners.get(key) ?? []) {
    listener();
  }
}

export function readDrawMemory(key: string): DrawMemory {
  const kept = inPage.get(key);
  if (kept) {
    return kept;
  }
  const raw = readRaw(key);
  const cached = parsed.get(key);
  if (cached?.raw === raw) {
    return cached.memory;
  }
  const memory = parseDrawMemory(raw);
  parsed.set(key, { raw, memory });
  return memory;
}

export function writeDrawMemory(key: string, memory: DrawMemory) {
  const raw = serializeDrawMemory(memory);
  try {
    window.localStorage.setItem(key, raw);
    parsed.set(key, { raw, memory });
    inPage.delete(key);
  } catch {
    inPage.set(key, memory);
  }
  notify(key);
}

export function subscribeDrawMemory(key: string, listener: () => void): () => void {
  let keyListeners = listeners.get(key);
  if (!keyListeners) {
    keyListeners = new Set();
    listeners.set(key, keyListeners);
  }
  keyListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    keyListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
