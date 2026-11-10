import type { APIRoute } from "astro";
import { getAiProviderStatus } from "@/lib/ai";
import { getAiTopicUsage } from "@/lib/ai-topics";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonResponse } from "@/lib/http";
import { panelEventApi } from "@/lib/panel-api";
import type { AiTopicBoardDto } from "@/types";

export const prerender = false;

// „Koszty AI” of an event (client-restaurant-split, FR-028): the AI topic usage, the billed tokens, the cost estimate,
// the latest failure's hint and which provider answers — never the key. Owners and managers (and support mode, a
// read); anyone else and an unknown event get the identical 404. The client link sees the counts only.
export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const board: AiTopicBoardDto = {
    usage: await getAiTopicUsage(api.db, api.event.id, locals.locale),
    provider: getAiProviderStatus(locals.locale),
  };
  return jsonResponse(board);
};
