import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { applyVenueLayout, describeTableFieldProblem, getVenue, tablesLimitMessage, venueMessages } from "@/lib/venue";

export const prerender = false;

// POST: applies the lines of a layout proposal the organizer kept (venue-drawing) in one transaction: existing tables
// move and turn (their seats and pins stay), new tables are added, room outlines and the chair scale are set. Nothing
// is deleted; any problem (a table or room gone meanwhile, a duplicate name, the table limit) writes nothing.
// Answers with the venue. Organizer only.
const Outline = z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

const ApplyLayoutBody = z.strictObject({
  tables: z
    .array(z.strictObject({ id: z.number().int(), x: z.number(), y: z.number(), rotation: z.number() }))
    .max(100),
  newTables: z
    .array(
      z.strictObject({
        roomId: z.number().int(),
        name: z.string(),
        seatCount: z.number().int(),
        shape: z.enum(["round", "rectangular"]),
        x: z.number(),
        y: z.number(),
        rotation: z.number(),
      }),
    )
    .max(100),
  rooms: z.array(z.strictObject({ id: z.number().int(), outline: Outline.nullable() })).max(20),
  chairPitch: z.number().nullable(),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, ApplyLayoutBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const messages = venueMessages(locals.locale);
  const result = await applyVenueLayout(api.db, body.data);
  switch (result.status) {
    case "applied":
      return jsonResponse(await getVenue(api.db));
    case "invalid":
      return jsonError(
        400,
        result.problem === "outline"
          ? messages.outline
          : result.problem === "chairPitch"
            ? messages.chairPitch
            : describeTableFieldProblem(result.problem, locals.locale),
      );
    case "table-not-found":
      return jsonError(409, messages.tableNotFound);
    case "room-not-found":
      return jsonError(409, messages.roomNotFound);
    case "duplicate":
      return jsonError(409, messages.tableDuplicate);
    case "too-many":
      return jsonError(409, tablesLimitMessage(locals.locale));
    case "no-plan":
      return jsonError(409, messages.noPlan);
  }
};
