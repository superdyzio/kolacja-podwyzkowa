import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getSeatingBoard } from "@/lib/seating";

export const prerender = false;

// GET: the whole seating board — guests, venue, the working arrangement with pins, the latest publication and
// whether the TV is up to date (FR-004, FR-007).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getSeatingBoard(api.db));
};
