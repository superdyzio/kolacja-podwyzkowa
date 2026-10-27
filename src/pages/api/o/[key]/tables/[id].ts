import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  ROOM_NOT_FOUND_MESSAGE,
  TABLE_DUPLICATE_MESSAGE,
  TABLE_NOT_FOUND_MESSAGE,
  TABLE_SHAPES,
  deleteTable,
  describeTableFieldProblem,
  getVenue,
  updateTable,
} from "@/lib/venue";

export const prerender = false;

// PATCH { roomId?, name?, seatCount?, shape?, x?, y? }: edit a table (the pin needs x and y together).
// DELETE: remove the table. Both answer with the whole venue.

const UpdateTableBody = z
  .strictObject({
    roomId: z.number().int().positive().optional(),
    name: z.string().max(1_000).optional(),
    seatCount: z.number().int().optional(),
    shape: z.enum(TABLE_SHAPES).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, TABLE_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, UpdateTableBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await updateTable(api.db, id, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeTableFieldProblem(result.problem));
    case "duplicate":
      return jsonError(409, TABLE_DUPLICATE_MESSAGE);
    case "room-not-found":
      return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
    case "not-found":
      return jsonError(404, TABLE_NOT_FOUND_MESSAGE);
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
    return jsonError(404, TABLE_NOT_FOUND_MESSAGE);
  }

  const result = await deleteTable(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, TABLE_NOT_FOUND_MESSAGE);
  }
  return jsonResponse(await getVenue(api.db));
};
