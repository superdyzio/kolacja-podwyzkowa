import { useState } from "react";
import { networkFailure, readJson, toFailure } from "@/components/hooks/api-failure";
import type { EventLinkKind } from "@/lib/events/rules";
import type { Locale } from "@/lib/i18n";
import type { EventCardAnswerDto, EventCardDto } from "@/types";

// Which part of the card an answer belongs to: its status line is shown there.
export type EventCardScope = EventLinkKind | "details" | "archive" | "delete";

export interface EventCardStatus {
  scope: EventCardScope;
  text: string;
  error: boolean;
}

export interface EventDetailsPatch {
  name: string;
  date: string;
  expectedGuests: number | null;
}

function isCardAnswer(data: unknown): data is EventCardAnswerDto {
  const event: unknown = (data as { event?: unknown } | null)?.event;
  if (typeof event !== "object" || event === null) {
    return false;
  }
  const { id, links } = event as Partial<EventCardDto>;
  return typeof id === "number" && typeof links === "object";
}

// The event card's state (restaurant-events, S-11): every answer of the event routes replaces the whole card; a 404
// means the event is gone (deleted in another tab, or the person lost access) and the card says so. One action at a
// time: the buttons are disabled while `pending` is set.
export function useEventCard(initial: EventCardDto, locale: Locale) {
  const [card, setCard] = useState(initial);
  const [gone, setGone] = useState(false);
  const [pending, setPending] = useState<EventCardScope | null>(null);
  const [status, setStatus] = useState<EventCardStatus | null>(null);
  const base = `/api/panel/events/${String(initial.id)}`;

  async function send(scope: EventCardScope, url: string, init: RequestInit, success: string): Promise<void> {
    setPending(scope);
    setStatus(null);
    try {
      const response = await fetch(url, init);
      const data = await readJson(response);
      if (response.status === 404) {
        setGone(true);
      } else if (response.ok && isCardAnswer(data)) {
        setCard(data.event);
        setStatus({ scope, text: success, error: false });
      } else {
        setStatus({ scope, text: toFailure(data, locale).message, error: true });
      }
    } catch {
      setStatus({ scope, text: networkFailure(locale).message, error: true });
    } finally {
      setPending(null);
    }
  }

  function patch(scope: EventCardScope, body: Partial<EventDetailsPatch> & { archived?: boolean }, success: string) {
    return send(
      scope,
      base,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      success,
    );
  }

  function rotate(kind: EventLinkKind, success: string) {
    return send(kind, `${base}/links/${kind}`, { method: "POST" }, success);
  }

  // Deletes the event; on success the browser goes back to the restaurant (pending stays set until it leaves).
  async function remove(): Promise<void> {
    setPending("delete");
    setStatus(null);
    try {
      const response = await fetch(base, { method: "DELETE" });
      const data = await readJson(response);
      if (response.status === 404) {
        setGone(true);
      } else if (response.ok) {
        window.location.assign(`/panel/restauracje/${String(card.restaurantId)}`);
        return;
      } else {
        setStatus({ scope: "delete", text: toFailure(data, locale).message, error: true });
      }
    } catch {
      setStatus({ scope: "delete", text: networkFailure(locale).message, error: true });
    }
    setPending(null);
  }

  return { card, gone, pending, status, patch, rotate, remove };
}
