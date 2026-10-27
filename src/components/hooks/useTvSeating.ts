import { useEffect, useRef, useState } from "react";
import type { TvSeatingDto } from "@/types";

// Live TV state (NFR-003): asks `GET <apiBase>/seating?since=<version>` every 2.5 s — 204 keeps what is shown, 200
// replaces it. A failed or slow request (4 s limit) keeps the last state; after 3 failures in a row the view shows a
// small "reconnecting" badge until the next answer. One request at a time (a setTimeout chain, never setInterval).

const POLL_MS = 2_500;
const TIMEOUT_MS = 4_000;
const OFFLINE_AFTER = 3;

function isTvSeating(data: unknown): data is TvSeatingDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof TvSeatingDto, unknown>>;
  return typeof candidate.version === "string" && Array.isArray(candidate.tables) && "planVersion" in candidate;
}

export function useTvSeating(apiBase: string, initial: TvSeatingDto) {
  const [tv, setTv] = useState(initial);
  const [failures, setFailures] = useState(0);
  // How many times the shown arrangement changed since the page opened (announced to screen readers).
  const [updates, setUpdates] = useState(0);
  const version = useRef(initial.version);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    async function poll() {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(`${apiBase}/seating?since=${encodeURIComponent(version.current)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 204) {
          setFailures(0);
        } else if (response.ok) {
          const data: unknown = await response.json();
          if (!isTvSeating(data)) {
            throw new Error("unexpected answer");
          }
          version.current = data.version;
          setTv(data);
          setUpdates((count) => count + 1);
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
        if (!stopped) {
          timer = window.setTimeout(() => void poll(), POLL_MS);
        }
      }
    }

    timer = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [apiBase]);

  return { tv, offline: failures >= OFFLINE_AFTER, updates };
}
