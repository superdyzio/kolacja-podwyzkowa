import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  addQuestions,
  getQuestionList,
  MAX_PASTE_CHARS,
  MAX_QUESTIONS,
  parseQuestionPaste,
  questionKey,
} from "@/lib/questions";
import { QuestionCategorySchema } from "@/lib/questions/api";
import type { QuestionPasteResultDto, QuestionSkipDto } from "@/types";

export const prerender = false;

// GET: the whole question base (organizer only — guests never see the list). POST { category, text }: add questions
// pasted one per line (a single question is a one-line paste) into one category. Whatever is valid and new is added;
// the answer lists the skipped lines (already in the base, repeated in the paste, too short/long) with line numbers.

const PasteBody = z.strictObject({ category: QuestionCategorySchema, text: z.string().max(MAX_PASTE_CHARS) });

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getQuestionList(api.db));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, PasteBody);
  if (!body.ok) {
    return body.response;
  }

  const parsed = parseQuestionPaste(body.data.text);
  if (parsed.items.length === 0 && parsed.skipped.length === 0) {
    return jsonError(400, "Wpisz co najmniej jedno pytanie.");
  }

  const result = await addQuestions(
    api.db,
    body.data.category,
    parsed.items.map((item) => item.text),
  );
  if (result.status === "too-many") {
    return jsonError(
      400,
      `Baza może mieć najwyżej ${MAX_QUESTIONS} pytań (jest już ${result.existing}). Nic nie zostało dodane.`,
    );
  }

  const lineByKey = new Map(parsed.items.map((item) => [questionKey(item.text), item.line]));
  const duplicates: QuestionSkipDto[] = result.duplicates.map((text) => ({
    line: lineByKey.get(questionKey(text)) ?? 0,
    text,
    reason: "duplicate",
  }));
  const answer: QuestionPasteResultDto = {
    added: result.added.length,
    skipped: [...parsed.skipped, ...duplicates].sort((a, b) => a.line - b.line),
    ...(await getQuestionList(api.db)),
  };
  return jsonResponse(answer, answer.added > 0 ? 201 : 200);
};
