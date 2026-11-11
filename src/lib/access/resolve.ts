import type { DbClient } from "@/lib/supabase-client";
import { effectiveModules, type EventModules } from "@/lib/modules/rules";
import { enforceGuestRetention } from "@/lib/privacy/service";
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
    // event-modules (S-17): which modules work in this event (available ∧ enabled ∧ (free ∨ unlocked)).
    modules: EventModules;
  };
}

// event-modules (S-17): every access carries the event's working modules (not a secret: the TV and the phone show
// or hide sections by them, and the gates refuse an off module's routes).
export interface TvAccess {
  role: "tv";
  event: { id: number; name: string; modules: EventModules };
}

// The guest whose personal key is in the path. guest.id is THE identity for every guest action (S-06..S-08): never
// take a guest id from the request.
export interface GuestAccess {
  role: "guest";
  event: { id: number; name: string; modules: EventModules };
  guest: { id: number; displayName: string };
}

// The restaurant's read-only view of the food order (restaurant-orders): the prep list and where to serve, no prices.
// staff-offline-readout (S-27): `date` ("YYYY-MM-DD") — the tablet's offline copy expires when the event's floor
// window ends.
export interface RestaurantAccess {
  role: "restaurant";
  event: { id: number; name: string; date: string; modules: EventModules };
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

export function modulesOf(row: {
  modules_available: string[];
  modules_enabled: string[];
  modules_unlocked: string[];
}): EventModules {
  return effectiveModules({
    available: row.modules_available,
    enabled: row.modules_enabled,
    unlocked: row.modules_unlocked,
  });
}

// privacy-retention (S-26; NFR-019): every branch reads the event's date and its restaurant's retention term in the
// same query; an event past its term is purged (enforceGuestRetention) BEFORE the access is returned, so nothing of
// its guests is ever served. A guest's key then opens nothing (the guest no longer exists — the identical denial).
const RETENTION_COLUMNS = "event_date, restaurant(guest_retention_days)";

interface RetentionColumns {
  id: number;
  event_date: string;
  restaurant: { guest_retention_days: number };
}

function retentionRow(event: RetentionColumns) {
  return { eventId: event.id, eventDate: event.event_date, retentionDays: event.restaurant.guest_retention_days };
}

// Returns null only when no event matches the key. A DB error throws (→ 500), so a misconfigured service key never
// masquerades as "brak dostępu". A venue template (venue-templates, S-15: an event row with is_template) has keys from
// the column defaults but never opens: every branch filters it out, so its keys get the identical denial.
export async function resolveAccess(
  db: DbClient,
  role: AccessRole,
  key: string,
  now: Date = new Date(),
): Promise<Access | null> {
  if (!isWellFormedAccessKey(key)) {
    return null;
  }

  switch (role) {
    case "organizer": {
      const { data, error } = await db
        .from("event")
        .select(
          `id, name, organizer_key, tv_key, restaurant_key, venue_leads, modules_available, modules_enabled, modules_unlocked, ${RETENTION_COLUMNS}`,
        )
        .eq("organizer_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      await enforceGuestRetention(db, retentionRow(data), now);
      return {
        role: "organizer",
        event: {
          id: data.id,
          name: data.name,
          organizerKey: data.organizer_key,
          tvKey: data.tv_key,
          restaurantKey: data.restaurant_key,
          venueLeads: data.venue_leads,
          modules: modulesOf(data),
        },
      };
    }
    case "tv": {
      const { data, error } = await db
        .from("event")
        .select(`id, name, modules_available, modules_enabled, modules_unlocked, ${RETENTION_COLUMNS}`)
        .eq("tv_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      await enforceGuestRetention(db, retentionRow(data), now);
      return { role: "tv", event: { id: data.id, name: data.name, modules: modulesOf(data) } };
    }
    case "restaurant": {
      const { data, error } = await db
        .from("event")
        .select(`id, name, modules_available, modules_enabled, modules_unlocked, ${RETENTION_COLUMNS}`)
        .eq("restaurant_key", key)
        .eq("is_template", false)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      if (!data) {
        return null;
      }
      await enforceGuestRetention(db, retentionRow(data), now);
      return {
        role: "restaurant",
        event: { id: data.id, name: data.name, date: data.event_date, modules: modulesOf(data) },
      };
    }
    case "guest": {
      // One round trip: the guest by key with the event's switch embedded (every guest poll pays this lookup).
      const { data, error } = await db
        .from("guest")
        .select(
          `id, display_name, event(id, name, guest_access_enabled, is_template, modules_available, modules_enabled, modules_unlocked, ${RETENTION_COLUMNS})`,
        )
        .eq("access_key", key)
        .maybeSingle();
      if (error) {
        throw new AccessLookupError(error.message);
      }
      // venue-templates: a template never has guests (nor the switch, a DB check), and never opens anyway.
      if (!data?.event.guest_access_enabled || data.event.is_template) {
        return null;
      }
      // privacy-retention: past its term the event's guests are deleted now — this one included.
      const purge = await enforceGuestRetention(db, retentionRow(data.event), now);
      if (purge && purge.status !== "kept") {
        return null;
      }
      return {
        role: "guest",
        event: { id: data.event.id, name: data.event.name, modules: modulesOf(data.event) },
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
