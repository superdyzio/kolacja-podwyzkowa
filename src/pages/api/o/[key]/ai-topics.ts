import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { getAiProvider } from "@/lib/ai";
import {
  aiTopicLimitMessages,
  clientAiUsage,
  generateTopic,
  getAiTopicUsage,
  mockFailureRequested,
} from "@/lib/ai-topics";
import { GenerateTopicBody } from "@/lib/ai-topics/api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import type { OrganizerAiTopicAnswerDto } from "@/types";

export const prerender = false;

// GET: the AI board (usage, provider, spend) moved to the venue's panel (client-restaurant-split, FR-028:
// GET /api/panel/events/<id>/ai-topics); the client link gets the guard's identical denial.
export const GET: APIRoute = ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonError(404, noAccessMessages(locals.locale).title);
};

// POST { category }: the client generates a topic for themself, without a personal limit (the evening's limit still
// applies). Every answer carries the usage without spend (clientAiUsage); a failure carries no hint — the cause
// (timeout, rejected key, no credits) is the venue's, shown in the panel's „Koszty AI”.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, GenerateTopicBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const provider = getAiProvider();
  const result = await generateTopic(
    api.db,
    api.access.event.id,
    provider,
    { guestId: null, category: body.data.category, locale: locals.locale },
    { simulateFailure: mockFailureRequested(provider, request.headers) },
  );
  const usage = clientAiUsage(await getAiTopicUsage(api.db, api.access.event.id, locals.locale));
  const messages = aiTopicLimitMessages(locals.locale);
  switch (result.status) {
    case "generated": {
      const answer: OrganizerAiTopicAnswerDto = { topic: result.topic, usage };
      return jsonResponse(answer);
    }
    case "failed":
      return jsonError(503, messages.failed, { usage });
    case "event-limit":
      return jsonError(429, messages.eventLimit, { usage });
    // The client has no personal limit and no guest row; these cannot happen for guestId null.
    case "guest-limit":
    case "busy":
    case "not-found":
      return jsonError(409, messages.failed, { usage });
  }
};
