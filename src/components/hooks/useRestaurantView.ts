import { useEffect, useRef, useState } from "react";
import type { RestaurantViewDto } from "@/types";

// Live restaurant view (restaurant-orders): asks `GET <apiBase>/orders?since=<version>` every 15 s while the page is
// visible (and at once when it becomes visible again) — 204 keeps what is shown, 200 replaces it. A failed or slow
// request (8 s limit) keeps the last state; after 3 failures in a row the page says it is reconnecting. 404 = the link
// was replaced: the page says so. One request at a time (a setTimeout chain, never setInterval).

const POLL_MS = 15_000;
const TIMEOUT_MS = 8_000;
const OFFLINE_AFTER = 3;

function isRestaurantView(data: unknown): data is RestaurantViewDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof RestaurantViewDto, unknown>>;
  return (
    typeof candidate.version === "string" &&
    Array.isArray(candidate.prep) &&
    typeof candidate.seating === "object" &&
    candidate.seating !== null &&
    typeof candidate.placement === "object" &&
    candidate.placement !== null &&
    typeof candidate.totals === "object" &&
    candidate.totals !== null
  );
}

export function useRestaurantView(apiBase: string, initial: RestaurantViewDto) {
  const [view, setView] = useState(initial);
  const [failures, setFailures] = useState(0);
  const [gone, setGone] = useState(false);
  const version = useRef(initial.version);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let running = false;

    async function poll() {
      window.clearTimeout(timer);
      if (running || document.visibilityState === "hidden") {
        return;
      }
      running = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(`${apiBase}/orders?since=${encodeURIComponent(version.current)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 204) {
          setFailures(0);
        } else if (response.status === 404) {
          setGone(true);
          setFailures(0);
        } else if (response.ok) {
          const data: unknown = await response.json();
          if (!isRestaurantView(data)) {
            throw new Error("unexpected answer");
          }
          version.current = data.version;
          setView(data);
          setGone(false);
          setFailures(0);
        } else {
          setFailures((count) => count + 1);
        }
      } catch {
        if (!stopped) {
          setFailures((count) => count + 1);
        }
      } finally {
        window.clearTimeout(timeout);
        running = false;
        if (!stopped) {
          timer = window.setTimeout(() => void poll(), POLL_MS);
        }
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    timer = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [apiBase]);

  return { view, gone, offline: failures >= OFFLINE_AFTER };
}
