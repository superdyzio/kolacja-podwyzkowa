import { useCallback, useState } from "react";
import type { GuestLinksDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the organizer's guest links page (S-05). Every change goes through the API and the whole list is replaced
// with the one the server returns, so the page never drifts from the database.

export interface GuestLinksRequest {
  method: "PATCH" | "POST";
  // Relative to the organizer API base, e.g. "/guest-links/12/revoke".
  path: string;
  body?: unknown;
}

function isGuestLinks(data: unknown): data is GuestLinksDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestLinksDto, unknown>>;
  return typeof candidate.enabled === "boolean" && Array.isArray(candidate.guests);
}

export function useGuestLinks(apiBase: string, initial: GuestLinksDto) {
  const [links, setLinks] = useState<GuestLinksDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Resolves to true when the change was saved.
  const send = useCallback(
    async ({ method, path, body }: GuestLinksRequest): Promise<boolean> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isGuestLinks(data)) {
          setLinks(data);
          return true;
        }
        setFailure(toFailure(data));
        // The list may be stale (e.g. a guest deleted in another tab): reload it.
        if (response.status === 404) {
          const fresh = await fetch(`${apiBase}/guest-links`).then(readJson, () => null);
          if (isGuestLinks(fresh)) {
            setLinks(fresh);
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

  return { links, pending, failure, send, dismissFailure };
}
