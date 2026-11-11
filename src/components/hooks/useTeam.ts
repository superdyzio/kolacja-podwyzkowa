import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { StaffLinkDto, TeamAnswerDto, TeamDto, TeamInviteResultDto } from "@/types";
import { networkFailure, readJson, toFailure, type ApiFailure } from "./api-failure";

// State of the restaurant team section (restaurant-team, S-12). Every change goes through the team API and the whole
// team is replaced with the one the server returns, one action at a time. A 404 (the member or the person's own
// rights changed meanwhile) re-reads the team; when that is a 404 too, or an answer says the person no longer manages
// the team (`team: null`), the section shows `lost` with the way back to the panel. One-time links in the answers live
// only in the island's state (the database keeps their hashes).

export function teamApiPath(restaurantId: number): string {
  return `/api/panel/restaurants/${String(restaurantId)}/team`;
}

export interface TeamRequest {
  method: "POST" | "PATCH" | "DELETE";
  // Relative to the team API, e.g. "" or "/12" or "/12/link".
  path: string;
  body?: unknown;
}

export interface TeamResult {
  invited?: TeamInviteResultDto;
  link?: StaffLinkDto;
}

function isAnswer(data: unknown): data is TeamAnswerDto {
  if (typeof data !== "object" || data === null || !("team" in data)) {
    return false;
  }
  const team = data.team;
  return team === null || (typeof team === "object" && Array.isArray((team as { members?: unknown }).members));
}

export function useTeam(restaurantId: number, initial: TeamDto, locale: Locale) {
  const [team, setTeam] = useState<TeamDto>(initial);
  const [lost, setLost] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const api = teamApiPath(restaurantId);

  // Resolves to the answer's extras when the change was saved, else null (the failure is shown).
  const send = useCallback(
    async ({ method, path, body }: TeamRequest): Promise<TeamResult | null> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${api}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        if (response.ok && isAnswer(data)) {
          if (data.team === null) {
            setLost(true);
          } else {
            setTeam(data.team);
          }
          return { invited: data.invited, link: data.link };
        }
        setFailure(toFailure(data, locale));
        if (response.status === 404) {
          const fresh = await fetch(api).then(readJson, () => null);
          if (isAnswer(fresh) && fresh.team !== null) {
            setTeam(fresh.team);
          } else if (fresh !== null) {
            setLost(true);
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

  const dismissFailure = useCallback(() => {
    setFailure(null);
  }, []);

  return { team, lost, pending, failure, send, dismissFailure };
}
