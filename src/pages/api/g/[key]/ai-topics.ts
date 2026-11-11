import { noAccessMessages } from "@/lib/access/messages";
import type { APIRoute } from "astro";
import { getAiProvider } from "@/lib/ai";
import { generateTopic, getGuestAiQuota, mockFailureRequested } from "@/lib/ai-topics";
import { GenerateTopicBody } from "@/lib/ai-topics/api";
import { aiTopicLimitMessages } from "@/lib/ai-topics/limits";
import { guestApi } from "@/lib/guest-api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import type { GuestAiTopicAnswerDto } from "@/types";

export const prerender = false;

// POST { category }: the guest generates an AI conversation topic for themself (S-08, US-03, FR-016, NFR-005). The
// topic is not stored, so only this phone sees it; the attempt counts toward the guest's 5 and the evening's 300 only
// when it succeeds. Every answer carries the guest's fresh quota. A failure says nothing about the provider (the
// organizer sees the reason). The caller is identified by the key alone (guestApi); any extra body field is refused.
export const POST: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, GenerateTopicBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const guestId = api.access.guest.id;
  const provider = getAiProvider();
  const result = await generateTopic(
    api.db,
    api.access.event.id,
    provider,
    { guestId, category: body.data.category, locale: locals.locale },
    { simulateFailure: mockFailureRequested(provider, request.headers) },
  );
  if (result.status === "not-found") {
    return jsonError(404, noAccessMessages(locals.locale).title);
  }
  const quota = await getGuestAiQuota(api.db, api.access.event.id, guestId);
  const messages = aiTopicLimitMessages(locals.locale);
  switch (result.status) {
    case "generated": {
      const answer: GuestAiTopicAnswerDto = { topic: result.topic, quota };
      return jsonResponse(answer);
    }
    case "guest-limit":
      return jsonError(429, messages.guestLimit, { quota });
    case "event-limit":
      return jsonError(429, messages.eventLimit, { quota });
    case "busy":
      return jsonError(409, messages.busy, { quota });
    case "failed":
      return jsonError(503, messages.failed, { quota });
  }
};
