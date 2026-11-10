import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { OwnerResultDto, PlatformRestaurantDto, StaffLinkDto, SupportGrantDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the platform panel (platform-restaurants, S-10). Every change goes through the platform API and the whole
// list is replaced with the one the server returns, so the page never drifts from the database. The one-time links
// in the answers live only in the island's state (the database keeps their hashes). `active` = this login's live
// support sessions (admin-support-log, S-13): entering one goes to the restaurant's page, ending one drops it here.

export const PLATFORM_API = "/api/panel/platform/restaurants";

export interface PlatformRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to PLATFORM_API, e.g. "" or "/12/owners".
  path: string;
  body?: unknown;
}

export interface PlatformAnswer {
  restaurants: PlatformRestaurantDto[];
  restaurantId?: number;
  owner?: OwnerResultDto;
  link?: StaffLinkDto;
  // Support mode (admin-support-log, S-13): entered → where it starts; ended → whether a live one ended.
  support?: SupportGrantDto;
  ended?: boolean;
}

function isAnswer(data: unknown): data is PlatformAnswer {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  return Array.isArray((data as { restaurants?: unknown }).restaurants);
}

export function usePlatformRestaurants(
  initial: PlatformRestaurantDto[],
  initialSupport: SupportGrantDto[],
  locale: Locale,
) {
  const [restaurants, setRestaurants] = useState<PlatformRestaurantDto[]>(initial);
  const [active, setActive] = useState<SupportGrantDto[]>(initialSupport);
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

  // „Wejdź jako wsparcie”: the reason is already checked (parseSupportReason); on success the browser goes to the
  // restaurant's page in support mode.
  const enterSupport = useCallback(
    async (restaurantId: number, reason: string): Promise<boolean> => {
      const answer = await send({ method: "POST", path: `/${String(restaurantId)}/support`, body: { reason } });
      const grant = answer?.support;
      if (!grant) {
        return false;
      }
      setActive((current) => [...current.filter((entry) => entry.restaurantId !== restaurantId), grant]);
      window.location.assign(grant.path);
      return true;
    },
    [send],
  );

  // „Zakończ wsparcie” (also when it has expired in the meantime: the answer then says nothing ended).
  const endSupport = useCallback(
    async (restaurantId: number): Promise<void> => {
      const answer = await send({ method: "DELETE", path: `/${String(restaurantId)}/support` });
      if (answer) {
        setActive((current) => current.filter((entry) => entry.restaurantId !== restaurantId));
      }
    },
    [send],
  );

  return { restaurants, active, pending, failure, send, dismissFailure, enterSupport, endSupport };
}
