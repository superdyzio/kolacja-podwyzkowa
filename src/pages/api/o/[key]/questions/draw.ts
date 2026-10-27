import type { APIRoute } from "astro";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { drawQuestion } from "@/lib/questions";
import { DrawQuestionBody } from "@/lib/questions/api";
import type { QuestionDrawDto } from "@/types";

export const prerender = false;

// POST { category, recent? }: the organizer draws a question for themself (FR-015), like a guest does. The answer is
// the one drawn question (or null for an empty category); nothing is stored, nobody else sees it.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
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
