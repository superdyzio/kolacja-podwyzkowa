import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getQuestionList, loadStarterQuestions } from "@/lib/questions";
import type { StarterLoadResultDto } from "@/types";

export const prerender = false;

// POST: "Wczytaj bazę startową" — adds every starter question that is not in the base yet (by text, in any
// category). Idempotent: a second call adds nothing. Answers how many were added plus the whole base.
export const POST: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const { added } = await loadStarterQuestions(api.db);
  const answer: StarterLoadResultDto = { added, ...(await getQuestionList(api.db)) };
  return jsonResponse(answer);
};
