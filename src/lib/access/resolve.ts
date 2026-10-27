import type { DbClient } from "@/lib/supabase-client";
import { isWellFormedAccessKey } from "./keys";
import { parseAccessPath, type AccessRole } from "./paths";

// Access matrix (PRD Access Control). The organizer access carries both keys so the organizer view can show the
// links; the TV and guest accesses carry no key at all, so nothing rendered for them can leak another link.
// A guest key opens /g/ paths only while the organizer's guest-access switch is on (S-05); switched off, revoked,
// unknown and other roles' keys all get the same denial.

export interface OrganizerAccess {
  role: "organizer";
  event: { id: number; name: string; organizerKey: string; tvKey: string };
}

export interface TvAccess {
  role: "tv";
  event: { id: number; name: string };
}

// The guest whose personal key is in the path. guest.id is THE identity for every guest action (S-06..S-08): never
// take a guest id from the request.
export interface GuestAccess {
  role: "guest";
  event: { id: number; name: string };
  guest: { id: number; displayName: string };
}

export type Access = OrganizerAccess | TvAccess | GuestAccess;

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
    case "guest": {
      // One round trip: the guest by key with the event's switch embedded (every guest poll pays this lookup).
      const { data, error } = await db
        .from("guest")
        .select("id, display_name, event(id, name, guest_access_enabled)")
        .eq("access_key", key)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data?.event.guest_access_enabled) {
        return null;
      }
      return {
        role: "guest",
        event: { id: data.event.id, name: data.event.name },
        guest: { id: data.id, displayName: data.display_name },
      };
    }
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
