import type { APIRoute } from "astro";
import { getAiProvider, getAiProviderStatus } from "@/lib/ai";
import {
  describeFailureForOrganizer,
  EVENT_LIMIT_MESSAGE,
  FAILED_MESSAGE,
  generateTopic,
  getAiTopicUsage,
  mockFailureRequested,
} from "@/lib/ai-topics";
import { GenerateTopicBody } from "@/lib/ai-topics/api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import type { AiTopicBoardDto, OrganizerAiTopicAnswerDto } from "@/types";

export const prerender = false;

// GET: the evening's AI topic usage and which provider answers (S-08) — never the key.
export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const board: AiTopicBoardDto = { usage: await getAiTopicUsage(api.db), provider: getAiProviderStatus() };
  return jsonResponse(board);
};

// POST { category }: the organizer generates a topic for themself, without a personal limit (the evening's 300 still
// apply). A failure carries a Polish hint about the cause (timeout, rejected key, missing key, …) for the organizer.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, GenerateTopicBody);
  if (!body.ok) {
    return body.response;
  }
  const provider = getAiProvider();
  const result = await generateTopic(
    api.db,
    provider,
    { guestId: null, category: body.data.category },
    { simulateFailure: mockFailureRequested(provider, request.headers) },
  );
  const usage = await getAiTopicUsage(api.db);
  switch (result.status) {
    case "generated": {
      const answer: OrganizerAiTopicAnswerDto = { topic: result.topic, usage };
      return jsonResponse(answer);
    }
    case "failed": {
      const hint =
        result.kind === "not-configured"
          ? (getAiProviderStatus().problem ?? describeFailureForOrganizer(result.kind))
          : describeFailureForOrganizer(result.kind, result.httpStatus);
      return jsonError(503, FAILED_MESSAGE, { hint, usage });
    }
    case "event-limit":
      return jsonError(429, EVENT_LIMIT_MESSAGE, { usage });
    // The organizer has no personal limit and no guest row; these cannot happen for guestId null.
    case "guest-limit":
    case "busy":
    case "not-found":
      return jsonError(409, FAILED_MESSAGE, { usage });
  }
};
