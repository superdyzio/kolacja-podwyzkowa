import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  deleteQuestion,
  describeQuestionProblem,
  getQuestionList,
  QUESTION_DUPLICATE_MESSAGE,
  QUESTION_NOT_FOUND_MESSAGE,
  updateQuestion,
} from "@/lib/questions";
import { QuestionCategorySchema } from "@/lib/questions/api";

export const prerender = false;

// PATCH { text?, category? }: change a question's text and/or category. DELETE: remove it. Both answer with the
// whole refreshed base (QuestionListDto).

const UpdateQuestionBody = z
  .strictObject({ text: z.string().max(2_000).optional(), category: QuestionCategorySchema.optional() })
  .refine((body) => body.text !== undefined || body.category !== undefined);

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, QUESTION_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, UpdateQuestionBody);
  if (!body.ok) {
    return body.response;
  }

  const result = await updateQuestion(api.db, id, body.data);
  switch (result.status) {
    case "invalid":
      return jsonError(400, describeQuestionProblem(result.reason));
    case "duplicate":
      return jsonError(409, QUESTION_DUPLICATE_MESSAGE);
    case "not-found":
      return jsonError(404, QUESTION_NOT_FOUND_MESSAGE);
    case "updated":
      return jsonResponse(await getQuestionList(api.db));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, QUESTION_NOT_FOUND_MESSAGE);
  }
  const result = await deleteQuestion(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, QUESTION_NOT_FOUND_MESSAGE);
  }
  return jsonResponse(await getQuestionList(api.db));
};
