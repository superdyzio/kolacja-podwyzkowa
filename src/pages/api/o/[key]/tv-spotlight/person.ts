import type { APIRoute } from "astro";
import { jsonError, jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { drawPersonOnTv, tvSpotlightMessages } from "@/lib/tv-spotlight";
import type { TvSpotlightAnswerDto } from "@/types";

export const prerender = false;

// POST: the server draws one present guest and puts their name on the TV (tv-spotlight), never the person shown right
// now unless they are the only one. 409 when nobody is present. The TV spins through its seated names, then reveals.

export const POST: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const result = await drawPersonOnTv(api.db, api.access.event.id);
  if (result.status === "nobody") {
    return jsonError(409, tvSpotlightMessages(locals.locale).noPresentGuests);
  }
  const answer: TvSpotlightAnswerDto = { spotlight: result.spotlight };
  return jsonResponse(answer);
};
