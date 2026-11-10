import type { OrganizerAccess } from "@/lib/access";
import type { DbClient } from "@/lib/supabase-client";

// The organizer access of an event the panel guard has already opened (client-restaurant-split, S-14): what the
// organizer routes get from the middleware for /api/o/<key>/…, built here from the event row so the dispatcher can run
// them for staff. Filtered by BOTH ids (an event of another restaurant is unknown); null when there is none.
// venue-templates (S-15): `template` = true builds it for a venue template (the template dispatcher), false (default)
// only for a real event — a template id through the event dispatcher is unknown.
export async function getClientAccess(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  template = false,
): Promise<OrganizerAccess | null> {
  const { data, error } = await db
    .from("event")
    .select("id, name, organizer_key, tv_key, restaurant_key, venue_leads")
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", template)
    .maybeSingle();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia klienta: ${error.message}`);
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
