import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { OwnerResultDto, PlatformRestaurantDto, StaffLinkDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the platform panel (platform-restaurants, S-10). Every change goes through the platform API and the whole
// list is replaced with the one the server returns, so the page never drifts from the database. The one-time links
// in the answers live only in the island's state (the database keeps their hashes).

export const PLATFORM_API = "/api/panel/platform/restaurants";

export interface PlatformRequest {
  method: "POST" | "PATCH";
  // Relative to PLATFORM_API, e.g. "" or "/12/owners".
  path: string;
  body?: unknown;
}

export interface PlatformAnswer {
  restaurants: PlatformRestaurantDto[];
  restaurantId?: number;
  owner?: OwnerResultDto;
  link?: StaffLinkDto;
}

function isAnswer(data: unknown): data is PlatformAnswer {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  return Array.isArray((data as { restaurants?: unknown }).restaurants);
}

export function usePlatformRestaurants(initial: PlatformRestaurantDto[], locale: Locale) {
  const [restaurants, setRestaurants] = useState<PlatformRestaurantDto[]>(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  // Resolves to the answer when the change was saved, else null (the failure is shown).
  const send = useCallback(
    async ({ method, path, body }: PlatformRequest): Promise<PlatformAnswer | null> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${PLATFORM_API}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isAnswer(data)) {
          setRestaurants(data.restaurants);
          return data;
        }
        setFailure(toFailure(data, locale));
        // The list may be stale (e.g. changed in another tab): reload it.
        if (response.status === 404) {
          const fresh = await fetch(PLATFORM_API).then(readJson, () => null);
          if (isAnswer(fresh)) {
            setRestaurants(fresh.restaurants);
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
    [locale],
  );

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { restaurants, pending, failure, send, dismissFailure };
}
