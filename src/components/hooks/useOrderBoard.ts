import { useCallback, useRef, useState } from "react";
import type { OrderBoardDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// Order state of the organizer's order page (restaurant-orders). Every change goes through the API and the board is
// replaced with the one the server returns. Changes run one after another (quick „Wydane” ticks may overlap), so each
// answer already holds every earlier change and answers arrive in the order the changes were made (as in useVenue).

export interface OrderRequest {
  method: "POST" | "PATCH" | "DELETE";
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
    typeof candidate.placement === "object" &&
    candidate.placement !== null &&
    typeof candidate.totals === "object" &&
    candidate.totals !== null
  );
}

export function useOrderBoard(apiBase: string, initial: OrderBoardDto) {
  const [board, setBoard] = useState<OrderBoardDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);

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
        setFailure(toFailure(data));
        // The board may be stale (a line deleted or a guest removed in another tab): start again from the truth.
        if (response.status === 404 || response.status === 409) {
          await refresh();
        }
        return false;
      } catch {
        setFailure(NETWORK_FAILURE);
        return false;
      }
    },
    [apiBase, refresh],
  );

  // Resolves to true when the change was saved; starts after every change asked for before it has answered.
  const send = useCallback(
    (request: OrderRequest): Promise<boolean> => {
      waiting.current += 1;
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
