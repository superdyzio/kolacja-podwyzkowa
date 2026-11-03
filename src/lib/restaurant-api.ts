import { accessFor, type RestaurantAccess } from "@/lib/access";
import { noAccessMessages } from "@/lib/access/messages";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";
import type { DbClient } from "@/lib/supabase-client";

// Shared prelude of restaurant API routes (/api/r/<key>/…, restaurant-orders): the middleware has already checked the
// key; this is the second, role-specific check. Returns the DB client, or the response to send instead. The restaurant
// only ever reads.
export function restaurantApi(locals: App.Locals): { access: RestaurantAccess; db: DbClient } | Response {
  const access = accessFor(locals, "restaurant");
  if (!access) {
    return jsonError(404, noAccessMessages(locals.locale).title);
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, httpMessages(locals.locale).noDatabase);
  }
  return { access, db };
}
