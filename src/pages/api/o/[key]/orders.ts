import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import {
  AddOrderItemBody,
  addOrderItem,
  getOrderBoard,
  orderMessages,
  priceForNewLine,
  toOrderItemInput,
  tooManyItemsMessage,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The evening's food order (restaurant-orders), organizer only. GET: the whole OrderBoardDto. POST { name, note?,
// quantity, assignment?: { guestId } | { tableId } | null } adds a line (priced by the venue) → 201 with the
// board; 400 with the form's message, 409 at the line limit or when the guest/table no longer exists.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddOrderItemBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const input = toOrderItemInput(body.data, locals.locale);
  if (!input.ok) {
    return jsonError(400, input.message);
  }
  // client-restaurant-split (FR-027): the price is the venue's — the newest of that name in the event, else 0.
  const unitPriceGrosze = await priceForNewLine(api.db, api.access.event.id, "dish", input.value.name);
  const result = await addOrderItem(api.db, api.access.event.id, { ...input.value, unitPriceGrosze });
  switch (result.status) {
    case "too-many":
      return jsonError(409, tooManyItemsMessage(locals.locale));
    case "place-gone":
      return jsonError(409, orderMessages(locals.locale).placeGone);
    case "added":
      return jsonResponse(await getOrderBoard(api.db, api.access.event.id), 201);
  }
};
