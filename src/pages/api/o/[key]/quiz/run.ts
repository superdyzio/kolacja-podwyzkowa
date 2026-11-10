import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getQuizBoard, QUIZ_CODES, QuizRunBody, quizMessages, runQuizAction } from "@/lib/quiz";

export const prerender = false;

// POST { action: "start" | "close" | "results" | "end" } or { action: "ask", questionId } (strict): one step of the
// pub quiz on the TV (pub-quiz, S-28). start = the intro; ask = a question never asked goes on the TV and the phones
// (409 `quiz-question-asked` for an asked one, 404 for an unknown or another event's); close = the open question
// closes and the TV reveals the correct option (409 `quiz-no-open-question`); results = the standings computed and
// places 1–3 by name on the TV; end = the quiz leaves the TV (an open question closes first). start / ask / results
// while a question is open → 409 `quiz-question-open`. 200 with the whole board.

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, QuizRunBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const t = quizMessages(locals.locale);
  const result = await runQuizAction(api.db, api.access.event.id, body.data);
  switch (result.status) {
    case "not-found":
      return jsonError(404, t.notFound);
    case "question-open":
      return jsonError(409, t.questionOpen, { code: QUIZ_CODES.questionOpen });
    case "question-asked":
      return jsonError(409, t.questionAsked, { code: QUIZ_CODES.questionAsked });
    case "no-open-question":
      return jsonError(409, t.noOpenQuestion, { code: QUIZ_CODES.noOpenQuestion });
    case "done": {
      const board = await getQuizBoard(api.db, api.access.event.id);
      return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locals.locale).title);
    }
  }
};
