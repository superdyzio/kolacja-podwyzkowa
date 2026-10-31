import type { APIRoute } from "astro";
import { organizerApi } from "@/lib/organizer-api";
import { planImageResponse } from "@/lib/venue/image-response";

export const prerender = false;

// GET: the plan image for the organizer view (the TV has its own route under /api/tv/<key>/plan/image).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return planImageResponse(api.db);
};
