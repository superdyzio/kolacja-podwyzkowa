import type { APIRoute } from "astro";
import {
  deleteEvent,
  EVENT_DELETE_ROLES,
  EVENT_STAFF_ROLES,
  eventInputProblemText,
  getEventCard,
  UpdateEventBody,
  updateEvent,
  validateEventInput,
} from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";
import type { EventCardAnswerDto } from "@/types";

export const prerender = false;

// One event of the logged-in person's restaurant (staff-accounts, F-03; restaurant-events, S-11). Owners and managers:
// GET → its card with the three link paths; PATCH { name?, date?, expectedGuests?, archived? } (at least one) → the
// card. DELETE → the event with everything in it, OWNERS only → { deleted, restaurantId }. A waiter (their access to
// events comes with S-21), a manager deleting, another restaurant's event, an unknown or malformed id all get the
// same 404 as a wrong link key.

async function cardAnswer(api: Awaited<ReturnType<typeof panelEventApi>>, locals: App.Locals): Promise<Response> {
  if (api instanceof Response) {
    return api;
  }
  const card = await getEventCard(api.db, api.event.restaurantId, api.event.id, new Date());
  if (!card) {
    return denied(locals);
  }
  const answer: EventCardAnswerDto = { event: card, role: api.role };
  return jsonResponse(answer);
}

export const GET: APIRoute = async ({ locals, params }) => {
  return cardAnswer(await panelEventApi(locals, params.id, EVENT_STAFF_ROLES), locals);
};

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, UpdateEventBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const input = validateEventInput(body.data);
  if (!input.ok) {
    return jsonError(400, eventInputProblemText(input.problem, locals.locale));
  }
  const patch = { ...input.value, ...(body.data.archived === undefined ? {} : { archived: body.data.archived }) };
  if ((await updateEvent(api.db, api.event.restaurantId, api.event.id, patch)) === "not-found") {
    return denied(locals);
  }
  return cardAnswer(api, locals);
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_DELETE_ROLES);
  if (api instanceof Response) {
    return api;
  }
  if ((await deleteEvent(api.db, api.event.restaurantId, api.event.id)) === "not-found") {
    return denied(locals);
  }
  return jsonResponse({ deleted: true, restaurantId: api.event.restaurantId });
};
