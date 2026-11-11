import type { APIContext, APIRoute } from "astro";
import { getClientAccess } from "@/lib/client-routes/access";
import { matchClientRoute } from "@/lib/client-routes/match";
import { clientRouteHandler } from "@/lib/client-routes/table";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { denied, panelTemplateApi } from "@/lib/panel-api";
import { templateMayRun } from "@/lib/templates/rules";

export const prerender = false;

// The venue editor's API for a venue template (venue-templates, S-15; FR-030): /api/panel/templates/<id>/sala/<sub-path>
// runs the organizer route of /api/o/<key>/<sub-path> for the template's own venue rows — the same validation and
// answers as the client's editor (plan upload, rooms, tables, the drawing, the AI layout read) — behind the template
// guard (owners and managers; the platform administrator in support mode reads only). ONLY the venue routes and a read
// of the (empty) seating board run here (TEMPLATE_ROUTE_PATTERNS); anything else, an event's id, another restaurant's
// template and unknown or malformed ids get the identical 404. No „Lokal prowadzi” rule: templates are the venue's.
// The Origin check of /api/panel/ mutations runs in the middleware before this.

const handle: APIRoute = async ({ locals, params, request }) => {
  const api = await panelTemplateApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const match = matchClientRoute(params.path);
  if (!match || !templateMayRun(match.pattern, request.method)) {
    return denied(locals);
  }
  const handler = clientRouteHandler(match.pattern, request.method);
  if (!handler) {
    return denied(locals);
  }
  const access = await getClientAccess(api.db, api.restaurant.id, api.template.id, true);
  if (!access) {
    return denied(locals);
  }
  const context = { locals: { ...locals, access }, params: { key: "", id: match.id }, request };
  return handler(context as unknown as APIContext);
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
