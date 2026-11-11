import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { getEventMenu, SetEventMenuBody, setEventMenu } from "@/lib/menu";
import { denied, panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// „Menu wydarzenia” (menu-catalog-courses, S-16; FR-037): what the client may order at this event. Owners and managers
// whoever leads the event; support mode reads it (logged), its PUT is refused by the guard; anyone else and an unknown
// event get the identical 404. GET → EventMenuDto. PUT { mode: "off" | "full" | "reduced", itemIds? } (itemIds = the
// reduced menu's items; ignored for the other modes) → EventMenuDto; an item of another restaurant or an unknown one
// → the same 404, nothing changed.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const menu = await getEventMenu(api.db, api.event.restaurantId, api.event.id);
  return menu ? jsonResponse(menu) : denied(locals);
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SetEventMenuBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await setEventMenu(api.db, api.event.id, body.data.mode, body.data.itemIds ?? []);
  const menu = result.status === "updated" ? await getEventMenu(api.db, api.event.restaurantId, api.event.id) : null;
  return menu ? jsonResponse(menu) : denied(locals);
};
