import type { APIRoute } from "astro";
import { logoOfEventResponse } from "@/lib/branding";
import { restaurantApi } from "@/lib/restaurant-api";

export const prerender = false;

// GET ?kind=event|restaurant: the logo of the tablet's event or of its restaurant (event-branding, S-18).
export const GET: APIRoute = async ({ locals, request }) => {
  const api = restaurantApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return logoOfEventResponse(api.db, api.access.event.id, request, locals.locale);
};
