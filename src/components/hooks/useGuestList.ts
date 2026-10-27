import { useCallback, useState } from "react";
import type { GuestListDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// Guest list state of the organizer page. Every change goes through the API, and the list is replaced with the one
// the server returns, so the page never drifts from the database.

export type GuestListFailure = ApiFailure;

export interface GuestListRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the organizer API base, e.g. "/guests/12".
  path: string;
  body?: unknown;
}

function isGuestList(data: unknown): data is GuestListDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestListDto, unknown>>;
  return Array.isArray(candidate.guests) && Array.isArray(candidate.groups);
}

export function useGuestList(apiBase: string, initialList: GuestListDto) {
  const [list, setList] = useState<GuestListDto>(initialList);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<GuestListFailure | null>(null);

  // Resolves to true when the change was saved.
  const send = useCallback(
    async ({ method, path, body }: GuestListRequest): Promise<boolean> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok) {
          if (isGuestList(data)) {
            setList({ guests: data.guests, groups: data.groups });
          }
          return true;
        }
        setFailure(toFailure(data));
        // The list may be stale (e.g. changed in another tab): reload it so the next try starts from the truth.
        if (response.status === 404 || response.status === 409) {
          const fresh = await fetch(`${apiBase}/guests`).then(readJson, () => null);
          if (isGuestList(fresh)) {
            setList({ guests: fresh.guests, groups: fresh.groups });
          }
        }
        return false;
      } catch {
        setFailure(NETWORK_FAILURE);
        return false;
      } finally {
        setPending(false);
      }
    },
    [apiBase],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { list, pending, failure, send, dismissFailure };
}
