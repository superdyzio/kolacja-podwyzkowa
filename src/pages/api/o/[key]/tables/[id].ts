import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  TABLE_SHAPES,
  deleteTable,
  describeTableFieldProblem,
  getVenue,
  updateTable,
  venueMessages,
} from "@/lib/venue";

export const prerender = false;

// PATCH { roomId?, name?, seatCount?, shape?, x?, y?, rotation? }: edit a table (the pin needs x and y together;
// rotation in whole degrees, normalized to 0..359).
// DELETE: remove the table. Both answer with the whole venue.

const UpdateTableBody = z
  .strictObject({
    roomId: z.number().int().positive().optional(),
    name: z.string().max(1_000).optional(),
    seatCount: z.number().int().optional(),
    shape: z.enum(TABLE_SHAPES).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    rotation: z.number().int().min(-36_000).max(36_000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, venueMessages(locals.locale).tableNotFound);
  }
  const body = await readJsonBody(request, UpdateTableBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const result = await updateTable(api.db, id, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeTableFieldProblem(result.problem, locals.locale));
    case "duplicate":
      return jsonError(409, venueMessages(locals.locale).tableDuplicate);
    case "room-not-found":
      return jsonError(404, venueMessages(locals.locale).roomNotFound);
    case "not-found":
      return jsonError(404, venueMessages(locals.locale).tableNotFound);
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
    return jsonError(404, venueMessages(locals.locale).tableNotFound);
  }

  const result = await deleteTable(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, venueMessages(locals.locale).tableNotFound);
  }
  return jsonResponse(await getVenue(api.db));
};
