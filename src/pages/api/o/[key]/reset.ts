import { noAccessMessages } from "@/lib/access/messages";
import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getResetPreview, resetEvent, ResetRequestBody } from "@/lib/reset";

export const prerender = false;

// The organizer's „Reset danych”. GET: fresh counts of what each part would remove (ResetPreviewDto) for the modal.
// POST { parts }: resets the chosen parts (implied ones added) in one DB transaction → 200 ResetResultDto with the
// summary in the request's language. Organizer only: the TV and guest keys get the guard's 404. The organizer and TV
// keys never change.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const preview = await getResetPreview(api.db);
  return preview ? jsonResponse(preview) : jsonError(404, noAccessMessages(locals.locale).title);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, ResetRequestBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const outcome = await resetEvent(api.db, body.data.parts, locals.locale);
  return outcome.status === "reset"
    ? jsonResponse(outcome.result)
    : jsonError(404, noAccessMessages(locals.locale).title);
};
