import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getResetPreview, resetEvent, TrialResetRequestBody } from "@/lib/reset";

export const prerender = false;

// „Reset prób” of the client link (client-restaurant-split, FR-028): between rehearsals the client clears the seating
// (pins and every published snapshot included) and the guesses; guests, the venue, orders, questions and links stay.
// GET: fresh counts (ResetPreviewDto, the same as the full reset's); POST { parts } (trial parts only, strict) → 200
// ResetResultDto. While the venue leads, the middleware answers the POST with 409. The full reset is the panel's.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const preview = await getResetPreview(api.db, api.access.event.id);
  return preview ? jsonResponse(preview) : jsonError(404, noAccessMessages(locals.locale).title);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, TrialResetRequestBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const outcome = await resetEvent(api.db, api.access.event.id, body.data.parts, locals.locale);
  return outcome.status === "reset"
    ? jsonResponse(outcome.result)
    : jsonError(404, noAccessMessages(locals.locale).title);
};
