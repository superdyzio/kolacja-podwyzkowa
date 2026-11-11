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
import { findMenuItem, getAvailableMenu, menuMessages } from "@/lib/menu";
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
  // client-restaurant-split (FR-027): a line renamed to another dish takes that dish's price (else the menu's, else
  // 0). menu-catalog-courses (S-16): while the event has a menu, the other dish must be on it; a spelling fix and
  // every other change of a line (also a free-text line from before the menu) stay allowed.
  let rename = {};
  if (patch.value.name !== undefined) {
    const menu = await getAvailableMenu(api.db, api.access.event.id);
    const item = findMenuItem(menu, patch.value.name);
    const name = item?.name ?? patch.value.name;
    const repriced = await priceForRenamedLine(api.db, api.access.event.id, "dish", id, name, item?.priceGrosze ?? 0);
    if (repriced !== null) {
      if (menu.length > 0 && !item) {
        return jsonError(400, menuMessages(locals.locale).notOnMenu);
      }
      rename = { name, unitPriceGrosze: repriced, course: item?.course ?? null, menuItemId: item?.id ?? null };
    }
  }
  const result = await updateOrderItem(api.db, api.access.event.id, id, { ...patch.value, ...rename });
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
