import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { OrderBoardDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// Order state of the organizer's order page (restaurant-orders). Every change goes through the API and the board is
// replaced with the one the server returns. Changes run one after another (quick „Wydane” ticks may overlap), so each
// answer already holds every earlier change and answers arrive in the order the changes were made (as in useVenue).
// guest-delivered: guests mark pieces from their phones, so the board is also re-read every 5 s while the page is
// visible and nothing is being saved (a setTimeout chain, one request at a time, 4 s limit, as in useGuessBoard); a
// read that started before a save may carry the older board and is ignored. Open edit forms keep their drafts.

const POLL_MS = 5_000;
const TIMEOUT_MS = 4_000;

export interface OrderRequest {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  // Relative to the organizer API base, e.g. "/orders/12".
  path: string;
  body?: unknown;
}

function isBoard(data: unknown): data is OrderBoardDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof OrderBoardDto, unknown>>;
  return (
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.guests) &&
    Array.isArray(candidate.tables) &&
    Array.isArray(candidate.prep) &&
    typeof candidate.seating === "object" &&
    candidate.seating !== null &&
    typeof candidate.placement === "object" &&
    candidate.placement !== null &&
    typeof candidate.totals === "object" &&
    candidate.totals !== null
  );
}

export function useOrderBoard(apiBase: string, initial: OrderBoardDto, locale: Locale) {
  const [board, setBoard] = useState<OrderBoardDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);
  // Bumped by every change: a read that started before it is ignored.
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
      if (waiting.current > 0) {
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
        const response = await fetch(`${apiBase}/orders`, { signal: current.signal, cache: "no-store" });
        const data = await readJson(response);
        if (response.ok && isBoard(data) && startedAt === generation.current && waiting.current === 0) {
          setBoard(data);
        }
      } catch {
        // A slow or failed read: the next one tries again (the offline notice has its own connectivity check).
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

  const refresh = useCallback(async () => {
    const fresh = await fetch(`${apiBase}/orders`).then(readJson, () => null);
    if (isBoard(fresh)) {
      setBoard(fresh);
    }
  }, [apiBase]);

  const execute = useCallback(
    async ({ method, path, body }: OrderRequest): Promise<boolean> => {
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok) {
          if (isBoard(data)) {
            setBoard(data);
          }
          return true;
        }
        setFailure(toFailure(data, locale));
        // The board may be stale (a line deleted or a guest removed in another tab): start again from the truth.
        if (response.status === 404 || response.status === 409) {
          await refresh();
        }
        return false;
      } catch {
        setFailure(networkFailure(locale));
        return false;
      }
    },
    [apiBase, refresh, locale],
  );

  // Resolves to true when the change was saved; starts after every change asked for before it has answered.
  const send = useCallback(
    (request: OrderRequest): Promise<boolean> => {
      waiting.current += 1;
      generation.current += 1;
      setPending(true);
      if (waiting.current === 1) {
        setFailure(null);
      }
      const result = queue.current.then(() => execute(request));
      queue.current = result;
      return result.finally(() => {
        waiting.current -= 1;
        if (waiting.current === 0) {
          setPending(false);
        }
      });
    },
    [execute],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { board, pending, failure, send, dismissFailure };
}
