import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { ROOMS_LIMIT_MESSAGE, ROOM_DUPLICATE_MESSAGE, addRoom, describeRoomNameProblem, getVenue } from "@/lib/venue";

export const prerender = false;

// POST { name }: add a named room (FR-005). Answers with the whole venue.

const AddRoomBody = z.strictObject({ name: z.string().max(1_000) });

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddRoomBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await addRoom(api.db, body.data.name);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeRoomNameProblem(result.reason));
    case "duplicate":
      return jsonError(409, ROOM_DUPLICATE_MESSAGE);
    case "too-many":
      return jsonError(400, ROOMS_LIMIT_MESSAGE);
    case "added":
      return jsonResponse(await getVenue(api.db), 201);
  }
};
