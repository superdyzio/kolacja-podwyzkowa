import type { StaffSession } from "@/lib/auth/types";
import type { DbClient } from "@/lib/supabase-client";
import { isModuleKey } from "@/lib/modules/rules";
import type { SupportAccessDto, SupportGrantDto, SupportLogDto, SupportLogEntryDto, SupportLogKind } from "@/types";
import { loggedPath, SUPPORT_LOG_LIMIT, SUPPORT_MINUTES, supportStartPath } from "./rules";

// The platform admin's support access in the database (admin-support-log, S-13). The only caller of the support
// functions and the only reader of support_log. recordSupportAccess is the central panel guard's one call: the check
// and the log row are one DB function, so a restaurant's data is never returned without its row — any database error
// throws (the request becomes a 500 without data, never a pass). Results are status unions.

export class SupportError extends Error {
  constructor(action: string, message: string) {
    super(`Tryb wsparcia (${action}): ${message}`);
    this.name = "SupportError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new SupportError(action, error.message);
}

export type BeginSupportResult = { status: "entered"; grant: SupportGrantDto } | { status: "not-found" };

// The admin's login session enters support mode in the restaurant (also a switched-off one): replaces an earlier
// entry of this login there, logs `enter` with the reason. A session that is not a live admin's and an unknown
// restaurant are one `not-found` (the route's identical 404). The reason must already be normalized
// (parseSupportReason).
export async function beginSupport(
  db: DbClient,
  session: Pick<StaffSession, "sessionId">,
  restaurantId: number,
  reason: string,
): Promise<BeginSupportResult> {
  const { data, error } = await db.rpc("begin_support_access", {
    p_session_id: session.sessionId,
    p_restaurant_id: restaurantId,
    p_reason: reason,
    p_minutes: SUPPORT_MINUTES,
  });
  if (error) {
    if (error.message.includes("NOT_ADMIN") || error.message.includes("RESTAURANT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("wejście", error);
  }
  const row = data.at(0);
  if (!row) {
    fail("wejście", { message: "brak odpowiedzi" });
  }
  return {
    status: "entered",
    grant: {
      restaurantId,
      path: supportStartPath(restaurantId),
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    },
  };
}

export type SupportTarget = { restaurantId: number } | { eventId: number };

export interface SupportAccess {
  restaurant: { id: number; name: string };
  event: { id: number; name: string; restaurantId: number } | null;
  support: SupportAccessDto;
}

// The guard's check: a live support session of this login for the restaurant (or the event's restaurant) → the
// access is logged (method, path, the event's name) and the restaurant (event) returned; else null and NOTHING is
// written. Throws on any database error — never treat a failed log write as a pass.
export async function recordSupportAccess(
  db: DbClient,
  sessionId: number,
  target: SupportTarget,
  request: { method: string; path: string },
): Promise<SupportAccess | null> {
  const { data, error } = await db.rpc("record_support_access", {
    p_session_id: sessionId,
    p_restaurant_id: "restaurantId" in target ? target.restaurantId : null,
    p_event_id: "eventId" in target ? target.eventId : null,
    p_method: request.method.toUpperCase(),
    p_path: loggedPath(request.path),
  });
  if (error) {
    fail("zapis w dzienniku", error);
  }
  const row = data.at(0);
  if (!row) {
    return null;
  }
  return {
    restaurant: { id: row.restaurant_id, name: row.restaurant_name },
    event:
      row.event_id !== null && row.event_name !== null
        ? { id: row.event_id, name: row.event_name, restaurantId: row.restaurant_id }
        : null,
    support: {
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      restaurantDisabled: row.restaurant_disabled,
      reason: row.reason,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    },
  };
}

// Ends this login's support mode in the restaurant; true when a live one ended (logged as `exit`).
export async function endSupport(db: DbClient, sessionId: number, restaurantId: number): Promise<boolean> {
  const { data, error } = await db.rpc("end_support_access", {
    p_session_id: sessionId,
    p_restaurant_id: restaurantId,
  });
  if (error) {
    fail("wyjście", error);
  }
  return data;
}

// The live support sessions of this login (the platform page's „Wsparcie aktywne”), by restaurant id.
export async function listActiveSupport(db: DbClient, sessionId: number): Promise<SupportGrantDto[]> {
  const { data, error } = await db
    .from("support_grant")
    .select("restaurant_id, started_at, expires_at")
    .eq("session_id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .order("restaurant_id");
  if (error) {
    fail("odczyt aktywnych wejść", error);
  }
  return data.map((row) => ({
    restaurantId: row.restaurant_id,
    path: supportStartPath(row.restaurant_id),
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  }));
}

function isKind(value: string): value is SupportLogKind {
  return (
    value === "enter" ||
    value === "access" ||
    value === "exit" ||
    value === "unlock" ||
    value === "lock" ||
    value === "link"
  );
}

// The restaurant's log for its owner: the newest SUPPORT_LOG_LIMIT entries, newest first.
export async function getSupportLog(db: DbClient, restaurantId: number): Promise<SupportLogDto> {
  const { data, error } = await db
    .from("support_log")
    .select(
      "id, kind, created_at, admin_email, admin_name, reason, expires_at, method, path, event_id, event_name, module, link_kind, target_email",
    )
    .eq("restaurant_id", restaurantId)
    .order("id", { ascending: false })
    .limit(SUPPORT_LOG_LIMIT + 1);
  if (error) {
    fail("odczyt dziennika", error);
  }
  const entries: SupportLogEntryDto[] = data
    .slice(0, SUPPORT_LOG_LIMIT)
    .filter((row) => isKind(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind as SupportLogKind,
      at: row.created_at,
      admin: { email: row.admin_email, name: row.admin_name },
      reason: row.reason,
      expiresAt: row.expires_at,
      method: row.method,
      path: row.path,
      event: row.event_id !== null && row.event_name !== null ? { id: row.event_id, name: row.event_name } : null,
      module: isModuleKey(row.module) ? row.module : null,
      link:
        (row.link_kind === "invite" || row.link_kind === "reset") && row.target_email !== null
          ? { kind: row.link_kind, email: row.target_email }
          : null,
    }));
  return { restaurantId, entries, truncated: data.length > SUPPORT_LOG_LIMIT };
}
