import type { DbClient } from "@/lib/supabase-client";
import { isWellFormedAccessKey } from "./keys";
import { parseAccessPath, type AccessRole } from "./paths";

// Access matrix (PRD Access Control). The organizer access carries both keys so the organizer view can show the
// links; the TV access carries no key at all, so nothing rendered for the TV can leak the organizer link.
// Guest access arrives with S-05 (guest links); until then every /g/ path is denied.

export interface OrganizerAccess {
  role: "organizer";
  event: { id: number; name: string; organizerKey: string; tvKey: string };
}

export interface TvAccess {
  role: "tv";
  event: { id: number; name: string };
}

export type Access = OrganizerAccess | TvAccess;

export type AccessDecision =
  { kind: "public" } | { kind: "granted"; access: Access } | { kind: "denied"; status: 404; isApi: boolean };

export class AccessLookupError extends Error {
  constructor(message: string) {
    super(`Nie udało się sprawdzić klucza dostępu: ${message}`);
    this.name = "AccessLookupError";
  }
}

// Returns null only when no event matches the key. A DB error throws (→ 500), so a misconfigured service key never
// masquerades as "brak dostępu".
export async function resolveAccess(db: DbClient, role: AccessRole, key: string): Promise<Access | null> {
  if (!isWellFormedAccessKey(key)) {
    return null;
  }

  switch (role) {
    case "organizer": {
      const { data, error } = await db
        .from("event")
        .select("id, name, organizer_key, tv_key")
        .eq("organizer_key", key)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      return {
        role: "organizer",
        event: { id: data.id, name: data.name, organizerKey: data.organizer_key, tvKey: data.tv_key },
      };
    }
    case "tv": {
      const { data, error } = await db.from("event").select("id, name").eq("tv_key", key).maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      return { role: "tv", event: { id: data.id, name: data.name } };
    }
    case "guest":
      return null;
  }
}

// Decides what the middleware does with a request path: public routes pass through; keyed routes are granted only
// for a matching key of the right role. Malformed, unknown and cross-role keys get the same denial.
export async function decideAccess(db: DbClient | null, pathname: string): Promise<AccessDecision> {
  const path = parseAccessPath(pathname);
  if (!path) {
    return { kind: "public" };
  }
  const denied: AccessDecision = { kind: "denied", status: 404, isApi: path.isApi };
  if (!db) {
    return denied;
  }
  const access = await resolveAccess(db, path.role, path.key);
  return access ? { kind: "granted", access } : denied;
}

// Narrows request locals to the access of one role (or null). Use in pages and API routes as a second check after
// the middleware, e.g. `const access = accessFor(Astro.locals, "organizer")`.
export function accessFor<R extends Access["role"]>(
  locals: { access: Access | null },
  role: R,
): Extract<Access, { role: R }> | null {
  const { access } = locals;
  if (access?.role !== role) {
    return null;
  }
  return access as Extract<Access, { role: R }>;
}
