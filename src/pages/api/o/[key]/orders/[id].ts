import type { APIRoute } from "astro";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import {
  deleteOrderItem,
  getOrderBoard,
  orderMessages,
  priceForRenamedLine,
  toOrderItemPatch,
  UpdateOrderItemBody,
  updateOrderItem,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// One order line (restaurant-orders), organizer only. PATCH any subset of { name, note, quantity,
// assignment, delivered } → the board; DELETE → the board. 404 for an unknown line, 400 with the form's message,
// 409 when the guest/table no longer exists.

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, orderMessages(locals.locale).itemNotFound);
  }
  const body = await readJsonBody(request, UpdateOrderItemBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const patch = toOrderItemPatch(body.data, locals.locale);
  if (!patch.ok) {
    return jsonError(400, patch.message);
  }
  // client-restaurant-split (FR-027): a line renamed to another dish takes that dish's price (else 0).
  const repriced =
    patch.value.name === undefined
      ? null
      : await priceForRenamedLine(api.db, api.access.event.id, "dish", id, patch.value.name);
  const result = await updateOrderItem(api.db, api.access.event.id, id, {
    ...patch.value,
    ...(repriced === null ? {} : { unitPriceGrosze: repriced }),
  });
  switch (result.status) {
    case "not-found":
      return jsonError(404, orderMessages(locals.locale).itemNotFound);
    case "place-gone":
      return jsonError(409, orderMessages(locals.locale).placeGone);
    case "updated":
      return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, orderMessages(locals.locale).itemNotFound);
  }
  const result = await deleteOrderItem(api.db, api.access.event.id, id);
  if (result.status === "not-found") {
    return jsonError(404, orderMessages(locals.locale).itemNotFound);
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
};
