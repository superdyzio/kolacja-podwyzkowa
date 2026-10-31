import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readBodyBytes } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  MAX_PLAN_BYTES,
  PLAN_EMPTY_MESSAGE,
  PLAN_TOO_LARGE_MESSAGE,
  PLAN_UNSUPPORTED_MESSAGE,
  getVenue,
  savePlanImage,
} from "@/lib/venue";

export const prerender = false;

// PUT <image bytes>: upload or replace the venue plan (FR-005). The body is the file itself (any Content-Type);
// the server reads at most 4 MB and decides the type from the magic bytes. Tables and their pins stay as they are.
export const PUT: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }

  const body = await readBodyBytes(request, MAX_PLAN_BYTES);
  switch (body.status) {
    case "empty":
      return jsonError(400, PLAN_EMPTY_MESSAGE);
    case "too-large":
      return jsonError(413, PLAN_TOO_LARGE_MESSAGE);
    case "ok":
      break;
  }

  const result = await savePlanImage(api.db, body.bytes);
  switch (result.status) {
    case "too-large":
      return jsonError(413, PLAN_TOO_LARGE_MESSAGE);
    case "unsupported-type":
      return jsonError(415, PLAN_UNSUPPORTED_MESSAGE);
    case "saved":
      return jsonResponse(await getVenue(api.db));
  }
};
