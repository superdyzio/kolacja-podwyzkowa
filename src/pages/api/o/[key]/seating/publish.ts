import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getSeatingBoard, publishSeating } from "@/lib/seating";

export const prerender = false;

// POST: publish the working arrangement (present guests) as a new snapshot for the TV — 201 with the board, or 200
// when nothing changed since the last publish (no new snapshot).
export const POST: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const result = await publishSeating(api.db);
  return jsonResponse(await getSeatingBoard(api.db), result.status === "published" ? 201 : 200);
};
