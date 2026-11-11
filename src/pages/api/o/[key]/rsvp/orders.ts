import type { APIRoute } from "astro";
import { jsonError, jsonResponse } from "@/lib/http";
import { getOrderBoard, orderMessages, tooManyItemsMessage } from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";
import { moveRsvpToOrders, previewRsvpOrders, rsvpMessages } from "@/lib/rsvp";
import type { RsvpOrdersAnswerDto } from "@/types";

export const prerender = false;

// „Przenieś wybory do zamówień” (the PR #4 review's RSVP extras). GET → RsvpOrdersSummaryDto: what a move would do
// now (nothing written). POST (no body) → every coming guest with a chosen dish gets ONE order line of it at their
// seat, like POST /orders (menu gate, the venue's price, course, catalog item, MAX_ORDER_ITEMS), skipping guests who
// already have that dish — idempotent, all or nothing → 201 RsvpOrdersAnswerDto when lines were added, 200 when none;
// 400 naming the dishes the active menu no longer offers (nothing added); 409 at the line limit or when a guest was
// deleted meanwhile. A client route: while the venue leads the middleware answers the POST with 409 and the staff use
// the panel's dispatcher (…/klient/rsvp/orders).

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await previewRsvpOrders(api.db, api.access.event.id));
};

export const POST: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const result = await moveRsvpToOrders(api.db, api.access.event.id);
  switch (result.status) {
    case "not-on-menu":
      return jsonError(400, rsvpMessages(locals.locale).moveNotOnMenu(result.names.join(", ")));
    case "too-many":
      return jsonError(409, tooManyItemsMessage(locals.locale));
    case "place-gone":
      return jsonError(409, orderMessages(locals.locale).placeGone);
    case "moved": {
      const answer: RsvpOrdersAnswerDto = {
        summary: result.summary,
        board: await getOrderBoard(api.db, api.access.event.id),
      };
      return jsonResponse(answer, result.summary.added > 0 ? 201 : 200);
    }
  }
};
