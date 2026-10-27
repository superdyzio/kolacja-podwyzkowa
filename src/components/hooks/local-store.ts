// A tiny external store over localStorage for small per-browser memories (S-07 question draws, S-08 AI topics), read
// with useSyncExternalStore so the server render and hydration use the empty value and the browser then shows what it
// remembered — no setState in an effect, no hydration mismatch. Storage is never trusted: `parse` turns any stored
// text (or null) into a valid value; blocked or full storage falls back to a value kept in this page (a reload forgets
// it), and a value written by another tab shows up here through the "storage" event. Browser only: every function
// reads `window` lazily.

export interface LocalStore<T> {
  read(key: string): T;
  write(key: string, value: T): void;
  subscribe(key: string, listener: () => void): () => void;
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function createLocalStore<T>(parse: (raw: string | null) => T, serialize: (value: T) => string): LocalStore<T> {
  const listeners = new Map<string, Set<() => void>>();
  // The last parsed value per key, so a snapshot read is the same object until the stored text changes.
  const parsed = new Map<string, { raw: string | null; value: T }>();
  // Keys whose last write could not reach storage.
  const inPage = new Map<string, T>();

  function notify(key: string) {
    for (const listener of listeners.get(key) ?? []) {
      listener();
    }
  }

  return {
    read(key) {
      if (inPage.has(key)) {
        return inPage.get(key) as T;
      }
      const raw = readRaw(key);
      const cached = parsed.get(key);
      if (cached?.raw === raw) {
        return cached.value;
      }
      const value = parse(raw);
      parsed.set(key, { raw, value });
      return value;
    },

    write(key, value) {
      const raw = serialize(value);
      try {
        window.localStorage.setItem(key, raw);
        parsed.set(key, { raw, value });
        inPage.delete(key);
      } catch {
        inPage.set(key, value);
      }
      notify(key);
    },

    subscribe(key, listener) {
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
    },
  };
}
