import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  ROOM_NOT_FOUND_MESSAGE,
  TABLES_LIMIT_MESSAGE,
  TABLE_DUPLICATE_MESSAGE,
  TABLE_SHAPES,
  addTable,
  describeTableFieldProblem,
  getVenue,
} from "@/lib/venue";

export const prerender = false;

// POST { roomId, name, seatCount, shape, x, y, rotation? }: add a table in a room with its pin on the plan (FR-006).
// x, y are fractions 0–1 of the plan image; rotation in whole degrees, normalized to 0..359. Answers with the whole venue.

const AddTableBody = z.strictObject({
  roomId: z.number().int().positive(),
  name: z.string().max(1_000),
  seatCount: z.number().int(),
  shape: z.enum(TABLE_SHAPES),
  x: z.number(),
  y: z.number(),
  rotation: z.number().int().min(-36_000).max(36_000).optional(),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddTableBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const result = await addTable(api.db, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeTableFieldProblem(result.problem));
    case "duplicate":
      return jsonError(409, TABLE_DUPLICATE_MESSAGE);
    case "room-not-found":
      return jsonError(404, ROOM_NOT_FOUND_MESSAGE);
    case "too-many":
      return jsonError(400, TABLES_LIMIT_MESSAGE);
    case "added":
      return jsonResponse(await getVenue(api.db), 201);
  }
};
