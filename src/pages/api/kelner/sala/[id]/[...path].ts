import type { APIRoute } from "astro";
import { runFloorRoute } from "@/lib/floor/dispatch";
import { waiterFloorApi } from "@/lib/waiter-api";

export const prerender = false;

// The per-event waiter's floor API (event-waiter-access, S-21b; FR-029): /api/kelner/sala/<event id>/<sub-path> runs
// exactly what the staff floor runs (FLOOR_ROUTES through the shared dispatch: the board with prices and the bill,
// refills priced by the venue, one piece or a whole line served, drinks on the bill, the plan image) for the waiter of
// the `kp-waiter` cookie — on its OWN event only, while that event is on the floor (waiterFloorApi). Another event's
// id, a malformed or unknown one, an archived event, a switched-off restaurant and anything outside the allowlist are
// the identical 404; no waiter session 401 and a foreign Origin 403 come from the middleware. Marks are the venue's
// (marked_by 'organizer'), like S-21's.

const handle: APIRoute = async ({ locals, params, request }) => {
  const api = await waiterFloorApi(locals, params.id);
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
