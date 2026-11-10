import { enforceGuestRetention } from "@/lib/privacy/service";
import type { DbClient } from "@/lib/supabase-client";
import { loginKeyHash, normalizeEmail } from "./email";
import { LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_SECONDS, SESSION_MAX_AGE_SECONDS, tokenTtlMs } from "./limits";
import { checkNewPassword, hashPassword, verifyPassword, type NewPasswordCheck } from "./password";
import { generateSecretToken, hashSecretToken, isWellFormedSecretToken } from "./tokens";
import {
  isStaffRole,
  type NewStaffSession,
  type StaffMembership,
  type StaffRole,
  type StaffSession,
  type StaffTokenKind,
} from "./types";

// Staff accounts in the database (staff-accounts, F-03): accounts, one-time links, login with throttling, sessions,
// password change and restaurant memberships. Results are status unions; Supabase errors throw (null / empty = not
// found). Secrets (session and link tokens) leave this module only as return values meant for a Set-Cookie header or
// a printed link; the database sees their SHA-256 only.

const UNIQUE_VIOLATION = "23505";

export class StaffAccountError extends Error {
  constructor(action: string, message: string) {
    super(`Konta personelu (${action}): ${message}`);
    this.name = "StaffAccountError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new StaffAccountError(action, error.message);
}

function sessionExpiry(now = Date.now()): string {
  return new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
}

// --- Accounts and links ---------------------------------------------------------------------------------------------

export type CreateAccountResult =
  { status: "created"; id: number } | { status: "exists"; id: number } | { status: "invalid-email" };

// A new account without a password (it gets one from its invitation link). An existing e-mail gives its id back.
export async function createStaffAccount(
  db: DbClient,
  input: { email: string; displayName?: string | null; isPlatformAdmin?: boolean },
): Promise<CreateAccountResult> {
  const email = normalizeEmail(input.email);
  if (!email) {
    return { status: "invalid-email" };
  }
  const displayName = input.displayName?.trim() ? input.displayName.trim() : null;
  const { data, error } = await db
    .from("staff_account")
    .insert({ email, display_name: displayName, is_platform_admin: input.isPlatformAdmin ?? false })
    .select("id")
    .single();
  if (!error) {
    return { status: "created", id: data.id };
  }
  if (error.code !== UNIQUE_VIOLATION) {
    fail("zakładanie konta", error);
  }
  const existing = await db.from("staff_account").select("id").eq("email", email).single();
  if (existing.error) {
    fail("odczyt konta", existing.error);
  }
  return { status: "exists", id: existing.data.id };
}

export async function addRestaurantMember(
  db: DbClient,
  restaurantId: number,
  accountId: number,
  role: StaffRole,
): Promise<void> {
  const { error } = await db
    .from("restaurant_member")
    .upsert({ restaurant_id: restaurantId, account_id: accountId, role }, { onConflict: "restaurant_id,account_id" });
  if (error) {
    fail("członkostwo", error);
  }
}

export type IssueTokenResult = { status: "issued"; token: string; expiresAt: string } | { status: "not-found" };

// A one-time link (the account's unused links stop working). The token is returned for the link only.
export async function issueStaffToken(
  db: DbClient,
  accountId: number,
  kind: StaffTokenKind,
  createdBy: number | null = null,
): Promise<IssueTokenResult> {
  const token = generateSecretToken();
  const expiresAt = new Date(Date.now() + tokenTtlMs(kind)).toISOString();
  const { error } = await db.rpc("issue_staff_token", {
    p_account_id: accountId,
    p_kind: kind,
    p_token_hash: hashSecretToken(token),
    p_expires_at: expiresAt,
    p_created_by: createdBy,
  });
  if (error) {
    if (error.message.includes("ACCOUNT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("wydawanie linku", error);
  }
  return { status: "issued", token, expiresAt };
}

// What the set-password page shows for a link: its kind and the account's e-mail. Unknown, used, expired and
// malformed tokens all give null.
export async function getTokenInfo(
  db: DbClient,
  token: string,
): Promise<{ kind: StaffTokenKind; email: string } | null> {
  if (!isWellFormedSecretToken(token)) {
    return null;
  }
  const { data, error } = await db
    .from("staff_token")
    .select("kind, staff_account!staff_token_account_id_fkey(email)")
    .eq("token_hash", hashSecretToken(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    fail("odczyt linku", error);
  }
  if (!data || (data.kind !== "invite" && data.kind !== "reset")) {
    return null;
  }
  return { kind: data.kind, email: data.staff_account.email };
}

export type RedeemResult =
  | { status: "ok"; session: NewStaffSession }
  | { status: "invalid-token" }
  | { status: Exclude<NewPasswordCheck, "ok"> };

// Sets the password from a one-time link and logs the person in: the link is used up, every earlier session of the
// account ends and a new one starts (one transaction in redeem_staff_token).
export async function redeemStaffToken(
  db: DbClient,
  token: string,
  input: { password: string; repeat: string },
): Promise<RedeemResult> {
  if (!isWellFormedSecretToken(token)) {
    return { status: "invalid-token" };
  }
  const check = checkNewPassword(input.password, input.repeat);
  if (check !== "ok") {
    return { status: check };
  }
  const sessionToken = generateSecretToken();
  const expiresAt = sessionExpiry();
  const { error } = await db.rpc("redeem_staff_token", {
    p_token_hash: hashSecretToken(token),
    p_password_hash: await hashPassword(input.password),
    p_session_hash: hashSecretToken(sessionToken),
    p_session_expires_at: expiresAt,
  });
  if (error) {
    if (error.message.includes("TOKEN_INVALID")) {
      return { status: "invalid-token" };
    }
    fail("ustawianie hasła", error);
  }
  return { status: "ok", session: { token: sessionToken, expiresAt } };
}

// --- Login, sessions, password change -------------------------------------------------------------------------------

async function beginAttempt(db: DbClient, rawEmail: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await db.rpc("begin_login_attempt", {
    p_key_hash: loginKeyHash(rawEmail),
    p_limit: LOGIN_FAILURE_LIMIT,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  });
  if (error) {
    fail("limit prób", error);
  }
  const row = data.at(0);
  return row
    ? { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds }
    : { allowed: false, retryAfterSeconds: LOGIN_WINDOW_SECONDS };
}

async function clearAttempts(db: DbClient, rawEmail: string): Promise<void> {
  const { error } = await db.from("login_attempt").delete().eq("key_hash", loginKeyHash(rawEmail));
  if (error) {
    fail("limit prób", error);
  }
}

async function openSession(db: DbClient, accountId: number): Promise<NewStaffSession> {
  const now = new Date().toISOString();
  const expired = await db.from("staff_session").delete().eq("account_id", accountId).lt("expires_at", now);
  if (expired.error) {
    fail("sprzątanie sesji", expired.error);
  }
  const token = generateSecretToken();
  const expiresAt = sessionExpiry();
  const { error } = await db
    .from("staff_session")
    .insert({ account_id: accountId, token_hash: hashSecretToken(token), expires_at: expiresAt });
  if (error) {
    fail("otwieranie sesji", error);
  }
  return { token, expiresAt };
}

export type LoginResult =
  | { status: "ok"; session: NewStaffSession; accountId: number }
  | { status: "invalid" }
  | { status: "throttled"; retryAfterSeconds: number };

// E-mail + password. The throttle comes first and refuses without looking at the password; then the same answer
// (`invalid`) for an unknown e-mail, an account without a password and a wrong password, each after one scrypt run.
export async function login(db: DbClient, input: { email: string; password: string }): Promise<LoginResult> {
  const attempt = await beginAttempt(db, input.email);
  if (!attempt.allowed) {
    return { status: "throttled", retryAfterSeconds: attempt.retryAfterSeconds };
  }
  const email = normalizeEmail(input.email);
  let account: { id: number; password_hash: string | null } | null = null;
  if (email) {
    const { data, error } = await db.from("staff_account").select("id, password_hash").eq("email", email).maybeSingle();
    if (error) {
      fail("logowanie", error);
    }
    account = data;
  }
  const valid = await verifyPassword(input.password, account?.password_hash ?? null);
  if (!valid || !account) {
    return { status: "invalid" };
  }
  await clearAttempts(db, input.email);
  return { status: "ok", session: await openSession(db, account.id), accountId: account.id };
}

// The session of a cookie token, or null (malformed, unknown, expired or ended).
export async function getSession(db: DbClient, token: string | null): Promise<StaffSession | null> {
  if (!token || !isWellFormedSecretToken(token)) {
    return null;
  }
  const { data, error } = await db
    .from("staff_session")
    .select("id, account_id, expires_at, staff_account(email, display_name, is_platform_admin)")
    .eq("token_hash", hashSecretToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    fail("odczyt sesji", error);
  }
  if (!data) {
    return null;
  }
  return {
    sessionId: data.id,
    accountId: data.account_id,
    email: data.staff_account.email,
    displayName: data.staff_account.display_name,
    isPlatformAdmin: data.staff_account.is_platform_admin,
    expiresAt: data.expires_at,
  };
}

// Ends this session, or with `everywhere` every session of the person.
export async function logout(
  db: DbClient,
  session: Pick<StaffSession, "sessionId" | "accountId">,
  { everywhere = false }: { everywhere?: boolean } = {},
): Promise<void> {
  const query = db.from("staff_session").delete();
  const { error } = everywhere
    ? await query.eq("account_id", session.accountId)
    : await query.eq("id", session.sessionId);
  if (error) {
    fail("wylogowanie", error);
  }
}

export type ChangePasswordResult =
  | { status: "ok" }
  | { status: "wrong-current" }
  | { status: "throttled"; retryAfterSeconds: number }
  | { status: Exclude<NewPasswordCheck, "ok"> };

// A logged-in person changes the password: the current one is checked through the same throttle as the login, the
// new hash is stored and every OTHER session of the person ends (this device stays logged in).
export async function changePassword(
  db: DbClient,
  session: StaffSession,
  input: { current: string; password: string; repeat: string },
): Promise<ChangePasswordResult> {
  const check = checkNewPassword(input.password, input.repeat);
  if (check !== "ok") {
    return { status: check };
  }
  const attempt = await beginAttempt(db, session.email);
  if (!attempt.allowed) {
    return { status: "throttled", retryAfterSeconds: attempt.retryAfterSeconds };
  }
  const { data, error } = await db.from("staff_account").select("password_hash").eq("id", session.accountId).single();
  if (error) {
    fail("zmiana hasła", error);
  }
  if (!(await verifyPassword(input.current, data.password_hash))) {
    return { status: "wrong-current" };
  }
  await clearAttempts(db, session.email);
  const { error: changeError } = await db.rpc("change_staff_password", {
    p_account_id: session.accountId,
    p_keep_session_id: session.sessionId,
    p_password_hash: await hashPassword(input.password),
  });
  if (changeError) {
    fail("zmiana hasła", changeError);
  }
  return { status: "ok" };
}

// --- Memberships (the central guard's lookups) ----------------------------------------------------------------------

export async function getMemberships(db: DbClient, accountId: number): Promise<StaffMembership[]> {
  const { data, error } = await db
    .from("restaurant_member")
    .select("role, restaurant(id, name, disabled_at)")
    .eq("account_id", accountId);
  if (error) {
    fail("odczyt restauracji", error);
  }
  return data
    .filter((row) => isStaffRole(row.role))
    .map((row) => ({
      restaurantId: row.restaurant.id,
      restaurantName: row.restaurant.name,
      role: row.role as StaffRole,
      disabled: row.restaurant.disabled_at !== null,
    }))
    .sort((a, b) => a.restaurantName.localeCompare(b.restaurantName, "pl") || a.restaurantId - b.restaurantId);
}

export interface RestaurantMembership {
  restaurant: { id: number; name: string };
  role: StaffRole;
}

// The person's role in the restaurant, or null (not a member, unknown restaurant, a restaurant switched off by the
// platform administrator — platform-restaurants — all the same). Every panel guard goes through here.
export async function findRestaurantMembership(
  db: DbClient,
  accountId: number,
  restaurantId: number,
): Promise<RestaurantMembership | null> {
  const { data, error } = await db
    .from("restaurant_member")
    .select("role, restaurant(id, name, disabled_at)")
    .eq("account_id", accountId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) {
    fail("sprawdzanie członkostwa", error);
  }
  if (!data || !isStaffRole(data.role) || data.restaurant.disabled_at !== null) {
    return null;
  }
  return { restaurant: { id: data.restaurant.id, name: data.restaurant.name }, role: data.role };
}

export interface EventMembership extends RestaurantMembership {
  event: { id: number; name: string; restaurantId: number };
}

// The event with the person's role in its restaurant, or null (unknown event, or the person is not a member of the
// event's restaurant — the same). privacy-retention (S-26; NFR-019): the same query reads the event's date and its
// restaurant's retention term; for a member, an event past its term is purged BEFORE it is returned, so no panel
// event route, page, dispatcher or floor ever reads expired guest data (a DB error throws → 500).
export async function findEventMembership(
  db: DbClient,
  accountId: number,
  eventId: number,
  now: Date = new Date(),
): Promise<EventMembership | null> {
  // venue-templates (S-15): a template is never an event — every event route and page answers it like an unknown id
  // (the template guard, findPanelTemplate, opens it through its restaurant).
  const { data, error } = await db
    .from("event")
    .select("id, name, restaurant_id, event_date, restaurant(guest_retention_days)")
    .eq("id", eventId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("sprawdzanie członkostwa", error);
  }
  if (!data) {
    return null;
  }
  const membership = await findRestaurantMembership(db, accountId, data.restaurant_id);
  if (!membership) {
    return null;
  }
  await enforceGuestRetention(
    db,
    { eventId: data.id, eventDate: data.event_date, retentionDays: data.restaurant.guest_retention_days },
    now,
  );
  return { ...membership, event: { id: data.id, name: data.name, restaurantId: data.restaurant_id } };
}
