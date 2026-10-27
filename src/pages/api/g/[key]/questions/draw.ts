import type { APIRoute } from "astro";
import { guestApi } from "@/lib/guest-api";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { drawQuestion } from "@/lib/questions";
import { DrawQuestionBody } from "@/lib/questions/api";
import type { QuestionDrawDto } from "@/types";

export const prerender = false;

// POST { category, recent? }: the guest draws a question (S-07, US-03, FR-015) — the guest's ONLY question endpoint:
// one drawn question (or null for an empty category), never the list. Nothing is stored, so the question is visible
// only on the phone that drew it; recent (ids this phone drew lately) only steers the pick away from repeats. The
// caller is identified by the key alone (guestApi); the body names nobody and any extra field is refused.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, DrawQuestionBody);
  if (!body.ok) {
    return body.response;
  }
  const answer: QuestionDrawDto = {
    question: await drawQuestion(api.db, { category: body.data.category, recent: body.data.recent ?? [] }),
  };
  return jsonResponse(answer);
};
