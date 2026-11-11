import type { APIRoute } from "astro";
import { logoOfEventResponse } from "@/lib/branding";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// GET ?kind=event|restaurant: the logo of the client's event or of its restaurant for the room prints (room-prints,
// S-24) — in the PAGE area under the key (guarded by the middleware like every /o/<key>/** path), so a print loads it
// through the relative `./logo` and its HTML never carries the key. The key decides the event: no other tenant's logo.
export const GET: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return logoOfEventResponse(api.db, api.access.event.id, request, locals.locale);
};
