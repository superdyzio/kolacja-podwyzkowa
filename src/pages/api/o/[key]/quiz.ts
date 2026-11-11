import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getQuizBoard } from "@/lib/quiz";

export const prerender = false;

// GET: the client's whole pub quiz (pub-quiz, S-28; FR-049) — the run, every question with its correct option and
// per-option counts, the live standings by name. Organizer only (the quiz module's gate is the middleware's: 409
// `module-off` while it is off); TV and guest keys get the identical 404.

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const board = await getQuizBoard(api.db, api.access.event.id);
  return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locals.locale).title);
};
