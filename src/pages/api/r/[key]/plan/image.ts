import type { APIRoute } from "astro";
import { restaurantApi } from "@/lib/restaurant-api";
import { planImageResponse } from "@/lib/venue/image-response";

export const prerender = false;

// GET: the plan image for the restaurant's drawing (restaurant-orders), loaded hidden only for its aspect ratio, like
// on the TV. The restaurant key opens only this image and its order view.
export const GET: APIRoute = async ({ locals }) => {
  const api = restaurantApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return planImageResponse(api.db, locals.locale);
};
