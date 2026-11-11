import type { APIContext } from "astro";
import { z } from "astro/zod";
import { getClientAccess } from "@/lib/client-routes/access";
import { matchClientRoute } from "@/lib/client-routes/match";
import { clientRouteHandler } from "@/lib/client-routes/table";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { getOrderBoard, markOrderPieces, orderMessages } from "@/lib/orders";
import { denied } from "@/lib/panel-api";
import type { DbClient } from "@/lib/supabase-client";
import { floorRouteAllows } from "./rules";

// The floor's dispatch (waiter-day-and-refills, S-21; shared since event-waiter-access, S-21b): runs one request of
// the floor API — an ALLOWLISTED few of the client's order routes (FLOOR_ROUTES) — for an event a floor guard has
// already opened: the staff account's (panelFloorApi, /api/panel/events/<id>/obsluga/…) or the per-event waiter's
// (waiterFloorApi, /api/kelner/sala/<id>/…). A sub-path or method outside the list → the identical 404. „Wydane” for a
// whole line is `orders/:id` PATCH with exactly { delivered } (the organizer PATCH would also rename, re-count or move
// it). Floor work is the venue's day-of service: no lead rule, no module gate; a served piece is the venue's mark
// (marked_by 'organizer'). Server only (route modules, the database) — never re-exported from ./index.

const DeliveredBody = z.strictObject({ delivered: z.boolean() });

export async function runFloorRoute({
  db,
  event,
  locals,
  path,
  request,
}: {
  db: DbClient;
  event: { id: number; restaurantId: number };
  locals: App.Locals;
  path: string | undefined;
  request: Request;
}): Promise<Response> {
  const match = matchClientRoute(path);
  if (!match || !floorRouteAllows(match.pattern, request.method)) {
    return denied(locals);
  }
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
    const result = await markOrderPieces(db, event.id, id, null, body.data.delivered);
    if (result.status === "not-found") {
      return jsonError(404, t.itemNotFound);
    }
    if (result.status !== "marked") {
      return jsonError(409, t.pieceOutOfRange);
    }
    return jsonResponse(await getOrderBoard(db, event.id));
  }
  const handler = clientRouteHandler(match.pattern, request.method);
  if (!handler) {
    return denied(locals);
  }
  const access = await getClientAccess(db, event.restaurantId, event.id);
  if (!access) {
    return denied(locals);
  }
  // A new locals object: the organizer route sees the event's organizer access, the request's own locals stay as the
  // middleware left them.
  const context = { locals: { ...locals, access }, params: { key: "", id: match.id }, request };
  return handler(context as unknown as APIContext);
}
