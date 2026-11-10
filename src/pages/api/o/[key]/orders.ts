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
import { findMenuItem, getAvailableMenu, menuMessages } from "@/lib/menu";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The evening's food order (restaurant-orders), organizer only. GET: the whole OrderBoardDto. POST { name, note?,
// quantity, assignment?: { guestId } | { tableId } | null } adds a line (priced by the venue) → 201 with the
// board; 400 with the form's message (or „not on the menu” while the event has a menu), 409 at the line limit or
// when the guest/table no longer exists.

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
  // menu-catalog-courses (S-16): while the event has a menu, a line must be one of its items (its spelling, course
  // and catalog item); without one, free text as before.
  const menu = await getAvailableMenu(api.db, api.access.event.id);
  const item = findMenuItem(menu, input.value.name);
  if (menu.length > 0 && !item) {
    return jsonError(400, menuMessages(locals.locale).notOnMenu);
  }
  const name = item?.name ?? input.value.name;
  // client-restaurant-split (FR-027): the price is the venue's — the newest of that name in the event, else the
  // menu's price (menu-catalog-courses), else 0.
  const unitPriceGrosze = await priceForNewLine(api.db, api.access.event.id, "dish", name, item?.priceGrosze ?? 0);
  const result = await addOrderItem(api.db, api.access.event.id, {
    ...input.value,
    name,
    unitPriceGrosze,
    course: item?.course ?? null,
    menuItemId: item?.id ?? null,
  });
  switch (result.status) {
    case "too-many":
      return jsonError(409, tooManyItemsMessage(locals.locale));
    case "place-gone":
      return jsonError(409, orderMessages(locals.locale).placeGone);
    case "added":
      return jsonResponse(await getOrderBoard(api.db, api.access.event.id), 201);
  }
};
