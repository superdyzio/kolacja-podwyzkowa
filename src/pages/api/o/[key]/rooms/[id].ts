import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  ROOM_DUPLICATE_MESSAGE,
  ROOM_NOT_FOUND_MESSAGE,
  deleteRoom,
  describeRoomNameProblem,
  getVenue,
  renameRoom,
} from "@/lib/venue";

export const prerender = false;

// PATCH { name }: rename a room. DELETE: remove the room together with its tables. Both answer with the whole venue.

const RenameRoomBody = z.strictObject({ name: z.string().max(1_000) });

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, RenameRoomBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await renameRoom(api.db, id, body.data.name);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeRoomNameProblem(result.reason));
    case "duplicate":
      return jsonError(409, ROOM_DUPLICATE_MESSAGE);
    case "not-found":
      return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
    case "renamed":
      return jsonResponse(await getVenue(api.db));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
  }

  const result = await deleteRoom(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
  }
  return jsonResponse(await getVenue(api.db));
};
