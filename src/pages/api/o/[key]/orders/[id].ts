import type { APIRoute } from "astro";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import {
  deleteOrderItem,
  getOrderBoard,
  ORDER_ITEM_NOT_FOUND_MESSAGE,
  PLACE_GONE_MESSAGE,
  toOrderItemPatch,
  UpdateOrderItemBody,
  updateOrderItem,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// One order line (restaurant-orders), organizer only. PATCH any subset of { name, note, quantity, price,
// assignment, delivered } → the board; DELETE → the board. 404 for an unknown line, 400 with the form's message,
// 409 when the guest/table no longer exists.

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, ORDER_ITEM_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, UpdateOrderItemBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const patch = toOrderItemPatch(body.data);
  if (!patch.ok) {
    return jsonError(400, patch.message);
  }
  const result = await updateOrderItem(api.db, id, patch.value);
  switch (result.status) {
    case "not-found":
      return jsonError(404, ORDER_ITEM_NOT_FOUND_MESSAGE);
    case "place-gone":
      return jsonError(409, PLACE_GONE_MESSAGE);
    case "updated":
      return jsonResponse(await getOrderBoard(api.db));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, ORDER_ITEM_NOT_FOUND_MESSAGE);
  }
  const result = await deleteOrderItem(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, ORDER_ITEM_NOT_FOUND_MESSAGE);
  }
  return jsonResponse(await getOrderBoard(api.db));
};
