import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getTvSpotlight, hideTvSpotlight, INVALID_SPOTLIGHT_MESSAGE, showOnTv, ShowOnTvBody } from "@/lib/tv-spotlight";
import type { TvSpotlightAnswerDto } from "@/types";

export const prerender = false;

// The organizer's TV controls (tv-spotlight). GET: what is on the TV over the seating. PUT { kind: "question" |
// "topic", text }: show a drawn question or an AI topic to the whole room (400 for an empty or too long text).
// DELETE: back to the plan. Every answer is { spotlight }. The TV reads it only through its seating poll; guests never.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const answer: TvSpotlightAnswerDto = { spotlight: await getTvSpotlight(api.db) };
  return jsonResponse(answer);
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, ShowOnTvBody);
  if (!body.ok) {
    return body.response;
  }
  const result = await showOnTv(api.db, body.data.kind, body.data.text);
  if (result.status === "invalid") {
    return jsonError(400, INVALID_SPOTLIGHT_MESSAGE);
  }
  const answer: TvSpotlightAnswerDto = { spotlight: result.spotlight };
  return jsonResponse(answer);
};

export const DELETE: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  await hideTvSpotlight(api.db);
  const answer: TvSpotlightAnswerDto = { spotlight: null };
  return jsonResponse(answer);
};
