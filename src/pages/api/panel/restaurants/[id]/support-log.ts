import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { panelRestaurantApi } from "@/lib/panel-api";
import { getSupportLog, SUPPORT_LOG_ROLES } from "@/lib/support";

export const prerender = false;

// The restaurant's „Dziennik wejść administratora” (admin-support-log, S-13; US-05 AC), owners only: GET → the newest
// entries of the platform administrator's support access (enter with the reason, every access, exit), newest first.
// A manager, a waiter, another restaurant's staff, unknown or malformed ids → the guard's identical 404. Nothing
// changes or deletes an entry: no other method exists here, and the database refuses it anyway. The administrator in
// support mode reads it like the owner (and that read is logged too).

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, SUPPORT_LOG_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getSupportLog(api.db, api.restaurant.id));
};
