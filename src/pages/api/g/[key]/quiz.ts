import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { getGuestState } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { guestModulesOf } from "@/lib/modules/rules";
import { answerQuiz, GuestQuizAnswerBody, QUIZ_CODES, quizMessages } from "@/lib/quiz";

export const prerender = false;

// PUT { questionId, option } (strict): the guest answers the quiz question on the TV for THEMSELF (pub-quiz, S-28;
// FR-049) — the guest is the key's owner (access.guest.id); the body names nobody. Only the event's OPEN question:
// any other id (closed, not asked yet, unknown, another event's) → 409 `quiz-closed`, one answer for all; an option
// the question does not have → 400. The answer may change until the question closes. 200 answers the guest's whole
// live state (GuestStateDto, new version). The module's gate is the middleware's (off → the identical 404).

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, GuestQuizAnswerBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const { guest } = api.access;
  const t = quizMessages(locals.locale);
  const result = await answerQuiz(api.db, api.access.event.id, guest.id, body.data.questionId, body.data.option);
  switch (result.status) {
    case "closed":
      return jsonError(409, t.closed, { code: QUIZ_CODES.closed });
    case "out-of-range":
      return jsonError(400, t.optionOutOfRange);
    case "not-found":
      return jsonError(404, noAccessMessages(locals.locale).title);
    case "saved":
      return jsonResponse(
        await getGuestState(api.db, api.access.event.id, guest, guestModulesOf(api.access.event.modules)),
      );
  }
};
