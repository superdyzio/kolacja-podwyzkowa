import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { CHAIR_PITCH_MESSAGE, NO_PLAN_MESSAGE, getVenue, setChairPitch } from "@/lib/venue";

export const prerender = false;

// GET: the whole venue — plan metadata (never the image), rooms and tables with their pins (FR-005, FR-006), room
// outlines, table rotations and the chair pitch (venue-drawing).
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getVenue(api.db));
};

// PATCH { chairPitch }: the venue-wide chair pitch (fraction of the plan width); needs a plan. Answers with the venue.
const UpdateVenueBody = z.strictObject({ chairPitch: z.number() });

export const PATCH: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, UpdateVenueBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await setChairPitch(api.db, body.data.chairPitch);
  switch (result.status) {
    case "invalid":
      return jsonError(400, CHAIR_PITCH_MESSAGE);
    case "no-plan":
      return jsonError(409, NO_PLAN_MESSAGE);
    case "updated":
      return jsonResponse(await getVenue(api.db));
  }
};
