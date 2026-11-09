import { noAccessMessages } from "@/lib/access/messages";
import { authMessages } from "@/lib/auth/messages";
import {
  findEventMembership,
  findRestaurantMembership,
  type EventMembership,
  type RestaurantMembership,
} from "@/lib/auth/service";
import { STAFF_ROLES, type StaffRole, type StaffSession } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError, parseId } from "@/lib/http";
import type { DbClient } from "@/lib/supabase-client";

// The central guard of staff API routes (staff-accounts, F-03) — the analog of organizerApi for /api/panel/…. The
// middleware has already required a session; this re-checks it and returns the DB client. Routes that carry a
// restaurant or event id start with panelRestaurantApi / panelEventApi: a malformed id, an unknown id, a restaurant
// the person is not a member of and a role outside `roles` all get the SAME 404 as a wrong link key (NFR-012). No
// bypass for the platform admin: support access to a restaurant's data comes with its access log (S-13).

const MAX_INT4 = 2_147_483_647;

export interface PanelApi {
  staff: StaffSession;
  db: DbClient;
}

export function panelApi(locals: App.Locals): PanelApi | Response {
  if (!locals.staff) {
    return jsonError(401, authMessages(locals.locale).noSession);
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  return { staff: locals.staff, db };
}

// Restaurant and event ids are int4: anything else is "unknown" (never a database error).
function parseIntId(param: string | undefined): number | null {
  const id = parseId(param);
  return id !== null && id <= MAX_INT4 ? id : null;
}

function denied(locals: App.Locals): Response {
  return jsonError(404, noAccessMessages(locals.locale).title);
}

export async function panelRestaurantApi(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<(PanelApi & RestaurantMembership) | Response> {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(idParam);
  const membership = id === null ? null : await findRestaurantMembership(api.db, api.staff.accountId, id);
  if (!membership || !roles.includes(membership.role)) {
    return denied(locals);
  }
  return { ...api, ...membership };
}

export async function panelEventApi(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<(PanelApi & EventMembership) | Response> {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(idParam);
  const membership = id === null ? null : await findEventMembership(api.db, api.staff.accountId, id);
  if (!membership || !roles.includes(membership.role)) {
    return denied(locals);
  }
  return { ...api, ...membership };
}
