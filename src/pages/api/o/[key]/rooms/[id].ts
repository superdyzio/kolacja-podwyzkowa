import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  OUTLINE_MESSAGE,
  ROOM_DUPLICATE_MESSAGE,
  ROOM_NOT_FOUND_MESSAGE,
  deleteRoom,
  describeRoomNameProblem,
  getVenue,
  updateRoom,
} from "@/lib/venue";

export const prerender = false;

// PATCH { name?, outline?: { x, y, width, height } | null }: rename a room and/or set its outline on the drawing
// (null clears it). DELETE: remove the room together with its tables. Both answer with the whole venue.

const UpdateRoomBody = z
  .strictObject({
    name: z.string().max(1_000).optional(),
    outline: z
      .strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .nullable()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, UpdateRoomBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await updateRoom(api.db, id, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeRoomNameProblem(result.reason));
    case "invalid-outline":
      return jsonError(400, OUTLINE_MESSAGE);
    case "duplicate":
      return jsonError(409, ROOM_DUPLICATE_MESSAGE);
    case "not-found":
      return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
    case "updated":
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
