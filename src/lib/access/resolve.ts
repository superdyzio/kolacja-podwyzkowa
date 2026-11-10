import type { DbClient } from "@/lib/supabase-client";
import { isWellFormedAccessKey } from "./keys";
import { parseAccessPath, type AccessRole } from "./paths";

// Access matrix (PRD Access Control). The organizer access carries the event keys so the organizer view can show the
// links; the TV, guest and restaurant accesses carry no key at all, so nothing rendered for them can leak another link.
// A guest key opens /g/ paths only while the organizer's guest-access switch is on (S-05); switched off, revoked,
// unknown and other roles' keys all get the same denial.

// `venueLeads` (client-restaurant-split, S-14): „Lokal prowadzi” is on — the link is view-only (the middleware refuses
// its writes with a 409) and its pages render read-only.
export interface OrganizerAccess {
  role: "organizer";
  event: {
    id: number;
    name: string;
    organizerKey: string;
    tvKey: string;
    restaurantKey: string;
    venueLeads: boolean;
  };
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

// The restaurant's read-only view of the food order (restaurant-orders): the prep list and where to serve, no prices.
export interface RestaurantAccess {
  role: "restaurant";
  event: { id: number; name: string };
}

export type Access = OrganizerAccess | TvAccess | GuestAccess | RestaurantAccess;

export type AccessDecision =
  { kind: "public" } | { kind: "granted"; access: Access } | { kind: "denied"; status: 404; isApi: boolean };

export class AccessLookupError extends Error {
  constructor(message: string) {
    super(`Nie udało się sprawdzić klucza dostępu: ${message}`);
    this.name = "AccessLookupError";
  }
}

// Returns null only when no event matches the key. A DB error throws (→ 500), so a misconfigured service key never
// masquerades as "brak dostępu". A venue template (venue-templates, S-15: an event row with is_template) has keys from
// the column defaults but never opens: every branch filters it out, so its keys get the identical denial.
export async function resolveAccess(db: DbClient, role: AccessRole, key: string): Promise<Access | null> {
  if (!isWellFormedAccessKey(key)) {
    return null;
  }

  switch (role) {
    case "organizer": {
      const { data, error } = await db
        .from("event")
        .select("id, name, organizer_key, tv_key, restaurant_key, venue_leads")
        .eq("organizer_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      return {
        role: "organizer",
        event: {
          id: data.id,
          name: data.name,
          organizerKey: data.organizer_key,
          tvKey: data.tv_key,
          restaurantKey: data.restaurant_key,
          venueLeads: data.venue_leads,
        },
      };
    }
    case "tv": {
      const { data, error } = await db
        .from("event")
        .select("id, name")
        .eq("tv_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      return { role: "tv", event: { id: data.id, name: data.name } };
    }
    case "restaurant": {
      const { data, error } = await db
        .from("event")
        .select("id, name")
        .eq("restaurant_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      return { role: "restaurant", event: { id: data.id, name: data.name } };
    }
    case "guest": {
      // One round trip: the guest by key with the event's switch embedded (every guest poll pays this lookup).
      const { data, error } = await db
        .from("guest")
        .select("id, display_name, event(id, name, guest_access_enabled, is_template)")
        .eq("access_key", key)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      // venue-templates: a template never has guests (nor the switch, a DB check), and never opens anyway.
      if (!data?.event.guest_access_enabled || data.event.is_template) {
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
  // No DB configured is a server fault (→ 500), not „brak dostępu”: the organizer's offline copy (organizer-sw.js)
  // treats the denial as a revoked key and forgets itself.
  if (!db) {
    throw new AccessLookupError("baza danych nie jest skonfigurowana");
  }
  const denied: AccessDecision = { kind: "denied", status: 404, isApi: path.isApi };
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
