import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { RsvpBoardDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the client's RSVP page (guest-rsvp-menu, S-25), also in the panel's preview. Every change goes through the
// API and the whole board is replaced with the one the server returns; one change at a time. Guests answer from their
// phones meanwhile, so the board is re-read every 15 s while the page is visible and nothing is being saved (a
// setTimeout chain, one request at a time, 8 s limit); a read that started before a change is ignored.

const POLL_MS = 15_000;
const TIMEOUT_MS = 8_000;

export interface RsvpBoardRequest {
  method: "PATCH" | "PUT";
  // Relative to the API base, e.g. "/rsvp" or "/rsvp/guests/12".
  path: string;
  body: unknown;
}

export function isRsvpBoard(data: unknown): data is RsvpBoardDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof RsvpBoardDto, unknown>>;
  return (
    "deadline" in candidate &&
    typeof candidate.open === "boolean" &&
    typeof candidate.eventDate === "string" &&
    Array.isArray(candidate.options) &&
    Array.isArray(candidate.menu) &&
    Array.isArray(candidate.guests) &&
    typeof candidate.counts === "object" &&
    candidate.counts !== null
  );
}

export function useRsvpBoard(apiBase: string, initial: RsvpBoardDto, locale: Locale, live = true) {
  const [board, setBoard] = useState<RsvpBoardDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const saving = useRef(false);
  // Bumped by every change: a read that started before it is ignored.
  const generation = useRef(0);

  useEffect(() => {
    if (!live) {
      return;
    }
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
        const response = await fetch(`${apiBase}/rsvp`, { signal: current.signal, cache: "no-store" });
        const data = await readJson(response);
        if (response.ok && isRsvpBoard(data) && startedAt === generation.current) {
          setBoard(data);
        }
      } catch {
        // A slow or failed read keeps the last board; the next one tries again.
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
  }, [apiBase, live]);

  // Resolves to true when the change was saved.
  const send = useCallback(
    async ({ method, path, body }: RsvpBoardRequest): Promise<boolean> => {
      saving.current = true;
      generation.current++;
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isRsvpBoard(data)) {
          setBoard(data);
          return true;
        }
        setFailure(toFailure(data, locale));
        // The board may be stale (a guest deleted, a dish withdrawn): reload it.
        if (response.status === 404 || response.status === 400) {
          const fresh = await fetch(`${apiBase}/rsvp`, { cache: "no-store" }).then(readJson, () => null);
          if (isRsvpBoard(fresh)) {
            setBoard(fresh);
          }
        }
        return false;
      } catch {
        setFailure(networkFailure(locale));
        return false;
      } finally {
        saving.current = false;
        setPending(false);
      }
    },
    [apiBase, locale],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { board, pending, failure, send, dismissFailure };
}
