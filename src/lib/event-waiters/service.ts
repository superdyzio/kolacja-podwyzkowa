import { randomInt } from "node:crypto";
import { LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_SECONDS } from "@/lib/auth/limits";
import { generateSecretToken, hashSecretToken, isWellFormedSecretToken } from "@/lib/auth/tokens";
import { isFloorOpen } from "@/lib/floor/rules";
import type { DbClient } from "@/lib/supabase-client";
import type { EventWaiterDto, EventWaiterIssuedDto, EventWaitersDto } from "@/types";
import { waiterLinkPath } from "./paths";
import {
  canAddWaiter,
  formatWaiterCode,
  MAX_EVENT_WAITERS,
  parseWaiterCode,
  parseWaiterName,
  WAITER_CODE_ALPHABET,
  WAITER_CODE_SECRET_LENGTH,
  waiterStatus,
  type WaiterNameProblem,
} from "./rules";
import type { NewWaiterSession, WaiterSession } from "./types";

// Per-event waiters in the database (event-waiter-access, S-21b): the event card's list, adding and revoking, the
// one-time link and code, the waiter's session. Results are status unions; Supabase errors throw (null / empty = not
// found). Secrets (the link token, the code, the session token) leave this module only as return values meant for the
// once-shown card or a Set-Cookie header; the database sees their SHA-256 only.

export class EventWaiterError extends Error {
  constructor(action: string, message: string) {
    super(`Kelnerzy na imprezę (${action}): ${message}`);
    this.name = "EventWaiterError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new EventWaiterError(action, error.message);
}

const LIST_COLUMNS = "id, display_name, created_at, expires_at, redeemed_at";

// --- The event card (owners and managers) ---------------------------------------------------------------------------

// The event's per-event waiters (oldest first) and whether one may be added — null when the event is not this
// restaurant's (or a template). Never a hash.
export async function getEventWaiters(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  now: Date,
): Promise<EventWaitersDto | null> {
  const [event, rows] = await Promise.all([
    db
      .from("event")
      .select("event_date, archived_at")
      .eq("id", eventId)
      .eq("restaurant_id", restaurantId)
      .eq("is_template", false)
      .maybeSingle(),
    db
      .from("event_waiter")
      .select(LIST_COLUMNS)
      .eq("event_id", eventId)
      .eq("restaurant_id", restaurantId)
      .order("created_at")
      .order("id"),
  ]);
  if (event.error) {
    fail("odczyt wydarzenia", event.error);
  }
  if (rows.error) {
    fail("lista", rows.error);
  }
  if (!event.data) {
    return null;
  }
  const waiters: EventWaiterDto[] = rows.data.map((row) => ({
    id: row.id,
    name: row.display_name,
    status: waiterStatus({ redeemedAt: row.redeemed_at, expiresAt: row.expires_at }, now),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
  return { eventId, canAdd: canAddWaiter(event.data.event_date, event.data.archived_at, now), waiters };
}

function generateCodeSecret(): string {
  let secret = "";
  for (let index = 0; index < WAITER_CODE_SECRET_LENGTH; index++) {
    secret += WAITER_CODE_ALPHABET[randomInt(WAITER_CODE_ALPHABET.length)];
  }
  return secret;
}

// The stored hash of a code's secret (namespaced, so it never equals the hash of any other kind of secret).
function codeHash(secret: string): string {
  return hashSecretToken(`waiter-code-secret:${secret}`);
}

// The throttle key of a code's waiter id (begin_login_attempt): typed codes for one waiter share it, so guessing one
// waiter's secret gets 10 tries per 15 minutes whatever is typed after the prefix.
export function waiterCodeKeyHash(waiterId: number): string {
  return hashSecretToken(`waiter-code:${String(waiterId)}`);
}

export type AddEventWaiterResult =
  | { status: "added"; issued: EventWaiterIssuedDto }
  | { status: "invalid"; problem: WaiterNameProblem }
  | { status: "closed" }
  | { status: "too-many" }
  | { status: "not-found" };

// A new per-event waiter with its one-time link and code (returned ONCE, for the card; the database keeps hashes).
// The name goes through parseWaiterName; `createdBy` = the staff account that added it.
export async function addEventWaiter(
  db: DbClient,
  input: { restaurantId: number; eventId: number; name: string; createdBy: number },
): Promise<AddEventWaiterResult> {
  const name = parseWaiterName(input.name);
  if (!name.ok) {
    return { status: "invalid", problem: name.problem };
  }
  const token = generateSecretToken();
  const secret = generateCodeSecret();
  const { data, error } = await db.rpc("add_event_waiter", {
    p_event_id: input.eventId,
    p_restaurant_id: input.restaurantId,
    p_display_name: name.name,
    p_created_by: input.createdBy,
    p_link_hash: hashSecretToken(token),
    p_code_hash: codeHash(secret),
    p_max: MAX_EVENT_WAITERS,
  });
  if (error) {
    if (error.message.includes("EVENT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    if (error.message.includes("EVENT_CLOSED")) {
      return { status: "closed" };
    }
    if (error.message.includes("TOO_MANY")) {
      return { status: "too-many" };
    }
    fail("dodawanie", error);
  }
  const row = data.at(0);
  if (!row) {
    throw new EventWaiterError("dodawanie", "brak wiersza");
  }
  return {
    status: "added",
    issued: {
      id: row.waiter_id,
      name: name.name,
      path: waiterLinkPath(token),
      code: formatWaiterCode(row.waiter_id, secret),
      expiresAt: new Date(row.expires_at).toISOString(),
    },
  };
}

// Revoke: the row goes, and with it the link, the code and the session (the next request of the waiter is refused).
export async function deleteEventWaiter(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  waiterId: number,
): Promise<"deleted" | "not-found"> {
  const { data, error } = await db
    .from("event_waiter")
    .delete()
    .eq("id", waiterId)
    .eq("event_id", eventId)
    .eq("restaurant_id", restaurantId)
    .select("id");
  if (error) {
    fail("cofanie dostępu", error);
  }
  return data.length > 0 ? "deleted" : "not-found";
}

// --- The waiter's door (link, code, session) ------------------------------------------------------------------------

type Secret = { kind: "link"; hash: string } | { kind: "code"; waiterId: number; hash: string };

interface Redeemable {
  id: number;
  name: string;
  eventId: number;
  eventName: string;
}

// The ONE „redeemable” check shared by the link page and the redemption: an unused, unexpired row whose event is a
// real event of an enabled restaurant, on the floor right now (isFloorOpen). Anything else is null — the identical
// denial for every reason.
async function findRedeemable(db: DbClient, secret: Secret, now: Date): Promise<Redeemable | null> {
  let query = db
    .from("event_waiter")
    .select("id, display_name, event_id, restaurant_id")
    .is("redeemed_at", null)
    .gt("expires_at", now.toISOString());
  query =
    secret.kind === "link"
      ? query.eq("link_hash", secret.hash)
      : query.eq("id", secret.waiterId).eq("code_hash", secret.hash);
  const { data, error } = await query.maybeSingle();
  if (error) {
    fail("odczyt linku", error);
  }
  if (!data) {
    return null;
  }
  const event = await db
    .from("event")
    .select("name, event_date, archived_at, restaurant(disabled_at)")
    .eq("id", data.event_id)
    .eq("restaurant_id", data.restaurant_id)
    .eq("is_template", false)
    .maybeSingle();
  if (event.error) {
    fail("odczyt wydarzenia", event.error);
  }
  const row = event.data;
  if (row?.restaurant.disabled_at !== null || !isFloorOpen(row.event_date, row.archived_at, now)) {
    return null;
  }
  return { id: data.id, name: data.display_name, eventId: data.event_id, eventName: row.name };
}

// What the one-time link page shows (the waiter's name and the event), or null. Opening the page uses nothing up.
export async function findWaiterLink(
  db: DbClient,
  token: string,
  now: Date,
): Promise<{ name: string; eventName: string } | null> {
  if (!isWellFormedSecretToken(token)) {
    return null;
  }
  const found = await findRedeemable(db, { kind: "link", hash: hashSecretToken(token) }, now);
  return found ? { name: found.name, eventName: found.eventName } : null;
}

// Consumes the link AND the code in ONE conditional UPDATE (still unused, still unexpired, the same secret): of two
// taps at once exactly one gets the row back, the other nothing.
async function consume(db: DbClient, waiter: Redeemable, secret: Secret, now: Date): Promise<NewWaiterSession | null> {
  const token = generateSecretToken();
  let query = db
    .from("event_waiter")
    .update({
      session_hash: hashSecretToken(token),
      link_hash: null,
      code_hash: null,
      redeemed_at: now.toISOString(),
    })
    .eq("id", waiter.id)
    .is("redeemed_at", null)
    .gt("expires_at", now.toISOString());
  query = secret.kind === "link" ? query.eq("link_hash", secret.hash) : query.eq("code_hash", secret.hash);
  const { data, error } = await query.select("event_id, expires_at");
  if (error) {
    fail("wejście", error);
  }
  const row = data.at(0);
  return row ? { token, expiresAt: new Date(row.expires_at).toISOString(), eventId: row.event_id } : null;
}

export type RedeemWaiterResult =
  | { status: "ok"; session: NewWaiterSession }
  | { status: "invalid" }
  | { status: "throttled"; retryAfterSeconds: number };

export async function redeemWaiterLink(db: DbClient, token: string, now: Date): Promise<RedeemWaiterResult> {
  if (!isWellFormedSecretToken(token)) {
    return { status: "invalid" };
  }
  const secret: Secret = { kind: "link", hash: hashSecretToken(token) };
  const waiter = await findRedeemable(db, secret, now);
  const session = waiter ? await consume(db, waiter, secret, now) : null;
  return session ? { status: "ok", session } : { status: "invalid" };
}

// The typed code. A malformed one is refused without a database call (the format is public); otherwise the throttle
// of its waiter id comes first and refuses without looking at the secret, like the login.
export async function redeemWaiterCode(db: DbClient, typed: string, now: Date): Promise<RedeemWaiterResult> {
  const parsed = parseWaiterCode(typed);
  if (!parsed) {
    return { status: "invalid" };
  }
  const keyHash = waiterCodeKeyHash(parsed.waiterId);
  const attempt = await db.rpc("begin_login_attempt", {
    p_key_hash: keyHash,
    p_limit: LOGIN_FAILURE_LIMIT,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  });
  if (attempt.error) {
    fail("limit prób", attempt.error);
  }
  const allowed = attempt.data.at(0);
  if (!allowed?.allowed) {
    return { status: "throttled", retryAfterSeconds: allowed?.retry_after_seconds ?? LOGIN_WINDOW_SECONDS };
  }
  const secret: Secret = { kind: "code", waiterId: parsed.waiterId, hash: codeHash(parsed.secret) };
  const waiter = await findRedeemable(db, secret, now);
  const session = waiter ? await consume(db, waiter, secret, now) : null;
  if (!session) {
    return { status: "invalid" };
  }
  const cleared = await db.from("login_attempt").delete().eq("key_hash", keyHash);
  if (cleared.error) {
    fail("limit prób", cleared.error);
  }
  return { status: "ok", session };
}

// The waiter of a cookie token, or null (malformed, unknown, logged out, revoked or expired). The event's state
// (archived, the window, a switched-off restaurant) is the guard's: it never costs the waiter the cookie.
export async function getWaiterSession(db: DbClient, token: string | null): Promise<WaiterSession | null> {
  if (!token || !isWellFormedSecretToken(token)) {
    return null;
  }
  const { data, error } = await db
    .from("event_waiter")
    .select("id, event_id, restaurant_id, display_name, expires_at")
    .eq("session_hash", hashSecretToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    fail("odczyt sesji", error);
  }
  if (!data) {
    return null;
  }
  return {
    waiterId: data.id,
    eventId: data.event_id,
    restaurantId: data.restaurant_id,
    name: data.display_name,
    expiresAt: new Date(data.expires_at).toISOString(),
  };
}

// Logout: the session ends (the row stays, listed as on the floor until it expires or is revoked; getting back in
// needs a new waiter).
export async function logoutWaiter(db: DbClient, waiterId: number): Promise<void> {
  const { error } = await db.from("event_waiter").update({ session_hash: null }).eq("id", waiterId);
  if (error) {
    fail("wylogowanie", error);
  }
}
