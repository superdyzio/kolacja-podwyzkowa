import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getNeighbourHistory } from "@/lib/seating";

export const prerender = false;

// GET: the neighbour history (S-04) — how many arrangements were published and every pair of guest ids that sat
// next to each other in any of them. Input of the draw computed in the organizer's browser, and of the repeat stats.
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getNeighbourHistory(api.db));
};
