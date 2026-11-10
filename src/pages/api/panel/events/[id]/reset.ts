import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelEventApi } from "@/lib/panel-api";
import { getResetPreview, resetEvent, ResetRequestBody } from "@/lib/reset";

export const prerender = false;

// The full „Reset danych” of an event, in the venue's panel (client-restaurant-split, FR-028; the client link keeps
// only „Reset prób”). GET: fresh counts of what each part would remove (ResetPreviewDto); POST { parts }: resets the
// chosen parts (implied ones added) in one DB transaction → 200 ResetResultDto with the summary in the request's
// language. Owners and managers, whoever leads the event; support mode reads the counts, its POST is refused by the
// guard. Anyone else and an unknown event get the identical 404. The event's links never change.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const preview = await getResetPreview(api.db, api.event.id);
  return preview ? jsonResponse(preview) : denied(locals);
};

export const POST: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, ResetRequestBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const outcome = await resetEvent(api.db, api.event.id, body.data.parts, locals.locale);
  return outcome.status === "reset" ? jsonResponse(outcome.result) : denied(locals);
};
