import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import {
  addEventWaiter,
  AddEventWaiterBody,
  eventWaiterMessages,
  getEventWaiters,
  MAX_EVENT_WAITERS,
  WAITER_NAME_MAX_LENGTH,
} from "@/lib/event-waiters";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";
import type { EventWaiterAnswerDto } from "@/types";

export const prerender = false;

// „Kelnerzy na imprezę” (event-waiter-access, S-21b; FR-023): an event's per-event waiters. Owners and managers
// (EVENT_STAFF_ROLES) whoever leads the event; a waiter account, another restaurant's staff, an unknown or malformed id
// and a template → the identical 404 (the central guard). Support mode reads the list (logged; names, status and expiry
// only — never a credential) and its POST is refused by the guard. GET → EventWaitersDto. POST { name } → 201
// EventWaiterAnswerDto with the new waiter's one-time link and code (shown once; the database keeps hashes); 400 the
// name's message; 409 an archived event or one whose window is over, or the per-event limit.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const waiters = await getEventWaiters(api.db, api.event.restaurantId, api.event.id, new Date());
  return waiters ? jsonResponse(waiters) : denied(locals);
};

export const POST: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddEventWaiterBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const t = eventWaiterMessages(locals.locale);
  const result = await addEventWaiter(api.db, {
    restaurantId: api.event.restaurantId,
    eventId: api.event.id,
    name: body.data.name,
    createdBy: api.staff.accountId,
  });
  switch (result.status) {
    case "not-found":
      return denied(locals);
    case "invalid":
      return jsonError(400, result.problem === "empty" ? t.nameEmpty : t.nameTooLong(WAITER_NAME_MAX_LENGTH));
    case "closed":
      return jsonError(409, t.closed);
    case "too-many":
      return jsonError(409, t.tooMany(MAX_EVENT_WAITERS));
    case "added": {
      const waiters = await getEventWaiters(api.db, api.event.restaurantId, api.event.id, new Date());
      if (!waiters) {
        return denied(locals);
      }
      const answer: EventWaiterAnswerDto = { waiters, issued: result.issued };
      return jsonResponse(answer, 201);
    }
  }
};
