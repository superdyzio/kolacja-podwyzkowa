import type { APIContext, APIRoute } from "astro";
import { isMutation } from "@/lib/auth";
import { getClientAccess } from "@/lib/client-routes/access";
import { isKeyRoute, matchClientRoute } from "@/lib/client-routes/match";
import { clientRouteHandler } from "@/lib/client-routes/table";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError } from "@/lib/http";
import { LEAD_CODES, leadMessages, staffMayWrite } from "@/lib/lead";
import { denied, panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// The client's API for the restaurant's staff (client-restaurant-split, S-14; PRD v2 FR-026, „Personel a praca
// klienta”): /api/panel/events/<id>/klient/<sub-path> runs the organizer route of /api/o/<key>/<sub-path> for that
// event — same validation, same answers — behind the central panel guard (owners and managers; the platform admin in
// support mode reads only, never the guests' link keys). Reads always; writes only while „Lokal prowadzi” is on, else
// 409 { code: "client-leads" } (the client edits, the staff preview). A sub-path or method the client's API does not
// have, another restaurant's event and unknown or malformed ids all get the identical 404. The Origin check of
// /api/panel/ mutations runs in the middleware before this.

const handle: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const match = matchClientRoute(params.path);
  if (!match || (api.support && isKeyRoute(match.pattern))) {
    return denied(locals);
  }
  const handler = clientRouteHandler(match.pattern, request.method);
  if (!handler) {
    return denied(locals);
  }
  const access = await getClientAccess(api.db, api.event.restaurantId, api.event.id);
  if (!access) {
    return denied(locals);
  }
  if (isMutation(request.method) && !staffMayWrite(access.event.venueLeads)) {
    return jsonError(409, leadMessages(locals.locale).staffPreviewOnly, { code: LEAD_CODES.clientLeads });
  }
  // A new locals object: the organizer route sees the event's organizer access, the request's own locals stay as the
  // middleware left them.
  const context = { locals: { ...locals, access }, params: { key: "", id: match.id }, request };
  return handler(context as unknown as APIContext);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
