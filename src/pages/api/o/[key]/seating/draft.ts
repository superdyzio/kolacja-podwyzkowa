import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { MAX_GUESTS } from "@/lib/guests";
import { getSeatingBoard, saveDraft, seatingMessages } from "@/lib/seating";

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
    // One row per present non-pinned guest at most (scale-150: MAX_GUESTS = 150).
    .max(MAX_GUESTS),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, DraftBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const { draftStale } = seatingMessages(locals.locale);
  const result = await saveDraft(api.db, api.access.event.id, body.data.seats, locals.locale);
  switch (result.status) {
    case "invalid":
      return jsonError(409, draftStale, { problems: result.problems });
    case "conflict":
      return jsonError(409, draftStale);
    case "saved":
      return jsonResponse(await getSeatingBoard(api.db, api.access.event.id));
  }
};
