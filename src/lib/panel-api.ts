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
// bypass for the platform admin: support access to a restaurant's data comes with its access log (S-13). A restaurant
// switched off by the platform administrator (platform-restaurants) opens to nobody: findRestaurantMembership returns
// null for it. Platform-only routes start with panelPlatformApi.

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
export function parseIntId(param: string | undefined): number | null {
  const id = parseId(param);
  return id !== null && id <= MAX_INT4 ? id : null;
}

// The one denial of the panel API: the same status and body as a wrong link key (NFR-012).
export function denied(locals: App.Locals): Response {
  return jsonError(404, noAccessMessages(locals.locale).title);
}

// Platform-only routes (platform-restaurants, S-10): a session without the platform-admin flag gets the identical
// 404 of an unknown id, so nothing tells an owner or a waiter that the route exists.
export function panelPlatformApi(locals: App.Locals): PanelApi | Response {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return api.staff.isPlatformAdmin ? api : denied(locals);
}

// The restaurant of a panel page or route, or null: no session, no database, a malformed, unknown or foreign id, a
// restaurant switched off by the platform administrator and a role outside `roles` all give null.
export async function findPanelRestaurant(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<(PanelApi & RestaurantMembership) | null> {
  const db = getDb();
  if (!locals.staff || !db) {
    return null;
  }
  const id = parseIntId(idParam);
  const membership = id === null ? null : await findRestaurantMembership(db, locals.staff.accountId, id);
  if (!membership || !roles.includes(membership.role)) {
    return null;
  }
  return { staff: locals.staff, db, ...membership };
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
  return (await findPanelRestaurant(locals, idParam, roles)) ?? denied(locals);
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
