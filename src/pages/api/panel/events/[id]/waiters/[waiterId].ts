import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { deleteEventWaiter, getEventWaiters } from "@/lib/event-waiters";
import { jsonResponse, parseId } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// Revoking a per-event waiter (event-waiter-access, S-21b): DELETE removes the row — its link, code and session stop
// working at the waiter's next request. Owners and managers of the event's restaurant; a waiter of another event, an
// unknown or malformed waiter id and everything the central guard refuses → the identical 404. → EventWaitersDto.

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const waiterId = parseId(params.waiterId);
  if (waiterId === null) {
    return denied(locals);
  }
  const result = await deleteEventWaiter(api.db, api.event.restaurantId, api.event.id, waiterId);
  if (result === "not-found") {
    return denied(locals);
  }
  const waiters = await getEventWaiters(api.db, api.event.restaurantId, api.event.id, new Date());
  return waiters ? jsonResponse(waiters) : denied(locals);
};
