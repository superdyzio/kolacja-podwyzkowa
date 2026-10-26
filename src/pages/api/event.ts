import type { APIRoute } from "astro";
import { organizerPath } from "@/lib/access";
import { getDb } from "@/lib/db";
import { createEvent } from "@/lib/event";

export const prerender = false;

// One-time event creation from the home page form. When an event already exists (including a concurrent creation),
// the answer is a bare redirect to "/" that reveals nothing.
export const POST: APIRoute = async () => {
  const db = getDb();
  if (!db) {
    return Response.json({ error: "Baza danych nie jest skonfigurowana" }, { status: 503 });
  }

  const result = await createEvent(db);
  const location = result.status === "created" ? organizerPath(result.organizerKey) : "/";
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
};
