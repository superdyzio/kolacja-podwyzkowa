import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  addQuizQuestion,
  getQuizBoard,
  MAX_QUIZ_QUESTIONS,
  parseQuizQuestion,
  QUIZ_CODES,
  QuizQuestionBody,
  quizMessages,
  quizProblemText,
} from "@/lib/quiz";

export const prerender = false;

// POST { text, options: string[], correct } (strict): a new question at the end of the quiz (pub-quiz, S-28). The
// rule normalizes the texts and checks 2–4 distinct options and the correct index (400 with its message); at most
// MAX_QUIZ_QUESTIONS (409 `quiz-full`). 201 with the whole board.

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, QuizQuestionBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const checked = parseQuizQuestion(body.data);
  if (!checked.ok) {
    return jsonError(400, quizProblemText(checked.problem, locals.locale));
  }
  const result = await addQuizQuestion(api.db, api.access.event.id, checked.value);
  if (result.status === "full") {
    return jsonError(409, quizMessages(locals.locale).full(MAX_QUIZ_QUESTIONS), { code: QUIZ_CODES.full });
  }
  const board = await getQuizBoard(api.db, api.access.event.id);
  return board ? jsonResponse(board, 201) : jsonError(404, noAccessMessages(locals.locale).title);
};
