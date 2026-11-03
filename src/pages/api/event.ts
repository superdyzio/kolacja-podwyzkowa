import type { APIRoute } from "astro";
import { organizerPath } from "@/lib/access";
import { getDb } from "@/lib/db";
import { createEvent } from "@/lib/event";
import { shellMessages } from "@/lib/shell/messages";

export const prerender = false;

// One-time event creation from the home page form. When an event already exists (including a concurrent creation),
// the answer is a bare redirect to "/" that reveals nothing.
export const POST: APIRoute = async ({ locals }) => {
  const db = getDb();
  if (!db) {
    return Response.json({ error: shellMessages(locals.locale).noDatabaseError }, { status: 503 });
  }

  const result = await createEvent(db);
  const location = result.status === "created" ? organizerPath(result.organizerKey) : "/";
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
};
