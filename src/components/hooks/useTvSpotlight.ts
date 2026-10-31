import { useCallback, useState } from "react";
import { isTvSpotlightKind } from "@/lib/tv-spotlight/rules";
import type { TvSpotlightDto } from "@/types";
import { NETWORK_FAILURE, readJson, toFailure, type ApiFailure } from "./api-failure";

// The organizer's TV controls (tv-spotlight): what is on the TV over the seating, and the three actions — show a
// question or an AI topic, draw a person, hide. Every answer is { spotlight } and replaces the state.

function parseSpotlightAnswer(data: unknown): { spotlight: TvSpotlightDto | null } | null {
  if (typeof data !== "object" || data === null || !("spotlight" in data)) {
    return null;
  }
  const { spotlight } = data;
  if (spotlight === null) {
    return { spotlight: null };
  }
  if (typeof spotlight !== "object") {
    return null;
  }
  const { kind, text, shownAt } = spotlight as Record<string, unknown>;
  return isTvSpotlightKind(kind) && typeof text === "string" && typeof shownAt === "string"
    ? { spotlight: { kind, text, shownAt } }
    : null;
}

export function useTvSpotlight(apiBase: string, initial: TvSpotlightDto | null) {
  const [spotlight, setSpotlight] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const url = `${apiBase}/tv-spotlight`;

  const send = useCallback(
    async (method: "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<void> => {
      setPending(true);
      setFailure(null);
      try {
        const response = await fetch(`${url}${path}`, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await readJson(response);
        const answer = response.ok ? parseSpotlightAnswer(data) : null;
        if (answer) {
          setSpotlight(answer.spotlight);
        } else {
          setFailure(toFailure(data));
        }
      } catch {
        setFailure(NETWORK_FAILURE);
      } finally {
        setPending(false);
      }
    },
    [url],
  );

  const show = useCallback((kind: "question" | "topic", text: string) => send("PUT", "", { kind, text }), [send]);
  const drawPerson = useCallback(() => send("POST", "/person"), [send]);
  const hide = useCallback(() => send("DELETE", ""), [send]);

  return { spotlight, pending, failure, show, drawPerson, hide };
}

export type TvSpotlightControls = ReturnType<typeof useTvSpotlight>;
