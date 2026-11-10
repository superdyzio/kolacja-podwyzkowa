import type { APIContext, APIRoute } from "astro";
import { z } from "astro/zod";
import { getClientAccess } from "@/lib/client-routes/access";
import { matchClientRoute } from "@/lib/client-routes/match";
import { clientRouteHandler } from "@/lib/client-routes/table";
import { floorRouteAllows } from "@/lib/floor/rules";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { getOrderBoard, markOrderPieces, orderMessages } from "@/lib/orders";
import { denied, panelFloorApi } from "@/lib/panel-api";

export const prerender = false;

// The floor's API — the waiter's day view (waiter-day-and-refills, S-21; FR-029): /api/panel/events/<id>/obsluga/
// <sub-path> runs an ALLOWLISTED few of the client's order routes (FLOOR_ROUTES: the board with prices and the bill,
// new lines — refills, priced by the venue —, one piece served, new drinks on the bill, the plan image) for a member of
// the event's restaurant (owner, manager, waiter) while the event runs today (panelFloorApi). Floor work is the
// venue's day-of service, so it is allowed WHOEVER leads the event (no lead rule) and no module gates it. A sub-path or
// method outside the list, an event outside the window, another restaurant's event, unknown or malformed ids and the
// platform administrator (support mode too) all get the identical 404; the Origin check of /api/panel/ mutations runs
// in the middleware before this. A served piece is recorded as the venue's mark (marked_by 'organizer', like every
// staff write through the S-14 dispatcher): a guest's phone cannot undo it.

const DeliveredBody = z.strictObject({ delivered: z.boolean() });

const handle: APIRoute = async ({ locals, params, request }) => {
  const api = await panelFloorApi(locals, params.id);
  if (api instanceof Response) {
    return api;
  }
  const match = matchClientRoute(params.path);
  if (!match || !floorRouteAllows(match.pattern, request.method)) {
    return denied(locals);
  }
  // „Wydane” for the whole line: exactly { delivered } — the organizer PATCH would also rename, re-count or move it.
  if (match.pattern === "orders/:id") {
    const t = orderMessages(locals.locale);
    const id = parseId(match.id);
    if (id === null) {
      return jsonError(404, t.itemNotFound);
    }
    const body = await readJsonBody(request, DeliveredBody, locals.locale);
    if (!body.ok) {
      return body.response;
    }
    const result = await markOrderPieces(api.db, api.event.id, id, null, body.data.delivered);
    if (result.status === "not-found") {
      return jsonError(404, t.itemNotFound);
    }
    if (result.status !== "marked") {
      return jsonError(409, t.pieceOutOfRange);
    }
    return jsonResponse(await getOrderBoard(api.db, api.event.id));
  }
  const handler = clientRouteHandler(match.pattern, request.method);
  if (!handler) {
    return denied(locals);
  }
  const access = await getClientAccess(api.db, api.event.restaurantId, api.event.id);
  if (!access) {
    return denied(locals);
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
