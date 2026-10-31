import { useCallback, useEffect, useRef, useState } from "react";
import { readOfflineState } from "@/lib/offline/sync";
import { clearOfflineCache, saveOfflineGuesses, saveOfflineSeating } from "./offline-cache-store";
import { registerOrganizerWorker } from "./offline-worker";

// Keeps the organizer's offline memory (S-09) fresh and says whether the server can be reached. A setTimeout chain,
// one read at a time (8 s limit): at mount, every 30 s while the page is visible, every 5 s while offline, at once
// when the page becomes visible or the browser reports "online"; the browser's "offline" event switches to offline
// at once. A successful read saves both parts with the time of the read („Stan z …”); the app's denial forgets this
// link's saved state. It also registers the organizer's service worker (offline-worker.ts), which serves the saved
// readout page when an organizer page cannot be loaded at all.

const SYNC_MS = 30_000;
const RETRY_MS = 5_000;
const TIMEOUT_MS = 8_000;

// "unknown" until the first read ends (the server render and hydration too).
export type ConnectionStatus = "unknown" | "online" | "offline";

export function useOfflineSync(apiBase: string) {
  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const syncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    // A read asked for while another one runs (e.g. right after a publish).
    let again = false;
    let isOffline = false;

    function markOffline(next: boolean) {
      isOffline = next;
      setStatus(next ? "offline" : "online");
    }

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(() => void sync(), isOffline ? RETRY_MS : SYNC_MS);
      }
    }

    // Callers stop calling it once the effect is cleaned up (timers cleared, listeners removed, syncRef reset).
    async function sync() {
      if (controller) {
        again = true;
        return;
      }
      window.clearTimeout(timer);
      const current = new AbortController();
      controller = current;
      const startedAtMs = Date.now();
      const timeout = window.setTimeout(() => {
        current.abort();
      }, TIMEOUT_MS);
      try {
        const result = await readOfflineState(apiBase, (input, init) => fetch(input, init), current.signal);
        if (stopped) {
          return;
        }
        if (result.status === "ok") {
          const savedAt = new Date().toISOString();
          saveOfflineSeating(apiBase, result.published, savedAt);
          // The guesses page saves every board it confirms; one saved while this read ran is fresher.
          saveOfflineGuesses(apiBase, result.board, savedAt, startedAtMs);
          markOffline(false);
        } else if (result.status === "gone") {
          clearOfflineCache(apiBase);
          markOffline(false);
        } else {
          markOffline(true);
        }
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (again && !stopped) {
          again = false;
          void sync();
        } else {
          schedule();
        }
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void sync();
      }
    }

    function onOnline() {
      void sync();
    }

    function onOffline() {
      markOffline(true);
      schedule();
    }

    registerOrganizerWorker(apiBase);
    syncRef.current = () => void sync();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void sync();
    return () => {
      stopped = true;
      syncRef.current = () => undefined;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [apiBase]);

  // Reads at once (e.g. after a publish), or right after the read in flight.
  const syncNow = useCallback(() => {
    syncRef.current();
  }, []);

  return { status, offline: status === "offline", syncNow };
}
