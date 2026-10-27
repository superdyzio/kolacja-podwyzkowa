import { useCallback, useEffect, useRef, useState } from "react";
import type { GuessBoardDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the organizer's guesses page (S-06). Every change goes through the API and the whole board is replaced
// with the one the server returns. Guests save from their phones meanwhile, so the board is also re-read every 5 s
// while the page is visible and nothing is being saved (a setTimeout chain, one request at a time, 4 s limit). A read
// that started before a save may carry the older board and is ignored. After 3 failed reads in a row `offline` is set
// until the next answer. Typing is never overwritten: edit fields keep their own drafts.

const POLL_MS = 5_000;
const TIMEOUT_MS = 4_000;
const OFFLINE_AFTER = 3;

export interface GuessBoardRequest {
  method: "PATCH" | "PUT" | "DELETE";
  // Relative to the organizer API base, e.g. "/guesses/12".
  path: string;
  body?: unknown;
}

export function isGuessBoard(data: unknown): data is GuessBoardDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuessBoardDto, unknown>>;
  return (
    typeof candidate.intakeOpen === "boolean" &&
    Array.isArray(candidate.guests) &&
    Array.isArray(candidate.missing) &&
    "correctAmountGrosze" in candidate &&
    "ranking" in candidate
  );
}

export function useGuessBoard(apiBase: string, initial: GuessBoardDto) {
  const [board, setBoard] = useState<GuessBoardDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [failures, setFailures] = useState(0);
  const saving = useRef(false);
  // Bumped by every save: a read that started before it is ignored.
  const generation = useRef(0);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    function schedule() {
      window.clearTimeout(timer);
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    }

    async function poll() {
      if (stopped || controller) {
        return;
      }
      if (saving.current) {
        schedule();
        return;
      }
      const current = new AbortController();
      controller = current;
      const startedAt = generation.current;
      const timeout = window.setTimeout(() => {
        current.abort();
      }, TIMEOUT_MS);
      try {
        const response = await fetch(`${apiBase}/guesses`, { signal: current.signal, cache: "no-store" });
        const data = await readJson(response);
        if (response.ok && isGuessBoard(data)) {
          if (startedAt === generation.current) {
            setBoard(data);
          }
          setFailures(0);
        } else {
          setFailures((count) => count + 1);
        }
      } catch {
        // Also a slow answer (aborted after 4 s). After unmounting this update is simply dropped.
        setFailures((count) => count + 1);
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        schedule();
      }
    }

    function onVisibilityChange() {
      window.clearTimeout(timer);
      if (!document.hidden) {
        void poll();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [apiBase]);

  // Resolves to true when the change was saved.
  const send = useCallback(
    async ({ method, path, body }: GuessBoardRequest): Promise<boolean> => {
      saving.current = true;
      generation.current++;
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isGuessBoard(data)) {
          setBoard(data);
          setFailures(0);
          return true;
        }
        setFailure(toFailure(data));
        // The board may be stale (e.g. a guest deleted in another tab): reload it.
        if (response.status === 404) {
          const fresh = await fetch(`${apiBase}/guesses`, { cache: "no-store" }).then(readJson, () => null);
          if (isGuessBoard(fresh)) {
            setBoard(fresh);
          }
        }
        return false;
      } catch {
        setFailure(NETWORK_FAILURE);
        return false;
      } finally {
        saving.current = false;
        setPending(false);
      }
    },
    [apiBase],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { board, pending, failure, offline: failures >= OFFLINE_AFTER, send, dismissFailure };
}
