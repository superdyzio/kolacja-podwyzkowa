import type { APIRoute } from "astro";
import { restaurantPath } from "@/lib/access";
import { jsonResponse } from "@/lib/http";
import { rotateRestaurantKey } from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// POST: „Wymień link” (restaurant-orders) — a fresh restaurant key; the old link opens nothing from now on. Answers
// { path: "/r/<new key>" }; the page builds the full address from its own origin. Organizer only.
export const POST: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse({ path: restaurantPath(await rotateRestaurantKey(api.db)) });
};
