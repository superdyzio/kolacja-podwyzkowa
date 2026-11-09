import type { APIRoute } from "astro";
import { getGuestLinks, guestLinksMessages, revokeGuestKey } from "@/lib/guest-links";
import { jsonError, jsonResponse, parseId } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// POST: revoke the guest's personal link by issuing a new one (FR-012); the old link stops working at once (its card
// must be reprinted). Answers with the whole GuestLinksDto.

export const POST: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const notFound = guestLinksMessages(locals.locale).guestNotFound;
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, notFound);
  }
  const result = await revokeGuestKey(api.db, api.access.event.id, id);
  if (result.status === "not-found") {
    return jsonError(404, notFound);
  }
  return jsonResponse(await getGuestLinks(api.db, api.access.event.id));
};
