import { useCallback, useRef, useState } from "react";
import {
  MAX_PLAN_BYTES,
  PLAN_TOO_LARGE_MESSAGE,
  PLAN_UNSUPPORTED_MESSAGE,
  formatMegabytes,
  isPlanImageType,
} from "@/lib/venue/image";
import type { VenueDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// Venue state of the rooms-and-tables page. Every change goes through the API, and the venue is replaced with the
// one the server returns, so the page never drifts from the database. Changes run one after another (venue-drawing:
// a drag, a debounced nudge and the chair-scale slider may overlap): each answer then already holds every earlier
// change, and answers arrive in the order the changes were made.

export interface VenueRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the organizer API base, e.g. "/tables/12".
  path: string;
  body?: unknown;
}

function isVenue(data: unknown): data is VenueDto {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const candidate = data as Partial<Record<keyof VenueDto, unknown>>;
  return (
    "plan" in candidate &&
    Array.isArray(candidate.rooms) &&
    Array.isArray(candidate.tables) &&
    typeof candidate.chairPitch === "number"
  );
}

function pick(venue: VenueDto): VenueDto {
  return { plan: venue.plan, rooms: venue.rooms, tables: venue.tables, chairPitch: venue.chairPitch };
}

export function useVenue(apiBase: string, initialVenue: VenueDto) {
  const [venue, setVenue] = useState<VenueDto>(initialVenue);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);

  const execute = useCallback(
    async (request: () => Promise<Response>): Promise<boolean> => {
      try {
        const response = await request();
        const data = await readJson(response);
        if (response.ok) {
          if (isVenue(data)) {
            setVenue(pick(data));
          }
          return true;
        }
        setFailure(toFailure(data));
        // The venue may be stale (e.g. changed in another tab): reload it so the next try starts from the truth.
        if (response.status === 404 || response.status === 409) {
          const fresh = await fetch(`${apiBase}/venue`).then(readJson, () => null);
          if (isVenue(fresh)) {
            setVenue(pick(fresh));
          }
        }
        return false;
      } catch {
        setFailure(NETWORK_FAILURE);
        return false;
      }
    },
    [apiBase],
  );

  // Resolves to true when the change was saved; starts after every change asked for before it has answered.
  const run = useCallback(
    (request: () => Promise<Response>): Promise<boolean> => {
      waiting.current += 1;
      setPending(true);
      // A new change clears the last error only when nothing is queued: an error of a queued change stays visible.
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

  const send = useCallback(
    ({ method, path, body }: VenueRequest) =>
      run(() =>
        fetch(`${apiBase}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      ),
    [apiBase, run],
  );

  // The server decides the type from the file's bytes; these checks only give a quicker answer.
  const uploadPlan = useCallback(
    async (file: File): Promise<boolean> => {
      if (file.type !== "" && !isPlanImageType(file.type)) {
        setFailure({ message: PLAN_UNSUPPORTED_MESSAGE, details: [] });
        return false;
      }
      if (file.size > MAX_PLAN_BYTES) {
        setFailure({ message: `${PLAN_TOO_LARGE_MESSAGE} Ten plik ma ${formatMegabytes(file.size)}.`, details: [] });
        return false;
      }
      return run(() =>
        fetch(`${apiBase}/plan`, {
          method: "PUT",
          headers: { "Content-Type": file.type === "" ? "application/octet-stream" : file.type },
          body: file,
        }),
      );
    },
    [apiBase, run],
  );

  const showFailure = useCallback((message: string) => {
    setFailure({ message, details: [] });
  }, []);

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { venue, pending, failure, send, uploadPlan, showFailure, dismissFailure };
}
