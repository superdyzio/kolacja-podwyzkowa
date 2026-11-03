import { noAccessMessages } from "@/lib/access/messages";
import type { APIRoute } from "astro";
import { accessFor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";
import { planImageResponse } from "@/lib/venue/image-response";

export const prerender = false;

// GET: the plan image for the read-only TV view (S-03 draws the seating on it). The TV key opens only this image,
// never the organizer API. The middleware has already checked the key; this is the second, role-specific check.
export const GET: APIRoute = async ({ locals }) => {
  if (!accessFor(locals, "tv")) {
    return jsonError(404, noAccessMessages(locals.locale).title);
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  return planImageResponse(db);
};
