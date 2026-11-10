import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  deleteQuizQuestion,
  getQuizBoard,
  QUIZ_CODES,
  QuizQuestionPatchBody,
  quizMessages,
  quizProblemText,
  updateQuizQuestion,
} from "@/lib/quiz";
import type { DbClient } from "@/lib/supabase-client";
import type { Locale } from "@/lib/i18n/locale";

export const prerender = false;

// One question of the pub quiz (pub-quiz, S-28). PATCH { text?, options?, correct? } (strict, at least one): only a
// question never asked (409 `quiz-question-locked`); the merged question is checked by the rule (400). DELETE: the
// question with its answers, never the one on the TV (409 `quiz-question-on-tv`). A malformed, unknown or another
// event's id → 404 „Nie ma takiego pytania.”. Every answer is the whole board.

async function boardAnswer(db: DbClient, eventId: number, locale: Locale): Promise<Response> {
  const board = await getQuizBoard(db, eventId);
  return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locale).title);
}

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const t = quizMessages(locals.locale);
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, t.notFound);
  }
  const body = await readJsonBody(request, QuizQuestionPatchBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await updateQuizQuestion(api.db, api.access.event.id, id, body.data);
  switch (result.status) {
    case "not-found":
      return jsonError(404, t.notFound);
    case "locked":
      return jsonError(409, t.locked, { code: QUIZ_CODES.locked });
    case "invalid":
      return jsonError(400, quizProblemText(result.problem, locals.locale));
    case "updated":
      return boardAnswer(api.db, api.access.event.id, locals.locale);
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const t = quizMessages(locals.locale);
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, t.notFound);
  }
  const result = await deleteQuizQuestion(api.db, api.access.event.id, id);
  switch (result.status) {
    case "not-found":
      return jsonError(404, t.notFound);
    case "on-tv":
      return jsonError(409, t.onTv, { code: QUIZ_CODES.onTv });
    case "deleted":
      return boardAnswer(api.db, api.access.event.id, locals.locale);
  }
};
