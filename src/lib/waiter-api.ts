import { getDb } from "@/lib/db";
import { eventWaiterMessages } from "@/lib/event-waiters/messages";
import type { WaiterSession } from "@/lib/event-waiters/types";
import { isFloorOpen } from "@/lib/floor/rules";
import { httpMessages, jsonError } from "@/lib/http";
import { denied, parseIntId } from "@/lib/panel-api";
import type { DbClient } from "@/lib/supabase-client";

// The per-event waiter's guard (event-waiter-access, S-21b; FR-023, FR-029) — the floor guard of the password-less
// door. The middleware has set `locals.waiter` from the waiter cookie (null without a live session: the page then
// redirects to /kelner, the API answers 401). Here, on EVERY request, the event is re-read: it must be the session's
// own event (the id in the path), a real event (never a template), not archived, of an enabled restaurant, on the
// floor right now (isFloorOpen) and within the waiter's own expiry. Anything else — another event's id, a malformed or
// unknown one, an event outside its window — is the identical 404 of every other guard. There is no support branch and
// no staff session here: the platform administrator and staff accounts never get in through this door.

export interface WaiterFloorEvent {
  db: DbClient;
  waiter: WaiterSession;
  event: { id: number; name: string; restaurantId: number };
  // The event's day ("YYYY-MM-DD").
  date: string;
}

export async function findWaiterFloorEvent(
  locals: App.Locals,
  idParam: string | undefined,
  now: Date = new Date(),
): Promise<WaiterFloorEvent | null> {
  const db = getDb();
  const waiter = locals.waiter;
  if (!waiter || !db) {
    return null;
  }
  const id = parseIntId(idParam);
  if (id === null || id !== waiter.eventId || new Date(waiter.expiresAt).getTime() <= now.getTime()) {
    return null;
  }
  const { data, error } = await db
    .from("event")
    .select("name, event_date, archived_at, restaurant(disabled_at)")
    .eq("id", id)
    .eq("restaurant_id", waiter.restaurantId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia kelnera: ${error.message}`);
  }
  if (data?.restaurant.disabled_at !== null || !isFloorOpen(data.event_date, data.archived_at, now)) {
    return null;
  }
  return { db, waiter, event: { id, name: data.name, restaurantId: waiter.restaurantId }, date: data.event_date };
}

export async function waiterFloorApi(
  locals: App.Locals,
  idParam: string | undefined,
): Promise<WaiterFloorEvent | Response> {
  if (!locals.waiter) {
    return jsonError(401, eventWaiterMessages(locals.locale).noSession);
  }
  if (!getDb()) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  return (await findWaiterFloorEvent(locals, idParam)) ?? denied(locals);
}
