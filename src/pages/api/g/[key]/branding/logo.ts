import type { APIRoute } from "astro";
import { logoOfEventResponse } from "@/lib/branding";
import { guestApi } from "@/lib/guest-api";

export const prerender = false;

// GET ?kind=event|restaurant: the logo of the guest's event or of its restaurant (event-branding, S-18) — the key
// decides the event, so no other tenant's logo is reachable.
export const GET: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return logoOfEventResponse(api.db, api.access.event.id, request, locals.locale);
};
