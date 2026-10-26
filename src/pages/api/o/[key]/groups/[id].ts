import type { APIRoute } from "astro";
import { dissolveGroup, getGuestList } from "@/lib/guests";
import { jsonError, jsonResponse, parseId } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// DELETE: dissolve a group; its members stay on the list without a group (FR-002).

const NOT_FOUND = "Nie znaleziono grupy.";

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, NOT_FOUND);
  }

  const result = await dissolveGroup(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, NOT_FOUND);
  }
  return jsonResponse(await getGuestList(api.db));
};
