import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import {
  AddMenuItemBody,
  addMenuItem,
  getMenuCatalog,
  MAX_MENU_ITEMS,
  menuMessages,
  parseMenuItemInput,
} from "@/lib/menu";
import { panelRestaurantApi } from "@/lib/panel-api";

export const prerender = false;

// The restaurant's menu catalog (menu-catalog-courses, S-16; FR-037), owners and managers (a waiter, another
// restaurant's staff, an unknown or malformed id: the guard's identical 404; the platform administrator in support
// mode reads it, logged, and every write of theirs is the same 404). GET → MenuCatalogDto. POST { name, course,
// price } (as typed) → 201 MenuCatalogDto; 400 with the rule's message, 409 duplicate name or the catalog limit.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getMenuCatalog(api.db, api.restaurant.id));
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddMenuItemBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const input = parseMenuItemInput(body.data, locals.locale);
  if (!input.ok) {
    return jsonError(400, input.message);
  }
  const t = menuMessages(locals.locale);
  const result = await addMenuItem(api.db, api.restaurant.id, input.value);
  switch (result.status) {
    case "duplicate":
      return jsonError(409, t.duplicate(input.value.name));
    case "too-many":
      return jsonError(409, t.tooMany(MAX_MENU_ITEMS));
    case "added":
      return jsonResponse(await getMenuCatalog(api.db, api.restaurant.id), 201);
  }
};
