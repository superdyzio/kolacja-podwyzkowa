// Restaurants and events over PostgREST with the service-role key (multi-tenant-events), shared by
// `npm run event:create`, `npm run links`, the smoke test and the demo. Zero dependencies on purpose. Until the
// restaurant panel (S-11) nothing in the app creates events: these scripts insert the same rows the server's
// src/lib/event.ts would (the event's link keys come from column defaults in the database).
//
// Errors throw PlatformError with a Polish message; the scripts print it and exit. The service-role key is a secret:
// it is sent only to SUPABASE_URL and never printed.

import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const FOREIGN_KEY_VIOLATION = "23503";

export class PlatformError extends Error {}

// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment (`--env-file-if-exists=.env` in package.json).
// `requireLocal`: refuse anything but a local Supabase (smoke and demo write test data and must never reach a hosted
// database, whatever .env says).
export function readDbEnv({ requireLocal = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new PlatformError("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (lokalnie: npm run env:local).");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new PlatformError("SUPABASE_URL nie jest poprawnym adresem.");
  }
  if (requireLocal && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new PlatformError(
      `Ten skrypt zakłada dane testowe, więc działa tylko na lokalnej bazie (127.0.0.1 / localhost), a SUPABASE_URL wskazuje ${parsed.host}.`,
    );
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, host: parsed.host, local: LOCAL_HOSTS.has(parsed.hostname) };
}

async function rest(env, path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (prefer) {
    headers.Prefer = prefer;
  }
  let response;
  try {
    response = await fetch(`${env.url}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new PlatformError(
      `Brak połączenia z bazą ${env.host}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { ok: response.ok, status: response.status, data };
}

function describeFailure(result) {
  const message = result.data && typeof result.data.message === "string" ? `: ${result.data.message}` : "";
  return `HTTP ${result.status}${message}`;
}

export async function createRestaurant(env, name) {
  const result = await rest(env, "restaurant?select=id,name", {
    method: "POST",
    body: { name: name.trim() },
    prefer: "return=representation",
  });
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    throw new PlatformError(`Nie udało się utworzyć restauracji (${describeFailure(result)}).`);
  }
  const [row] = result.data;
  return { id: row.id, name: row.name };
}

// Every module on and the paid ones unlocked (event-modules, S-17): the smoke's events A/B and the demo's main event
// exercise every v1 feature. Without it a new event gets the database defaults (AI topics and guessing off).
export const ALL_MODULES = ["questions", "aiTopics", "guessing", "seatingDraw", "tvSpotlight", "pubQuiz"];
export const PAID_MODULES = ["aiTopics", "pubQuiz"];

// A new event of the restaurant; its organizer, TV and restaurant keys come from the database. `allModules` switches
// every module on (see ALL_MODULES).
export async function createEvent(env, restaurantId, name, { allModules = false } = {}) {
  const modules = allModules
    ? { modules_available: ALL_MODULES, modules_enabled: ALL_MODULES, modules_unlocked: PAID_MODULES }
    : {};
  const result = await rest(env, "event?select=id,name,organizer_key,tv_key,restaurant_key", {
    method: "POST",
    body: { restaurant_id: restaurantId, name: name.trim(), ...modules },
    prefer: "return=representation",
  });
  if (!result.ok && result.data?.code === FOREIGN_KEY_VIOLATION) {
    throw new PlatformError(`Nie ma restauracji o id ${String(restaurantId)}.`);
  }
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    throw new PlatformError(`Nie udało się utworzyć wydarzenia (${describeFailure(result)}).`);
  }
  const [row] = result.data;
  return {
    id: row.id,
    name: row.name,
    organizerKey: row.organizer_key,
    tvKey: row.tv_key,
    restaurantKey: row.restaurant_key,
  };
}

// The starter question base for a new event (`rows` = starterQuestionRows() from src/lib/questions/seed.ts), added
// like the app adds it: texts already in the event are skipped. Returns how many were added.
export async function insertStarterQuestions(env, eventId, rows) {
  const result = await rest(env, "question?on_conflict=event_id,text_key&select=id", {
    method: "POST",
    body: rows.map((row) => ({ event_id: eventId, category: row.category, text: row.text })),
    prefer: "resolution=ignore-duplicates,return=representation",
  });
  if (!result.ok || !Array.isArray(result.data)) {
    throw new PlatformError(`Nie udało się wczytać bazy startowej pytań (${describeFailure(result)}).`);
  }
  return result.data.length;
}

// Every restaurant (id and name), by id — the smoke compares the platform panel's list with it.
export async function listRestaurants(env) {
  const result = await rest(env, "restaurant?select=id,name&order=id");
  if (!result.ok || !Array.isArray(result.data)) {
    throw new PlatformError(`Nie udało się odczytać restauracji z bazy (${describeFailure(result)}).`);
  }
  return result.data.map((row) => ({ id: row.id, name: row.name }));
}

// Every event with its restaurant's name, by id. Venue templates (venue-templates, S-15: event rows with is_template)
// are not events: their keys open nothing and are never printed.
export async function listEvents(env) {
  const result = await rest(
    env,
    "event?select=id,name,organizer_key,tv_key,restaurant_key,restaurant(id,name)&is_template=eq.false&order=id",
  );
  if (!result.ok || !Array.isArray(result.data)) {
    throw new PlatformError(`Nie udało się odczytać wydarzeń z bazy (${describeFailure(result)}).`);
  }
  return result.data.map((row) => ({
    id: row.id,
    name: row.name,
    restaurant: row.restaurant?.name ?? "?",
    organizerKey: row.organizer_key,
    tvKey: row.tv_key,
    restaurantKey: row.restaurant_key,
  }));
}

// One event row's keys and template flag (venue-templates, S-15: the smoke proves a template's keys open nothing).
export async function readEventKeys(env, eventId) {
  const result = await rest(
    env,
    `event?select=id,organizer_key,tv_key,restaurant_key,is_template&id=eq.${String(eventId)}`,
  );
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) {
    throw new PlatformError(`Nie udało się odczytać wydarzenia ${String(eventId)} (${describeFailure(result)}).`);
  }
  const [row] = result.data;
  return {
    id: row.id,
    organizerKey: row.organizer_key,
    tvKey: row.tv_key,
    restaurantKey: row.restaurant_key,
    isTemplate: row.is_template,
  };
}

export function eventLinks(baseUrl, event) {
  return {
    organizer: new URL(`/o/${event.organizerKey}`, baseUrl).href,
    tv: new URL(`/tv/${event.tvKey}`, baseUrl).href,
    restaurant: new URL(`/r/${event.restaurantKey}`, baseUrl).href,
  };
}

export function printEventLinks(baseUrl, event) {
  const links = eventLinks(baseUrl, event);
  console.log(`  Organizator: ${links.organizer}`);
  console.log(`  TV:          ${links.tv}`);
  console.log(`  Restauracja: ${links.restaurant}`);
}

// --- Staff accounts (staff-accounts, F-03) ------------------------------------------------------------------------
// The same rules as src/lib/auth (tokens.ts, email.ts, limits.ts), repeated here so the scripts stay plain Node;
// tests/scripts/platform-tokens.test.ts pins them equal.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_ROLES = new Set(["owner", "manager", "waiter"]);

// 32 random bytes in base64url (43 characters), as the app's session and link tokens.
export function generateSecretToken() {
  return randomBytes(32).toString("base64url");
}

// SHA-256 as 64 lowercase hex characters: what the database stores instead of a token.
export function hashSecretToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Trimmed lowercase e-mail, or null when it does not look like one (≤ 254 characters).
export function normalizeStaffEmail(raw) {
  const email = String(raw).trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

// The account of an e-mail, created (without a password) when missing. `isPlatformAdmin: true` also sets the flag on
// an existing account. Returns { id, email, hasPassword, created }.
export async function ensureStaffAccount(env, { email, displayName = null, isPlatformAdmin = false }) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) {
    throw new PlatformError(`To nie wygląda na adres e-mail: ${String(email)}`);
  }
  const found = await rest(
    env,
    `staff_account?select=id,email,password_hash,is_platform_admin&email=eq.${encodeURIComponent(normalized)}`,
  );
  if (!found.ok || !Array.isArray(found.data)) {
    throw new PlatformError(`Nie udało się odczytać konta (${describeFailure(found)}).`);
  }
  const [existing] = found.data;
  if (existing) {
    if (isPlatformAdmin && !existing.is_platform_admin) {
      const updated = await rest(env, `staff_account?id=eq.${String(existing.id)}`, {
        method: "PATCH",
        body: { is_platform_admin: true },
      });
      if (!updated.ok) {
        throw new PlatformError(`Nie udało się nadać uprawnień administratora (${describeFailure(updated)}).`);
      }
    }
    return { id: existing.id, email: existing.email, hasPassword: existing.password_hash !== null, created: false };
  }
  const name = displayName === null ? null : String(displayName).trim() || null;
  const created = await rest(env, "staff_account?select=id,email", {
    method: "POST",
    body: { email: normalized, display_name: name, is_platform_admin: isPlatformAdmin },
    prefer: "return=representation",
  });
  if (!created.ok || !Array.isArray(created.data) || !created.data[0]) {
    throw new PlatformError(`Nie udało się założyć konta (${describeFailure(created)}).`);
  }
  return { id: created.data[0].id, email: created.data[0].email, hasPassword: false, created: true };
}

// The account's role in a restaurant (owner | manager | waiter); an existing membership gets the new role.
export async function addMembership(env, restaurantId, accountId, role) {
  if (!STAFF_ROLES.has(role)) {
    throw new PlatformError(`Nieznana rola: ${String(role)}`);
  }
  const result = await rest(env, "restaurant_member?on_conflict=restaurant_id,account_id", {
    method: "POST",
    body: { restaurant_id: restaurantId, account_id: accountId, role },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!result.ok) {
    throw new PlatformError(`Nie udało się dodać osoby do restauracji (${describeFailure(result)}).`);
  }
}

// Removes the account's membership of the restaurant (sessions stay; the account then opens nothing there). The smoke
// uses it to drop a helper owner before the sections that count the team; no last-owner check (that is the team
// routes' rule, not the script's).
export async function removeMembership(env, restaurantId, accountId) {
  const result = await rest(
    env,
    `restaurant_member?restaurant_id=eq.${String(Number(restaurantId))}&account_id=eq.${String(Number(accountId))}`,
    { method: "DELETE", prefer: "return=minimal" },
  );
  if (!result.ok) {
    throw new PlatformError(`Nie udało się usunąć osoby z restauracji (${describeFailure(result)}).`);
  }
}

// A one-time link for the account (`invite` or `reset`; its older unused links stop working). Returns the link, its
// expiry and the token (scripts that redeem it over HTTP need it).
export async function issueStaffLink(env, accountId, kind, baseUrl) {
  const token = generateSecretToken();
  const expiresAt = new Date(Date.now() + (kind === "invite" ? INVITE_TTL_MS : RESET_TTL_MS)).toISOString();
  const result = await rest(env, "rpc/issue_staff_token", {
    method: "POST",
    body: {
      p_account_id: accountId,
      p_kind: kind,
      p_token_hash: hashSecretToken(token),
      p_expires_at: expiresAt,
      p_created_by: null,
    },
  });
  if (!result.ok) {
    throw new PlatformError(`Nie udało się wydać linku (${describeFailure(result)}).`);
  }
  return { url: new URL(`/haslo/${token}`, baseUrl).href, expiresAt, token };
}
