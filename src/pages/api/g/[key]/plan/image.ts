import type { APIRoute } from "astro";
import { guestApi } from "@/lib/guest-api";
import { planImageResponse } from "@/lib/venue/image-response";

export const prerender = false;

// GET: the plan image for the guest's "Pokaż na planie" (S-05): the phone highlights their table on it. Loaded only
// when the guest asks for it; the guest key opens only this image and their own state.
export const GET: APIRoute = async ({ locals }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return planImageResponse(api.db);
};
