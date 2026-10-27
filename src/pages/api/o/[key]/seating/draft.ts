import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { DRAFT_STALE_MESSAGE, getSeatingBoard, saveDraft } from "@/lib/seating";

export const prerender = false;

// POST { seats: [{ guestId, tableId, seat }] }: save a draft drawn in the organizer's browser as the working
// arrangement (FR-009). The server re-checks the hard rules against the current data (every present non-pinned guest
// seated once, seats free and existing, groups together on consecutive seats) and replaces every non-pinned row in
// one transaction. 200 with the board; 409 with `problems` when the draft no longer fits the data (the page reloads
// the board and the organizer draws again). Nothing reaches the TV until the organizer publishes.

const DraftBody = z.strictObject({
  seats: z
    .array(
      z.strictObject({
        guestId: z.number().int().positive(),
        tableId: z.number().int().positive(),
        seat: z.number().int().positive().max(1_000),
      }),
    )
    .max(200),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, DraftBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await saveDraft(api.db, body.data.seats);
  switch (result.status) {
    case "invalid":
      return jsonError(409, DRAFT_STALE_MESSAGE, { problems: result.problems });
    case "conflict":
      return jsonError(409, DRAFT_STALE_MESSAGE);
    case "saved":
      return jsonResponse(await getSeatingBoard(api.db));
  }
};
