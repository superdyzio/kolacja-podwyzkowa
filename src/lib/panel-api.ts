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
import { isReadMethod, SUPPORT_ROLE } from "@/lib/support/rules";
import { recordSupportAccess, type SupportTarget } from "@/lib/support/service";
import { findTemplateRow } from "@/lib/templates/service";
import type { DbClient } from "@/lib/supabase-client";
import type { SupportAccessDto } from "@/types";

// The central guard of staff API routes (staff-accounts, F-03) — the analog of organizerApi for /api/panel/…. The
// middleware has already required a session; this re-checks it and returns the DB client. Routes that carry a
// restaurant or event id start with panelRestaurantApi / panelEventApi: a malformed id, an unknown id, a restaurant
// the person is not a member of and a role outside `roles` all get the SAME 404 as a wrong link key (NFR-012). A
// restaurant switched off by the platform administrator (platform-restaurants) opens to none of its staff:
// findRestaurantMembership returns null for it. Platform-only routes start with panelPlatformApi.
//
// The ONE exception (admin-support-log, S-13; FR-021, NFR-012): a platform administrator without a membership who has
// entered support mode for the restaurant („Wejdź jako wsparcie”, with a reason, 60 minutes, bound to the login
// session) reads it as its owner would — READ-ONLY (only GET/HEAD/OPTIONS, only on routes that admit the owner role).
// The check and the owner's log row are one database call (recordSupportAccess): no row, no data; a failed write
// throws (500), never a pass. The result then carries `support` (the banner's data) and `role: "owner"` (the view's
// role); pages render read-only and routes keep link keys out when `support` is set. Members are decided by their
// membership alone (no extra query, no log row), and so is everybody else: the same null / 404 as before.

const MAX_INT4 = 2_147_483_647;

export interface PanelApi {
  staff: StaffSession;
  db: DbClient;
}

// What a page or route opened: the restaurant (or the event) with the role it is seen with, and `support` when the
// platform administrator reads it in support mode (null for members).
export type PanelRestaurant = PanelApi & RestaurantMembership & { support: SupportAccessDto | null };
export type PanelEvent = PanelApi & EventMembership & { support: SupportAccessDto | null };
// venue-templates (S-15): a venue template with its restaurant, opened like the restaurant itself.
export type PanelTemplate = PanelRestaurant & { template: { id: number; name: string } };

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

// The platform administrator's support access (see the header): only for an admin, on a read, on a route that admits
// the owner's role — checked BEFORE the database call, so a refused request never writes a log row. The call itself
// logs the access and returns the restaurant (and the event), or null when this login has no live support mode there.
async function supportAccess(
  locals: App.Locals,
  staff: StaffSession,
  db: DbClient,
  target: SupportTarget,
  roles: readonly StaffRole[],
) {
  const request = locals.staffRequest;
  if (!staff.isPlatformAdmin || !request || !isReadMethod(request.method) || !roles.includes(SUPPORT_ROLE)) {
    return null;
  }
  return recordSupportAccess(db, staff.sessionId, target, request);
}

// The restaurant of a panel page or route, or null: no session, no database, a malformed, unknown or foreign id, a
// restaurant switched off by the platform administrator and a role outside `roles` all give null — except the
// platform administrator's logged, read-only support access (see the header).
export async function findPanelRestaurant(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelRestaurant | null> {
  const db = getDb();
  const staff = locals.staff;
  if (!staff || !db) {
    return null;
  }
  const id = parseIntId(idParam);
  if (id === null) {
    return null;
  }
  const membership = await findRestaurantMembership(db, staff.accountId, id);
  if (membership) {
    return roles.includes(membership.role) ? { staff, db, ...membership, support: null } : null;
  }
  const support = await supportAccess(locals, staff, db, { restaurantId: id }, roles);
  if (!support) {
    return null;
  }
  return { staff, db, restaurant: support.restaurant, role: SUPPORT_ROLE, support: support.support };
}

export async function panelRestaurantApi(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelRestaurant | Response> {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return (await findPanelRestaurant(locals, idParam, roles)) ?? denied(locals);
}

// The event of a panel page or route with the person's role in its restaurant, or null — decided exactly like
// findPanelRestaurant (restaurant-events, S-11: the event card page and the event routes share it), the platform
// administrator's support access included (the log row then names the event).
export async function findPanelEvent(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelEvent | null> {
  const db = getDb();
  const staff = locals.staff;
  if (!staff || !db) {
    return null;
  }
  const id = parseIntId(idParam);
  if (id === null) {
    return null;
  }
  const membership = await findEventMembership(db, staff.accountId, id);
  if (membership) {
    return roles.includes(membership.role) ? { staff, db, ...membership, support: null } : null;
  }
  const support = await supportAccess(locals, staff, db, { eventId: id }, roles);
  if (!support?.event) {
    return null;
  }
  return {
    staff,
    db,
    restaurant: support.restaurant,
    role: SUPPORT_ROLE,
    event: support.event,
    support: support.support,
  };
}

export async function panelEventApi(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelEvent | Response> {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return (await findPanelEvent(locals, idParam, roles)) ?? denied(locals);
}

// The venue template of a panel page or route (venue-templates, S-15), or null. A template is an event row with
// is_template, but it is NEVER opened by the event guards (findEventMembership and record_support_access leave it
// out) and this guard never opens a real event: it reads the row with is_template = true and then decides exactly
// like findPanelRestaurant for the template's restaurant (roles, a switched-off restaurant, the platform
// administrator's logged, read-only support access — the log row names the restaurant and the path). A malformed,
// unknown or foreign id, an event's id and a role outside `roles` all give null.
export async function findPanelTemplate(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelTemplate | null> {
  const db = getDb();
  if (!locals.staff || !db) {
    return null;
  }
  const id = parseIntId(idParam);
  if (id === null) {
    return null;
  }
  const row = await findTemplateRow(db, id);
  if (!row) {
    return null;
  }
  const panel = await findPanelRestaurant(locals, String(row.restaurantId), roles);
  return panel ? { ...panel, template: { id: row.id, name: row.name } } : null;
}

export async function panelTemplateApi(
  locals: App.Locals,
  idParam: string | undefined,
  roles: readonly StaffRole[] = STAFF_ROLES,
): Promise<PanelTemplate | Response> {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return (await findPanelTemplate(locals, idParam, roles)) ?? denied(locals);
}
