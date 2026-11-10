import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { EventWaiterAnswerDto, EventWaiterIssuedDto, EventWaitersDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of „Kelnerzy na imprezę” on the event card (event-waiter-access, S-21b). One action at a time; every answer
// replaces the list. The new waiter's link and code live only in the island's state (shown once; the database keeps
// their hashes). A 404 (the waiter was revoked in another tab, or the person lost the event) re-reads the list.

export function eventWaitersApiPath(eventId: number): string {
  return `/api/panel/events/${String(eventId)}/waiters`;
}

function isList(data: unknown): data is EventWaitersDto {
  return typeof data === "object" && data !== null && Array.isArray((data as { waiters?: unknown }).waiters);
}

function isAnswer(data: unknown): data is EventWaiterAnswerDto {
  return (
    typeof data === "object" &&
    data !== null &&
    isList((data as { waiters?: unknown }).waiters) &&
    typeof (data as { issued?: unknown }).issued === "object"
  );
}

export function useEventWaiters(eventId: number, initial: EventWaitersDto, locale: Locale) {
  const [list, setList] = useState<EventWaitersDto>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const api = eventWaitersApiPath(eventId);

  const run = useCallback(
    async (method: "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${api}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok) {
          return data;
        }
        setFailure(toFailure(data, locale));
        if (response.status === 404 || response.status === 409) {
          const fresh = await fetch(api).then(readJson, () => null);
          if (isList(fresh)) {
            setList(fresh);
          }
        }
        return null;
      } catch {
        setFailure(networkFailure(locale));
        return null;
      } finally {
        setPending(false);
      }
    },
    [api, locale],
  );

  // Resolves to the new waiter's credentials, or null (the failure is shown).
  const add = useCallback(
    async (name: string): Promise<EventWaiterIssuedDto | null> => {
      const data = await run("POST", "", { name });
      if (isAnswer(data)) {
        setList(data.waiters);
        return data.issued;
      }
      return null;
    },
    [run],
  );

  const revoke = useCallback(
    async (waiterId: number): Promise<boolean> => {
      const data = await run("DELETE", `/${String(waiterId)}`);
      if (isList(data)) {
        setList(data);
        return true;
      }
      return false;
    },
    [run],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { list, pending, failure, add, revoke, dismissFailure };
}
