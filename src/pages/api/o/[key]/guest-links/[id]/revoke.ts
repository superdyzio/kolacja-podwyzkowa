import type { APIRoute } from "astro";
import { getGuestLinks, revokeGuestKey } from "@/lib/guest-links";
import { jsonError, jsonResponse, parseId } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// POST: revoke the guest's personal link by issuing a new one (FR-012); the old link stops working at once (its card
// must be reprinted). Answers with the whole GuestLinksDto.

const NOT_FOUND = "Nie znaleziono gościa.";

export const POST: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, NOT_FOUND);
  }
  const result = await revokeGuestKey(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, NOT_FOUND);
  }
  return jsonResponse(await getGuestLinks(api.db));
};
