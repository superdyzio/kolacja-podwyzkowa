import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import {
  deleteMenuItem,
  getMenuCatalog,
  menuMessages,
  parseMenuItemPatch,
  UpdateMenuItemBody,
  updateMenuItem,
} from "@/lib/menu";
import { denied, panelRestaurantApi } from "@/lib/panel-api";

export const prerender = false;

// One item of the restaurant's menu catalog (menu-catalog-courses, S-16), owners and managers. PATCH any of { name,
// course, price } → MenuCatalogDto (lines already ordered keep their name, course and price); DELETE → MenuCatalogDto
// (the item leaves every event's menu, ordered lines stay). An item of another restaurant, an unknown or malformed id
// → the identical 404; 400 with the rule's message, 409 duplicate name.

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const itemId = parseId(params.itemId);
  if (itemId === null) {
    return denied(locals);
  }
  const body = await readJsonBody(request, UpdateMenuItemBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const patch = parseMenuItemPatch(body.data, locals.locale);
  if (!patch.ok) {
    return jsonError(400, patch.message);
  }
  const result = await updateMenuItem(api.db, api.restaurant.id, itemId, patch.value);
  if (result.status === "not-found") {
    return denied(locals);
  }
  if (result.status === "duplicate") {
    return jsonError(409, menuMessages(locals.locale).duplicate(patch.value.name ?? ""));
  }
  return jsonResponse(await getMenuCatalog(api.db, api.restaurant.id));
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const itemId = parseId(params.itemId);
  if (itemId === null) {
    return denied(locals);
  }
  const result = await deleteMenuItem(api.db, api.restaurant.id, itemId);
  if (result.status === "not-found") {
    return denied(locals);
  }
  return jsonResponse(await getMenuCatalog(api.db, api.restaurant.id));
};
