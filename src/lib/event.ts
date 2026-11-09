import { loadStarterQuestions } from "@/lib/questions/service";
import type { DbClient } from "@/lib/supabase-client";

// Restaurants and their events (multi-tenant-events). Every event belongs to exactly one restaurant; its organizer,
// TV and restaurant link keys come from column defaults (18 random bytes in base64url), so creating an event is one
// plain insert. Functions take the client as a parameter so they can be tested against the local DB without Astro.
// Supabase errors always throw: a broken DB must never look like "no event" or "no access".
//
// The restaurant panel creates events through createEvent (restaurant-events, S-11: src/lib/events/service.ts), as do
// the integration tests; the scripts (npm run event:create, smoke, demo) insert the same rows over PostgREST
// (scripts/lib/platform.mjs). An event without a date gets today's (Europe/Warsaw) from the column default.

const FOREIGN_KEY_VIOLATION = "23503";

export interface RestaurantDto {
  id: number;
  name: string;
}

export interface CreatedEventDto {
  id: number;
  name: string;
  organizerKey: string;
  tvKey: string;
  restaurantKey: string;
}

export type CreateEventResult = { status: "created"; event: CreatedEventDto } | { status: "restaurant-not-found" };

export async function createRestaurant(db: DbClient, name: string): Promise<RestaurantDto> {
  const { data, error } = await db.from("restaurant").insert({ name: name.trim() }).select("id, name").single();
  if (error) {
    throw new Error(`Nie udało się utworzyć restauracji: ${error.message}`);
  }
  return { id: data.id, name: data.name };
}

// Creates an event of the restaurant and loads the starter question base into it (S-07). `date` ("YYYY-MM-DD") and
// `expectedGuests` are optional (restaurant-events): omitted, the DB defaults apply (today, none).
export async function createEvent(
  db: DbClient,
  {
    restaurantId,
    name,
    date,
    expectedGuests,
  }: { restaurantId: number; name: string; date?: string; expectedGuests?: number | null },
): Promise<CreateEventResult> {
  const { data, error } = await db
    .from("event")
    .insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      ...(date === undefined ? {} : { event_date: date }),
      ...(expectedGuests === undefined ? {} : { expected_guests: expectedGuests }),
    })
    .select("id, name, organizer_key, tv_key, restaurant_key")
    .single();
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "restaurant-not-found" };
    }
    throw new Error(`Nie udało się utworzyć wydarzenia: ${error.message}`);
  }

  // Best effort, as before: the organizer can load the base later („Wczytaj bazę startową”).
  try {
    await loadStarterQuestions(db, data.id);
  } catch (seedError) {
    // eslint-disable-next-line no-console -- the only trace of a failed seed (server logs); the event itself is fine
    console.error("Nie udało się wczytać bazy startowej pytań:", seedError);
  }
  return {
    status: "created",
    event: {
      id: data.id,
      name: data.name,
      organizerKey: data.organizer_key,
      tvKey: data.tv_key,
      restaurantKey: data.restaurant_key,
    },
  };
}
