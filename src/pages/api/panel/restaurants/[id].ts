import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { panelRestaurantApi } from "@/lib/panel-api";

export const prerender = false;

// A restaurant of the logged-in person (staff-accounts, F-03): its name and the person's role. Any member; another
// restaurant, an unknown or malformed id get the same 404 as a wrong link key. S-10/S-11 build the real panel on it.
// `support` is set when the platform administrator reads it in support mode (admin-support-log, S-13), else null.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse({ restaurant: api.restaurant, role: api.role, support: api.support });
};
