import { useCallback, useState } from "react";
import type { GuestListDto } from "@/types";

// Guest list state of the organizer page. Every change goes through the API, and the list is replaced with the one
// the server returns, so the page never drifts from the database.

export interface GuestListFailure {
  message: string;
  // Extra lines to show (e.g. the paste problems, one per line).
  details: string[];
}

export interface GuestListRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the organizer API base, e.g. "/guests/12".
  path: string;
  body?: unknown;
}

const NETWORK_FAILURE: GuestListFailure = {
  message: "Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.",
  details: [],
};

function isGuestList(data: unknown): data is GuestListDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof GuestListDto, unknown>>;
  return Array.isArray(candidate.guests) && Array.isArray(candidate.groups);
}

function toFailure(data: unknown): GuestListFailure {
  if (typeof data === "object" && data !== null) {
    const { error, problems } = data as { error?: unknown; problems?: unknown };
    if (typeof error === "string") {
      const details = Array.isArray(problems)
        ? problems.filter((line): line is string => typeof line === "string")
        : [];
      return { message: error, details };
    }
  }
  return { message: "Coś poszło nie tak. Spróbuj ponownie.", details: [] };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
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
