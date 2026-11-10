import type { APIRoute } from "astro";
import {
  DATE_WOULD_PURGE_CODE,
  deleteEvent,
  EVENT_DELETE_ROLES,
  EVENT_STAFF_ROLES,
  eventInputProblemText,
  formatEventDate,
  getEventCard,
  UpdateEventBody,
  updateEvent,
  validateEventInput,
} from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";
import { dateChangePurgesGuestData, privacyMessages } from "@/lib/privacy";
import { supportEventSummary } from "@/lib/support";
import type { EventCardAnswerDto, SupportEventAnswerDto } from "@/types";

export const prerender = false;

// One event of the logged-in person's restaurant (staff-accounts, F-03; restaurant-events, S-11). Owners and managers:
// GET → its card with the three link paths; PATCH { name?, date?, expectedGuests?, archived?, venueLeads? } (at least one; venueLeads = „Lokal prowadzi”, client-restaurant-split) → the
// card. DELETE → the event with everything in it, OWNERS only → { deleted, restaurantId }. A waiter (their access to
// events comes with S-21), a manager deleting, another restaurant's event, an unknown or malformed id all get the
// same 404 as a wrong link key. The platform administrator in support mode (admin-support-log, S-13) gets the GET
// WITHOUT the links ({ event, support }: link keys never reach support mode) and never a PATCH or DELETE (the guard
// admits reads only).
// review-fixes: a PATCH moving the date past the restaurant's guest data term while the event holds guest data → 409
// { error, code: "date-would-purge" } and nothing is saved (the next guard would delete the guests' data at once).

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
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response || !api.support) {
    return cardAnswer(api, locals);
  }
  const card = await getEventCard(api.db, api.event.restaurantId, api.event.id, new Date());
  if (!card) {
    return denied(locals);
  }
  const answer: SupportEventAnswerDto = { event: supportEventSummary(card), support: api.support };
  return jsonResponse(answer);
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
  if (input.value.date !== undefined) {
    const warning = await dateChangePurgesGuestData(api.db, api.event.id, input.value.date, new Date());
    if (warning) {
      const text = privacyMessages(locals.locale).dateWouldPurge(
        formatEventDate(warning.deleteAfter, locals.locale),
        warning.retentionDays,
      );
      return jsonError(409, text, { code: DATE_WOULD_PURGE_CODE });
    }
  }
  const patch = {
    ...input.value,
    ...(body.data.archived === undefined ? {} : { archived: body.data.archived }),
    ...(body.data.venueLeads === undefined ? {} : { venueLeads: body.data.venueLeads }),
  };
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
