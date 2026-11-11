import type { APIRoute } from "astro";
import { deleteEventLogo, getEventBranding, logoOfEventResponse, saveEventLogo, uploadLogo } from "@/lib/branding";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// GET ?kind=event|restaurant: this event's logo or its restaurant's (image, nosniff). PUT <image bytes>: the client's
// logo (PNG, JPEG, WebP by magic bytes, ≤ 512 KiB; 400 empty, 413, 415) → BrandingDto. DELETE: removes it → BrandingDto.
export const GET: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return logoOfEventResponse(api.db, api.access.event.id, request, locals.locale);
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const failed = await uploadLogo(request, locals.locale, (bytes) => saveEventLogo(api.db, api.access.event.id, bytes));
  return failed ?? jsonResponse(await getEventBranding(api.db, api.access.event.id));
};

export const DELETE: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  await deleteEventLogo(api.db, api.access.event.id);
  return jsonResponse(await getEventBranding(api.db, api.access.event.id));
};
