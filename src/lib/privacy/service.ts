import type { DbClient } from "@/lib/supabase-client";
import type { EventRetentionDto, PurgeResultDto, PurgeStatus, RetentionSettingsDto } from "@/types";
import {
  createSweepThrottle,
  guestDataDeleteAfter,
  isGuestDataExpired,
  MAX_GUEST_RETENTION_DAYS,
  MIN_GUEST_RETENTION_DAYS,
  RETENTION_SWEEP_INTERVAL_MS,
  RETENTION_SWEEP_LIMIT,
} from "./rules";

// Guest data retention against the DB (privacy-retention, S-26; migration 20261111050000_privacy_retention.sql). The
// ONLY caller of the retention functions. The deletion itself is ONE call of purge_event_guest_data per event (one
// transaction); the function decides by itself whether the event may lose its guests' data (never a venue template,
// never inside its term), so a wrong id can never purge a live event.
//
// Who calls the purge (no scheduler exists — that is the user's later decision):
// - the guards, BEFORE serving anything of an event past its term: resolveAccess (every link key) and
//   findEventMembership / findPanelEvent's support branch (every panel event route and page) → enforceGuestRetention;
// - the middleware on panel page views → sweepGuestRetention (throttled; idle events past their term);
// - the CLI `npm run retention` (scripts/retention.mjs, the same two functions over PostgREST).
// No other service purges: reads like getEventCard stay pure.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

const PURGE_STATUSES: readonly PurgeStatus[] = ["not-found", "kept", "clean", "purged"];

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

// The function's jsonb answer, checked before use (an odd answer is a server fault, never a silent pass).
export function toPurgeResult(eventId: number, data: unknown): PurgeResultDto {
  const raw = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const status = raw.status;
  if (typeof status !== "string" || !PURGE_STATUSES.includes(status as PurgeStatus)) {
    fail("usunąć danych gości", `nieoczekiwana odpowiedź bazy ${JSON.stringify(data)}`);
  }
  return {
    eventId,
    status: status as PurgeStatus,
    purgedAt: typeof raw.purgedAt === "string" ? raw.purgedAt : null,
    guests: countOf(raw.guests),
    groups: countOf(raw.groups),
    snapshots: countOf(raw.snapshots),
    spotlight: countOf(raw.spotlight),
    waiters: countOf(raw.waiters),
    notes: countOf(raw.notes),
  };
}

// Deletes the guests' data of one event if (and only if) it is past its term; idempotent. Throws on a DB error.
export async function purgeEventGuestData(db: DbClient, eventId: number, now: Date): Promise<PurgeResultDto> {
  const { data, error } = await db.rpc("purge_event_guest_data", { p_event_id: eventId, p_now: now.toISOString() });
  if (error) {
    fail("usunąć danych gości", error.message);
  }
  return toPurgeResult(eventId, data);
}

// What a guard read with the event (no extra query for a live event).
export interface RetentionRow {
  eventId: number;
  eventDate: string;
  retentionDays: number;
}

// The guards' hook: an event past its term is purged before anything of it is served (one RPC; its fast path takes no
// lock when nothing is left). null = inside the term (no RPC at all). Throws on a DB error — a guard then answers 500,
// never the expired data.
export async function enforceGuestRetention(
  db: DbClient,
  row: RetentionRow,
  now: Date,
): Promise<PurgeResultDto | null> {
  if (!isGuestDataExpired(row.eventDate, row.retentionDays, now)) {
    return null;
  }
  return purgeEventGuestData(db, row.eventId, now);
}

// Every event past its term whose guests' data is still (or again) there, oldest first — of one restaurant or all.
export async function listExpiredGuestDataEvents(
  db: DbClient,
  now: Date,
  options: { restaurantId?: number | null; limit?: number } = {},
): Promise<number[]> {
  const { data, error } = await db.rpc("expired_guest_data_events", {
    p_now: now.toISOString(),
    p_restaurant_id: options.restaurantId ?? null,
    p_limit: options.limit ?? RETENTION_SWEEP_LIMIT,
  });
  if (error) {
    fail("odczytać wydarzeń po terminie", error.message);
  }
  return data.map((row) => row.event_id);
}

// Purges every listed event, one transaction each (a failure stops the run and throws; what was purged stays purged).
export async function purgeExpiredGuestData(
  db: DbClient,
  now: Date,
  options: { restaurantId?: number | null; limit?: number } = {},
): Promise<PurgeResultDto[]> {
  const ids = await listExpiredGuestDataEvents(db, now, options);
  const results: PurgeResultDto[] = [];
  for (const id of ids) {
    results.push(await purgeEventGuestData(db, id, now));
  }
  return results;
}

// One caller per interval across every server instance (the singleton row retention_sweep).
export async function claimRetentionSweep(db: DbClient, now: Date, intervalMs: number): Promise<boolean> {
  const { data, error } = await db.rpc("claim_retention_sweep", {
    p_now: now.toISOString(),
    p_interval_seconds: Math.round(intervalMs / 1000),
  });
  if (error) {
    fail("rozpocząć sprzątania danych gości", error.message);
  }
  return data;
}

const sweepThrottle = createSweepThrottle(RETENTION_SWEEP_INTERVAL_MS);

// The lazy sweep of panel page views: at most once per interval in this instance, then only if the database lets this
// caller claim it, then at most RETENTION_SWEEP_LIMIT events. Best effort: a failure is logged and the page is served
// (the guards' hook is the guarantee that expired data is never read). Returns what it purged (null = not run).
export async function sweepGuestRetention(db: DbClient, now: Date): Promise<PurgeResultDto[] | null> {
  if (!sweepThrottle.due(now.getTime())) {
    return null;
  }
  try {
    if (!(await claimRetentionSweep(db, now, RETENTION_SWEEP_INTERVAL_MS))) {
      return null;
    }
    return await purgeExpiredGuestData(db, now, { limit: RETENTION_SWEEP_LIMIT });
  } catch (error) {
    // eslint-disable-next-line no-console -- the only trace of a failed sweep (Lambda logs); the request goes on
    console.error(
      `Sprzątanie danych gości nie powiodło się: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// The restaurant's term (null = unknown restaurant).
export async function getRestaurantRetention(db: DbClient, restaurantId: number): Promise<RetentionSettingsDto | null> {
  const { data, error } = await db
    .from("restaurant")
    .select("id, guest_retention_days")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    fail("odczytać czasu przechowywania danych gości", error.message);
  }
  if (!data) {
    return null;
  }
  return {
    restaurantId: data.id,
    guestRetentionDays: data.guest_retention_days,
    minDays: MIN_GUEST_RETENTION_DAYS,
    maxDays: MAX_GUEST_RETENTION_DAYS,
  };
}

export async function setRestaurantRetention(
  db: DbClient,
  restaurantId: number,
  days: number,
): Promise<"updated" | "not-found"> {
  const { data, error } = await db
    .from("restaurant")
    .update({ guest_retention_days: days })
    .eq("id", restaurantId)
    .select("id");
  if (error) {
    fail("zapisać czasu przechowywania danych gości", error.message);
  }
  return data.length > 0 ? "updated" : "not-found";
}

// One event's term as its pages show it (null = unknown id or a venue template).
export async function getEventRetention(db: DbClient, eventId: number): Promise<EventRetentionDto | null> {
  const { data, error } = await db
    .from("event")
    .select("event_date, guest_data_purged_at, restaurant(guest_retention_days)")
    .eq("id", eventId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("odczytać terminu usunięcia danych gości", error.message);
  }
  if (!data) {
    return null;
  }
  const retentionDays = data.restaurant.guest_retention_days;
  return {
    eventDate: data.event_date,
    retentionDays,
    deleteAfter: guestDataDeleteAfter(data.event_date, retentionDays),
    purgedAt: data.guest_data_purged_at,
  };
}
