import { noAccessMessages } from "@/lib/access/messages";
import type { APIRoute } from "astro";
import { accessFor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError, jsonResponse } from "@/lib/http";
import { getTvScreen, getTvScreenVersion } from "@/lib/tv-spotlight";

export const prerender = false;

// GET ?since=<version>: what the TV shows — the latest PUBLISHED arrangement as names on tables, the plan version
// (NFR-003 polling) and what the organizer put on the TV over it (tv-spotlight). When `since` equals the current
// version the answer is 204 with no body (three tiny queries; four with the pub quiz on, which also rides along —
// pub-quiz); otherwise 200 with the whole TvScreenDto, whose
// `version` the TV sends back next time. Unpublished changes never show up here. The TV has no other data route. The
// middleware has already checked the key; this is the second, role-specific check.

const MAX_VERSION_LENGTH = 64;

export const GET: APIRoute = async ({ locals, url }) => {
  const access = accessFor(locals, "tv");
  if (!access) {
    return jsonError(404, noAccessMessages(locals.locale).title);
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  const since = url.searchParams.get("since");
  if (
    since !== null &&
    since.length <= MAX_VERSION_LENGTH &&
    since ===
      (await getTvScreenVersion(db, access.event.id, access.event.modules.tvSpotlight, access.event.modules.pubQuiz))
  ) {
    return new Response(null, { status: 204 });
  }
  return jsonResponse(
    await getTvScreen(db, access.event.id, access.event.modules.tvSpotlight, access.event.modules.pubQuiz),
  );
};
