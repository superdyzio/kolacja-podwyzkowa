// Restaurants and events over PostgREST with the service-role key (multi-tenant-events), shared by
// `npm run event:create`, `npm run links`, the smoke test and the demo. Zero dependencies on purpose. Until the
// restaurant panel (S-11) nothing in the app creates events: these scripts insert the same rows the server's
// src/lib/event.ts would (the event's link keys come from column defaults in the database).
//
// Errors throw PlatformError with a Polish message; the scripts print it and exit. The service-role key is a secret:
// it is sent only to SUPABASE_URL and never printed.

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
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, host: parsed.host };
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

// A new event of the restaurant; its organizer, TV and restaurant keys come from the database.
export async function createEvent(env, restaurantId, name) {
  const result = await rest(env, "event?select=id,name,organizer_key,tv_key,restaurant_key", {
    method: "POST",
    body: { restaurant_id: restaurantId, name: name.trim() },
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

// Every event with its restaurant's name, by id.
export async function listEvents(env) {
  const result = await rest(
    env,
    "event?select=id,name,organizer_key,tv_key,restaurant_key,restaurant(id,name)&order=id",
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
