import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { getGuestLinks, setGuestAccess } from "@/lib/guest-links";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// GET: the guest-access switch and every guest's personal link (S-05, FR-011). PATCH { enabled }: turn guest access
// on or off (FR-012). Both answer with the whole GuestLinksDto. Organizer only: the keys never reach the TV or guests.

const SetAccessBody = z.strictObject({ enabled: z.boolean() });

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getGuestLinks(api.db));
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SetAccessBody);
  if (!body.ok) {
    return body.response;
  }
  return jsonResponse(await setGuestAccess(api.db, body.data.enabled));
};
