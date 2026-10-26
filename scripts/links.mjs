// Prints the organizer and TV links of the event — the recovery path when the organizer link is lost.
// Usage: npm run links            (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env, if present)
//        BASE_URL=https://twoja-domena SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run links
// The links are secret: do not paste the output anywhere public.

import { URL } from "node:url";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.BASE_URL ?? "http://localhost:4321";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (lokalnie: npm run env:local).");
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/rest/v1/event?select=name,organizer_key,tv_key`, {
  headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
});
if (!response.ok) {
  console.error(`Nie udało się odczytać wydarzenia z bazy (HTTP ${response.status}).`);
  process.exit(1);
}

const [event] = await response.json();
if (!event) {
  console.log(`Nie ma jeszcze wydarzenia. Utwórz je na ${new URL("/", baseUrl).href}`);
  process.exit(0);
}

console.log(event.name);
console.log(`Organizator: ${new URL(`/o/${event.organizer_key}`, baseUrl).href}`);
console.log(`TV:          ${new URL(`/tv/${event.tv_key}`, baseUrl).href}`);
