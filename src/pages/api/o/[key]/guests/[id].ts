import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { deleteGuest, describeDisplayNameProblem, getGuestList, updateGuest } from "@/lib/guests";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// PATCH { displayName?, isAbsent? }: rename and/or mark absent/present. DELETE: remove the guest (a pair they were in
// is dissolved). Both answer with the whole refreshed list. Group membership cannot be changed here.

const NOT_FOUND = "Nie znaleziono gościa.";

const UpdateGuestBody = z
  .strictObject({ displayName: z.string().max(1_000).optional(), isAbsent: z.boolean().optional() })
  .refine((body) => body.displayName !== undefined || body.isAbsent !== undefined);

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, NOT_FOUND);
  }
  const body = await readJsonBody(request, UpdateGuestBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await updateGuest(api.db, id, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeDisplayNameProblem(result.reason));
    case "duplicate":
      return jsonError(409, "Gość o tej nazwie już jest na liście.");
    case "not-found":
      return jsonError(404, NOT_FOUND);
    case "updated":
      return jsonResponse(await getGuestList(api.db));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, NOT_FOUND);
  }

  const result = await deleteGuest(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, NOT_FOUND);
  }
  return jsonResponse(await getGuestList(api.db));
};
