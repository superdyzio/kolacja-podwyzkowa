import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { getRestaurantView } from "@/lib/orders";
import { restaurantApi } from "@/lib/restaurant-api";

export const prerender = false;

// GET ?since=<version>: the restaurant's view of the food order (restaurant-orders) — the prep list, where each line is
// served by the PUBLISHED seating and the published drawing; never prices, ids, keys or absences. When `since` equals
// the current version the answer is 204 with no body; otherwise 200 with the whole RestaurantViewDto. The version is a
// fingerprint of the view, so the server reads everything either way (one or two devices, every 15 s).

const MAX_VERSION_LENGTH = 64;

export const GET: APIRoute = async ({ locals, url }) => {
  const api = restaurantApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const view = await getRestaurantView(api.db);
  const since = url.searchParams.get("since");
  if (since !== null && since.length <= MAX_VERSION_LENGTH && since === view.version) {
    return new Response(null, { status: 204 });
  }
  return jsonResponse(view);
};
