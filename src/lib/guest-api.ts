import { accessFor, type GuestAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { jsonError } from "@/lib/http";
import type { DbClient } from "@/lib/supabase-client";

// Shared prelude of guest API routes (/api/g/<key>/…, S-05 and later S-06..S-08): the middleware has already checked
// the key (and the guest-access switch); this is the second, role-specific check. The current guest is
// `access.guest.id` — routes never take a guest id from the body, query or params.
export function guestApi(locals: App.Locals): { access: GuestAccess; db: DbClient } | Response {
  const access = accessFor(locals, "guest");
  if (!access) {
    return jsonError(404, "Brak dostępu");
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, "Baza danych nie jest skonfigurowana.");
  }
  return { access, db };
}
