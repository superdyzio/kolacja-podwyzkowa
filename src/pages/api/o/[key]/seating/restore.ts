import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { SEATING_CHANGED_MESSAGE, SNAPSHOT_NOT_FOUND_MESSAGE, getSeatingBoard, restoreSnapshot } from "@/lib/seating";

export const prerender = false;

// POST { snapshotId }: put a published arrangement back into the working arrangement (FR-010: discard a draft →
// the latest snapshot; "back to the previous arrangement" → the one before). Rows of deleted guests/tables and seats
// above today's seat counts are skipped, pinned rows kept. 200 with the board plus a Polish `notice` (who is left
// without a seat); the organizer publishes it afterwards. 404 for an unknown snapshot.

const RestoreBody = z.strictObject({ snapshotId: z.number().int().positive() });

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, RestoreBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await restoreSnapshot(api.db, body.data.snapshotId);
  switch (result.status) {
    case "not-found":
      return jsonError(404, SNAPSHOT_NOT_FOUND_MESSAGE);
    case "conflict":
      return jsonError(409, SEATING_CHANGED_MESSAGE);
    case "restored":
      return jsonResponse({ ...(await getSeatingBoard(api.db)), notice: result.notice });
  }
};
