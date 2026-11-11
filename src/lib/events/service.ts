import { compareTableNames } from "@/lib/venue/rules";
import { generateAccessKey, organizerPath, restaurantPath, tvPath } from "@/lib/access";
import { createEvent } from "@/lib/event";
import { createEventFromTemplate } from "@/lib/templates/service";
import type { DbClient } from "@/lib/supabase-client";
import type { EventCardDto, EventSummaryDto, RestaurantEventListDto } from "@/types";
import { eventTiming, partitionEvents, platformToday } from "./dates";
import type { EventLinkKind, ValidEventInput } from "./rules";

// A restaurant's events in the panel (restaurant-events, S-11). Called only after the central guard opened the
// restaurant or the event for the person (panel-api.ts); every query is ALSO filtered by that restaurant's id, so a
// wrong pairing can never read or touch another restaurant's event (it behaves like an unknown one: null /
// "not-found"). Supabase errors throw. Keys leave this module only as link paths of the card (owners and managers).
//
// Venue templates (venue-templates, S-15) are event rows too (is_template): every query here filters them out —
// listRestaurantEvents is the ONE list query, the others treat a template like an unknown event.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

interface SummaryRow {
  id: number;
  name: string;
  event_date: string;
  expected_guests: number | null;
  archived_at: string | null;
}

function toSummary(row: SummaryRow, now: Date): EventSummaryDto {
  return {
    id: row.id,
    name: row.name,
    date: row.event_date,
    expectedGuests: row.expected_guests,
    archived: row.archived_at !== null,
    timing: eventTiming(row.event_date, now),
  };
}

// Every event of the restaurant in the three lists of the panel (see partitionEvents).
export async function listRestaurantEvents(
  db: DbClient,
  restaurantId: number,
  now: Date,
): Promise<RestaurantEventListDto> {
  const { data, error } = await db
    .from("event")
    .select("id, name, event_date, expected_guests, archived_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .order("event_date")
    .order("id");
  if (error) {
    fail("odczytać wydarzeń restauracji", error.message);
  }
  const lists = partitionEvents(
    data.map((row) => toSummary(row, now)),
    now,
  );
  return { today: platformToday(now), ...lists };
}

// The event card, or null when the event is not this restaurant's (or does not exist).
export async function getEventCard(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  now: Date,
): Promise<EventCardDto | null> {
  const [event, guests, rooms] = await Promise.all([
    db
      .from("event")
      .select(
        "id, name, event_date, expected_guests, archived_at, venue_leads, organizer_key, tv_key, restaurant_key, restaurant_id, restaurant(name)",
      )
      .eq("id", eventId)
      .eq("restaurant_id", restaurantId)
      .eq("is_template", false)
      .maybeSingle(),
    db.from("guest").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    // tv-room-rotation: the room names for the per-room TV links (this event's rooms only).
    db.from("venue_room").select("name").eq("event_id", eventId),
  ]);
  if (rooms.error) {
    fail("odczytać sal wydarzenia", rooms.error.message);
  }
  if (event.error) {
    fail("odczytać wydarzenia", event.error.message);
  }
  if (guests.error) {
    fail("policzyć gości wydarzenia", guests.error.message);
  }
  const row = event.data;
  if (!row) {
    return null;
  }
  return {
    ...toSummary(row, now),
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant.name,
    archivedAt: row.archived_at,
    venueLeads: row.venue_leads,
    guestCount: guests.count ?? 0,
    links: {
      organizer: organizerPath(row.organizer_key),
      tv: tvPath(row.tv_key),
      restaurant: restaurantPath(row.restaurant_key),
    },
    rooms: rooms.data.map((room) => room.name).sort(compareTableNames),
  };
}

export type CreateRestaurantEventResult =
  { status: "created"; event: EventCardDto } | { status: "restaurant-not-found" };

// A new event of the restaurant (with the starter question base, like every new event). The input is validated.
// venue-templates (S-15): with `templateId` the event starts with a copy of that template's venue (one transaction);
// a template of another restaurant or an unknown one → "restaurant-not-found" (the route's identical 404).
export async function createRestaurantEvent(
  db: DbClient,
  restaurantId: number,
  input: { name: string; date: string; expectedGuests: number | null; templateId?: number | null },
  now: Date,
): Promise<CreateRestaurantEventResult> {
  let eventId: number;
  if (input.templateId !== undefined && input.templateId !== null) {
    const fromTemplate = await createEventFromTemplate(db, restaurantId, input.templateId, {
      name: input.name,
      date: input.date,
      expectedGuests: input.expectedGuests,
    });
    if (fromTemplate.status !== "created") {
      return { status: "restaurant-not-found" };
    }
    eventId = fromTemplate.eventId;
  } else {
    const created = await createEvent(db, {
      restaurantId,
      name: input.name,
      date: input.date,
      expectedGuests: input.expectedGuests,
    });
    if (created.status !== "created") {
      return { status: "restaurant-not-found" };
    }
    eventId = created.event.id;
  }
  const card = await getEventCard(db, restaurantId, eventId, now);
  if (!card) {
    // Deleted between the insert and the read (another tab): nothing to show, like an unknown restaurant.
    return { status: "restaurant-not-found" };
  }
  return { status: "created", event: card };
}

export interface EventPatch extends ValidEventInput {
  archived?: boolean;
  // client-restaurant-split (S-14): „Lokal prowadzi”.
  venueLeads?: boolean;
}

// Edits the event's name, date or expected guests and archives (archived_at = now) or restores it.
export async function updateEvent(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  patch: EventPatch,
): Promise<"updated" | "not-found"> {
  const { data, error } = await db
    .from("event")
    .update({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.date === undefined ? {} : { event_date: patch.date }),
      ...(patch.expectedGuests === undefined ? {} : { expected_guests: patch.expectedGuests }),
      ...(patch.archived === undefined ? {} : { archived_at: patch.archived ? new Date().toISOString() : null }),
      ...(patch.venueLeads === undefined ? {} : { venue_leads: patch.venueLeads }),
    })
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .select("id");
  if (error) {
    fail("zapisać wydarzenia", error.message);
  }
  return data.length > 0 ? "updated" : "not-found";
}

// A fresh key for one of the event's links: the old link opens nothing from the next request on (the middleware
// resolves keys per request). Guests' personal links are never touched.
export async function rotateEventKey(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  kind: EventLinkKind,
): Promise<"rotated" | "not-found"> {
  const key = generateAccessKey();
  const change =
    kind === "organizer" ? { organizer_key: key } : kind === "tv" ? { tv_key: key } : { restaurant_key: key };
  const { data, error } = await db
    .from("event")
    .update(change)
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .select("id");
  if (error) {
    fail("wymienić linku wydarzenia", error.message);
  }
  return data.length > 0 ? "rotated" : "not-found";
}

// Deletes the event permanently: every row of it goes with it (ON DELETE CASCADE, multi-tenant-events), and with it
// every link (client, TV, tablet, guests). Never touches another event.
export async function deleteEvent(
  db: DbClient,
  restaurantId: number,
  eventId: number,
): Promise<"deleted" | "not-found"> {
  const { data, error } = await db
    .from("event")
    .delete()
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .select("id");
  if (error) {
    fail("usunąć wydarzenia", error.message);
  }
  return data.length > 0 ? "deleted" : "not-found";
}
