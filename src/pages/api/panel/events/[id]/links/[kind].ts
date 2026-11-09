import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES, getEventCard, isEventLinkKind, rotateEventKey } from "@/lib/events";
import { jsonResponse } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";
import type { EventCardAnswerDto } from "@/types";

export const prerender = false;

// „Wymień link” (restaurant-events, S-11, FR-025): POST /api/panel/events/<id>/links/<organizer|tv|restaurant> writes
// a fresh key for that one link; the old link opens nothing from the next request on (the middleware resolves keys
// per request). Owners and managers; anyone else, an unknown event and any other kind (guests' links are the
// client's) get the identical 404. Answers the card with the new link.

export const POST: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  if (!isEventLinkKind(params.kind)) {
    return denied(locals);
  }
  if ((await rotateEventKey(api.db, api.event.restaurantId, api.event.id, params.kind)) === "not-found") {
    return denied(locals);
  }
  const card = await getEventCard(api.db, api.event.restaurantId, api.event.id, new Date());
  if (!card) {
    return denied(locals);
  }
  const answer: EventCardAnswerDto = { event: card, role: api.role };
  return jsonResponse(answer);
};
