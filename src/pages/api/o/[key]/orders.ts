import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import {
  AddOrderItemBody,
  addOrderItem,
  getOrderBoard,
  PLACE_GONE_MESSAGE,
  TOO_MANY_ITEMS_MESSAGE,
  toOrderItemInput,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The evening's food order (restaurant-orders), organizer only. GET: the whole OrderBoardDto. POST { name, note?,
// quantity, price (as typed, „49,90”), assignment?: { guestId } | { tableId } | null } adds a line → 201 with the
// board; 400 with the form's message, 409 at the line limit or when the guest/table no longer exists.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getOrderBoard(api.db));
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
  const input = toOrderItemInput(body.data);
  if (!input.ok) {
    return jsonError(400, input.message);
  }
  const result = await addOrderItem(api.db, input.value);
  switch (result.status) {
    case "too-many":
      return jsonError(409, TOO_MANY_ITEMS_MESSAGE);
    case "place-gone":
      return jsonError(409, PLACE_GONE_MESSAGE);
    case "added":
      return jsonResponse(await getOrderBoard(api.db), 201);
  }
};
