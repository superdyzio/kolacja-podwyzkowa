import type { APIRoute } from "astro";
import { runFloorRoute } from "@/lib/floor/dispatch";
import { panelFloorApi } from "@/lib/panel-api";

export const prerender = false;

// The floor's API — the waiter's day view (waiter-day-and-refills, S-21; FR-029): /api/panel/events/<id>/obsluga/
// <sub-path> runs an ALLOWLISTED few of the client's order routes (FLOOR_ROUTES: the board with prices and the bill,
// new lines — refills, priced by the venue —, one piece served, new drinks on the bill, the plan image) for a member of
// the event's restaurant (owner, manager, waiter) while the event runs today (panelFloorApi). Floor work is the
// venue's day-of service, so it is allowed WHOEVER leads the event (no lead rule) and no module gates it. A sub-path or
// method outside the list, an event outside the window, another restaurant's event, unknown or malformed ids and the
// platform administrator (support mode too) all get the identical 404; the Origin check of /api/panel/ mutations runs
// in the middleware before this. A served piece is recorded as the venue's mark (marked_by 'organizer', like every
// staff write through the S-14 dispatcher): a guest's phone cannot undo it. The dispatch itself is shared with the
// per-event waiter's floor (src/lib/floor/dispatch.ts, event-waiter-access).

const handle: APIRoute = async ({ locals, params, request }) => {
  const api = await panelFloorApi(locals, params.id);
  if (api instanceof Response) {
    return api;
  }
  return runFloorRoute({ db: api.db, event: api.event, locals, path: params.path, request });
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
