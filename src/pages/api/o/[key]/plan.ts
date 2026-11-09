import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readBodyBytes } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { MAX_PLAN_BYTES, getVenue, savePlanImage, venueMessages } from "@/lib/venue";

export const prerender = false;

// PUT <image bytes>: upload or replace the venue plan (FR-005). The body is the file itself (any Content-Type);
// the server reads at most 4 MB and decides the type from the magic bytes. Tables and their pins stay as they are.
export const PUT: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }

  const messages = venueMessages(locals.locale);
  const body = await readBodyBytes(request, MAX_PLAN_BYTES);
  switch (body.status) {
    case "empty":
      return jsonError(400, messages.planEmpty);
    case "too-large":
      return jsonError(413, messages.planTooLarge);
    case "ok":
      break;
  }

  const result = await savePlanImage(api.db, api.access.event.id, body.bytes);
  switch (result.status) {
    case "too-large":
      return jsonError(413, messages.planTooLarge);
    case "unsupported-type":
      return jsonError(415, messages.planUnsupported);
    case "saved":
      return jsonResponse(await getVenue(api.db, api.access.event.id));
  }
};
