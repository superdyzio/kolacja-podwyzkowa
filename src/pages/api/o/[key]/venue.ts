import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getVenue } from "@/lib/venue";

export const prerender = false;

// GET: the whole venue — plan metadata (never the image), rooms and tables with their pins (FR-005, FR-006).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getVenue(api.db));
};
