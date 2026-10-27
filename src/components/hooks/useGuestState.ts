import { useEffect, useRef, useState } from "react";
import { describeGuestSeat } from "@/lib/guest-links/state";
import type { GuestStateDto } from "@/types";

// Live guest state on the phone (S-05, NFR-003): asks `GET <apiBase>/state?since=<version>` every 2.5 s — 204 keeps
// what is shown, 200 replaces it, 404 means access is gone (switched off or the link revoked): the shown data is
// cleared (PRD: no data) and polling goes on, so switching access back on brings the page back. A failed or slow
// request (4 s limit) keeps the last state; after 3 failures in a row `offline` is set until the next answer.
//
// Phones freeze timers in the background: polling pauses while the page is hidden and runs at once when it becomes
// visible again, so a guest who unlocks the phone after a publish sees the new seat immediately. One request at a
// time (a setTimeout chain, never setInterval).

const POLL_MS = 2_500;
const TIMEOUT_MS = 4_000;
const OFFLINE_AFTER = 3;
// How long "Nowe miejsce!" stays highlighted after the seat changed.
const CHANGED_MS = 10_000;

function isGuestState(data: unknown): data is GuestStateDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestStateDto, unknown>>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.status === "string" &&
    "seat" in candidate
  );
}

export function useGuestState(apiBase: string, initial: GuestStateDto) {
  // null = access is gone.
  const [state, setState] = useState<GuestStateDto | null>(initial);
  const [failures, setFailures] = useState(0);
  const [changed, setChanged] = useState(false);
  const version = useRef(initial.version);
  const shownSeat = useRef(describeGuestSeat(initial));

  useEffect(() => {
    const life = { stopped: false, inFlight: false };
    let timer: number | undefined;
    let controller: AbortController | null = null;

    function schedule() {
      window.clearTimeout(timer);
      if (!life.stopped && !document.hidden) {
        timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    }

    async function poll() {
      if (life.stopped || life.inFlight) {
        return;
      }
      life.inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(`${apiBase}/state?since=${encodeURIComponent(version.current)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 204) {
          setFailures(0);
        } else if (response.status === 404) {
          version.current = "";
          shownSeat.current = "";
          setState(null);
          setFailures(0);
        } else if (response.ok) {
          const data: unknown = await response.json();
          if (!isGuestState(data)) {
            throw new Error("unexpected answer");
          }
          const seat = describeGuestSeat(data);
          if (shownSeat.current !== "" && seat !== shownSeat.current) {
            setChanged(true);
          }
          shownSeat.current = seat;
          version.current = data.version;
          setState(data);
          setFailures(0);
        } else {
          setFailures((count) => count + 1);
        }
      } catch {
        // Also reached when the cleanup aborts the request; React ignores updates after unmount.
        setFailures((count) => count + 1);
      } finally {
        window.clearTimeout(timeout);
        life.inFlight = false;
        schedule();
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        window.clearTimeout(timer);
      } else {
        window.clearTimeout(timer);
        void poll();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      life.stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [apiBase]);

  useEffect(() => {
    if (!changed) {
      return;
    }
    const timer = window.setTimeout(() => {
      setChanged(false);
    }, CHANGED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [changed, state]);

  return { state, offline: failures >= OFFLINE_AFTER, changed };
}
