import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createGroup, getGuestList, MAX_GROUP_SIZE, MIN_GROUP_SIZE } from "@/lib/guests";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// POST { guestIds }: create an inseparable group of 2–5 guests who are not in a group yet (FR-002).

const CreateGroupBody = z.strictObject({ guestIds: z.array(z.number().int().positive()).max(20) });

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, CreateGroupBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await createGroup(api.db, body.data.guestIds);
  switch (result.status) {
    case "invalid-size":
      return jsonError(400, `Grupa musi mieć od ${MIN_GROUP_SIZE} do ${MAX_GROUP_SIZE} osób.`);
    case "not-found":
      return jsonError(404, "Nie znaleziono gościa.");
    case "already-grouped":
      return jsonError(409, "Ktoś z zaznaczonych jest już w grupie.");
    case "created":
      return jsonResponse(await getGuestList(api.db), 201);
  }
};
