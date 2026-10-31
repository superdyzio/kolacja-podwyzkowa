import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getPublishedSeating } from "@/lib/seating";
import type { PublishedSeatingResponseDto } from "@/types";

export const prerender = false;

// GET: the latest PUBLISHED arrangement for the organizer's offline readout (S-09, NFR-004) — tables with their room
// and the names on seats, no ids; `published` is null before the first publish. Organizer only (TV and guest keys get
// the middleware's 404).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body: PublishedSeatingResponseDto = { published: await getPublishedSeating(api.db) };
  return jsonResponse(body);
};
