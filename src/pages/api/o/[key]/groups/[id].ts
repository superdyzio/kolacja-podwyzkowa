import type { APIRoute } from "astro";
import { dissolveGroup, getGuestList, guestsMessages } from "@/lib/guests";
import { jsonError, jsonResponse, parseId } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// DELETE: dissolve a group; its members stay on the list without a group (FR-002).

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const notFound = guestsMessages(locals.locale).groupNotFound;
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, notFound);
  }

  const result = await dissolveGroup(api.db, api.access.event.id, id);
  if (result.status === "not-found") {
    return jsonError(404, notFound);
  }
  return jsonResponse(await getGuestList(api.db, api.access.event.id));
};
