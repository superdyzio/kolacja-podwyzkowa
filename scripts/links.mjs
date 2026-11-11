// Prints every event (restaurant · event name, id) with its organizer, TV and restaurant links — the recovery path
// when a link is lost (multi-tenant-events: there are many events now).
// Usage: npm run links            (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env, if present)
//        BASE_URL=https://twoja-domena SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run links
// The links are secret: do not paste the output anywhere public.

import { listEvents, PlatformError, printEventLinks, readDbEnv } from "./lib/platform.mjs";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4321";

try {
  const events = await listEvents(readDbEnv());
  if (events.length === 0) {
    console.log("Nie ma jeszcze wydarzeń. Utwórz je: npm run event:create");
  }
  for (const [index, event] of events.entries()) {
    if (index > 0) {
      console.log("");
    }
    console.log(`${event.restaurant} · ${event.name} (id ${String(event.id)})`);
    printEventLinks(baseUrl, event);
  }
} catch (error) {
  console.error(error instanceof PlatformError ? error.message : String(error));
  process.exit(1);
}
