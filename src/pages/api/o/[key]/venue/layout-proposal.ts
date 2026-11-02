import type { APIRoute } from "astro";
import { getVenueVisionProvider } from "@/lib/ai";
import { jsonError, jsonResponse, readBodyBytes } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  LAYOUT_BAD_OUTPUT_HINT,
  LAYOUT_FAILED_MESSAGE,
  LAYOUT_IMAGE_TOO_LARGE_MESSAGE,
  MAX_LAYOUT_IMAGE_BYTES,
  describeLayoutFailure,
  proposeVenueLayout,
} from "@/lib/venue-ai";
import { NO_PLAN_MESSAGE, PLAN_EMPTY_MESSAGE, PLAN_UNSUPPORTED_MESSAGE, sniffImageType } from "@/lib/venue";
import type { VenueLayoutProposalAnswerDto } from "@/types";

export const prerender = false;

// POST <image bytes>: AI reads the plan image (the browser sends it downscaled, ≤ 1.5 MB) and proposes the drawing:
// tables moved and turned, new tables, room outlines, the chair scale (venue-drawing). Nothing is saved; the organizer
// applies what they keep through POST /venue/layout. Organizer only; the venue's names and positions go to the AI
// provider, never anything about guests.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }

  const body = await readBodyBytes(request, MAX_LAYOUT_IMAGE_BYTES);
  switch (body.status) {
    case "empty":
      return jsonError(400, PLAN_EMPTY_MESSAGE);
    case "too-large":
      return jsonError(413, LAYOUT_IMAGE_TOO_LARGE_MESSAGE);
    case "ok":
      break;
  }

  // Not an image → 415 whatever the provider (the same order as PUT /plan).
  if (sniffImageType(body.bytes) === null) {
    return jsonError(415, PLAN_UNSUPPORTED_MESSAGE);
  }

  const provider = getVenueVisionProvider();
  if (!provider.ready) {
    return jsonError(503, LAYOUT_FAILED_MESSAGE, { hint: describeLayoutFailure("not-configured"), costNanoUsd: 0 });
  }

  const result = await proposeVenueLayout(api.db, provider, body.bytes);
  switch (result.status) {
    case "unsupported-type":
      return jsonError(415, PLAN_UNSUPPORTED_MESSAGE);
    case "no-plan":
      return jsonError(409, NO_PLAN_MESSAGE);
    case "failed":
      return jsonError(503, LAYOUT_FAILED_MESSAGE, {
        hint: describeLayoutFailure(result.kind, result.httpStatus),
        costNanoUsd: result.costNanoUsd,
      });
    case "bad-output":
      return jsonError(503, LAYOUT_FAILED_MESSAGE, { hint: LAYOUT_BAD_OUTPUT_HINT, costNanoUsd: result.costNanoUsd });
    case "proposed": {
      const answer: VenueLayoutProposalAnswerDto = { proposal: result.proposal, costNanoUsd: result.costNanoUsd };
      return jsonResponse(answer);
    }
  }
};
