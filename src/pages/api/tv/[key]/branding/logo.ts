import type { APIRoute } from "astro";
import { accessFor } from "@/lib/access";
import { noAccessMessages } from "@/lib/access/messages";
import { logoOfEventResponse } from "@/lib/branding";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// GET ?kind=event|restaurant: the logo of the TV's event or of its restaurant (event-branding, S-18). The middleware
// has already checked the key; this is the second, role-specific check.
export const GET: APIRoute = async ({ locals, request }) => {
  const access = accessFor(locals, "tv");
  if (!access) {
    return jsonError(404, noAccessMessages(locals.locale).title);
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  return logoOfEventResponse(db, access.event.id, request, locals.locale);
};
