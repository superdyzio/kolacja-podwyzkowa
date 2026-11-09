import type { APIRoute } from "astro";
import {
  CreateEventBody,
  createRestaurantEvent,
  EVENT_STAFF_ROLES,
  eventInputProblemText,
  listRestaurantEvents,
  validateEventInput,
} from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import type { EventCardAnswerDto } from "@/types";

export const prerender = false;

// A restaurant's events (restaurant-events, S-11), owners and managers only (a waiter, another restaurant's staff, an
// unknown or malformed id: the guard's identical 404). GET → the three lists (upcoming, past, archived). POST
// { name, date, expectedGuests? } → a new event with the starter questions and fresh links → 201 with its card.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await listRestaurantEvents(api.db, api.restaurant.id, new Date()));
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, CreateEventBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const input = validateEventInput(body.data);
  if (!input.ok) {
    return jsonError(400, eventInputProblemText(input.problem, locals.locale));
  }
  const result = await createRestaurantEvent(
    api.db,
    api.restaurant.id,
    { name: input.value.name ?? "", date: input.value.date ?? "", expectedGuests: input.value.expectedGuests ?? null },
    new Date(),
  );
  if (result.status !== "created") {
    return denied(locals);
  }
  const answer: EventCardAnswerDto = { event: result.event, role: api.role };
  return jsonResponse(answer, 201);
};
