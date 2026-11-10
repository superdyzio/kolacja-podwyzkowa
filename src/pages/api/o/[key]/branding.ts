import type { APIRoute } from "astro";
import {
  brandingMessages,
  EventBrandingPatchBody,
  getEventBranding,
  parseBrandName,
  setEventBrandName,
} from "@/lib/branding";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The event's brand (event-branding, S-18, FR-032): GET → BrandingDto (the restaurant's brand read-only, the
// client's name and logo); PATCH { name: string | null } sets the client's company or event name (empty or null =
// none). The client edits while it leads; while „Lokal prowadzi” is on the middleware answers 409 venue-leads and the
// staff edit through the panel dispatcher (/api/panel/events/<id>/klient/branding).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getEventBranding(api.db, api.access.event.id));
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, EventBrandingPatchBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const name = parseBrandName(body.data.name);
  if (!name.ok) {
    return jsonError(400, brandingMessages(locals.locale).brandNameTooLong);
  }
  await setEventBrandName(api.db, api.access.event.id, name.name);
  return jsonResponse(await getEventBranding(api.db, api.access.event.id));
};
