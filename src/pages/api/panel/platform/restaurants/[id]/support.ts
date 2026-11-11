import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelPlatformApi, parseIntId } from "@/lib/panel-api";
import { listPlatformRestaurants } from "@/lib/platform";
import { beginSupport, endSupport, EnterSupportBody, parseSupportReason, supportMessages } from "@/lib/support";

export const prerender = false;

// Support mode of the platform administrator in one restaurant (admin-support-log, S-13; FR-021), platform admin only
// (anyone else: the identical 404; no session: the panel's 401; a foreign or missing Origin: the middleware's 403).
// POST { reason } → this login enters support mode there (also in a switched-off restaurant) for 60 minutes, logged
// for the restaurant's owner with the reason → 201 { restaurants, support } (support.path = where it starts). DELETE →
// this login's support mode there ends (a live one is logged as the exit) → { restaurants, ended }. Unknown or
// malformed ids → the identical 404. Support mode itself is read-only and enforced by the central panel guards.

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(params.id);
  if (id === null) {
    return denied(locals);
  }
  const body = await readJsonBody(request, EnterSupportBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const reason = parseSupportReason(body.data.reason);
  if (!reason.ok) {
    return jsonError(400, supportMessages(locals.locale).reasonProblems[reason.problem]);
  }
  const result = await beginSupport(api.db, api.staff, id, reason.reason);
  if (result.status === "not-found") {
    return denied(locals);
  }
  return jsonResponse({ restaurants: await listPlatformRestaurants(api.db), support: result.grant }, 201);
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(params.id);
  if (id === null) {
    return denied(locals);
  }
  const restaurants = await listPlatformRestaurants(api.db);
  if (!restaurants.some((restaurant) => restaurant.id === id)) {
    return denied(locals);
  }
  const ended = await endSupport(api.db, api.staff.sessionId, id);
  return jsonResponse({ restaurants, ended });
};
