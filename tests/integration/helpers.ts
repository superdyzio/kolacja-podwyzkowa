import { createEvent, createRestaurant } from "@/lib/event";
import { createServiceClient, type DbClient } from "@/lib/supabase-client";

// Integration tests run only against a LOCAL Supabase (127.0.0.1 / localhost) so they can never touch a hosted
// database, even if .env points at one. Without local credentials they are skipped (e.g. in the CI lint job).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export interface LocalDbEnv {
  url: string;
  serviceRoleKey: string;
}

export function localDbEnv(): LocalDbEnv | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) ? { url, serviceRoleKey } : null;
  } catch {
    return null;
  }
}

export const hasLocalDb = localDbEnv() !== null;

export function localDb(): DbClient {
  const env = localDbEnv();
  if (!env) {
    throw new Error(
      "Brak lokalnej bazy: ustaw SUPABASE_URL (127.0.0.1) i SUPABASE_SERVICE_ROLE_KEY (npm run env:local).",
    );
  }
  return createServiceClient(env.url, env.serviceRoleKey);
}

// multi-tenant-events: every test file works on its OWN restaurant and event (never on events that were already in
// the DB, which may be real data) and deletes them afterwards; every row of the event goes with it (ON DELETE CASCADE).
export interface TestEvent {
  id: number;
  restaurantId: number;
  name: string;
  organizerKey: string;
  tvKey: string;
  restaurantKey: string;
}

export async function readEventKeys(
  db: DbClient,
  eventId: number,
): Promise<{ name: string; organizerKey: string; tvKey: string; restaurantKey: string }> {
  const { data, error } = await db
    .from("event")
    .select("name, organizer_key, tv_key, restaurant_key")
    .eq("id", eventId)
    .single();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia: ${error.message}`);
  }
  return {
    name: data.name,
    organizerKey: data.organizer_key,
    tvKey: data.tv_key,
    restaurantKey: data.restaurant_key,
  };
}

// A fresh restaurant with one event (with the starter questions, like every new event); remove with
// releaseTestEvent().
export async function createTestEvent(db: DbClient, label = "test"): Promise<TestEvent> {
  const tag = testTag();
  const restaurant = await createRestaurant(db, `Restauracja ${label} ${tag}`);
  const result = await createEvent(db, { restaurantId: restaurant.id, name: `Wydarzenie ${label} ${tag}` });
  if (result.status !== "created") {
    throw new Error("Nie udało się utworzyć testowego wydarzenia.");
  }
  return { ...result.event, restaurantId: restaurant.id };
}

// Deletes the test's event (everything in it cascades) and then its restaurant.
export async function releaseTestEvent(db: DbClient, event: TestEvent | undefined): Promise<void> {
  if (!event) {
    return;
  }
  const deleted = await db.from("event").delete().eq("id", event.id);
  if (deleted.error) {
    throw new Error(`Nie udało się usunąć testowego wydarzenia: ${deleted.error.message}`);
  }
  const restaurant = await db.from("restaurant").delete().eq("id", event.restaurantId);
  if (restaurant.error) {
    throw new Error(`Nie udało się usunąć testowej restauracji: ${restaurant.error.message}`);
  }
}

// A short random tag for names created by a test run, so they never collide with real guests (display names are
// unique per event) and can be told apart from them.
export function testTag(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Deletes only the given rooms (rows a test created itself); their tables go with them (ON DELETE CASCADE).
export async function deleteTestRooms(db: DbClient, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await db
    .from("venue_room")
    .delete()
    .in("id", [...ids]);
  if (error) {
    throw new Error(`Nie udało się usunąć testowych sal: ${error.message}`);
  }
}

// The venue plan is one per event: a test may upload one only when none exists (it would overwrite another test's).
export async function planExists(db: DbClient, eventId: number): Promise<boolean> {
  const { data, error } = await db.from("venue_plan").select("event_id").eq("event_id", eventId).maybeSingle();
  if (error) {
    throw new Error(`Nie udało się odczytać planu: ${error.message}`);
  }
  return data !== null;
}

export async function deleteTestPlan(db: DbClient, eventId: number): Promise<void> {
  const { error } = await db.from("venue_plan").delete().eq("event_id", eventId);
  if (error) {
    throw new Error(`Nie udało się usunąć testowego planu: ${error.message}`);
  }
}

// A valid 1×1 PNG (68 bytes).
export const TINY_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (char) => char.charCodeAt(0),
);

// Deletes only the given guests (rows a test created itself). Groups that drop below 2 members dissolve on their own.
export async function deleteTestGuests(db: DbClient, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await db
    .from("guest")
    .delete()
    .in("id", [...ids]);
  if (error) {
    throw new Error(`Nie udało się usunąć testowych gości: ${error.message}`);
  }
}

// Deletes only the given seating snapshots (ones a test published itself); their tables and seats go with them.
export async function deleteTestSnapshots(db: DbClient, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await db
    .from("seating_snapshot")
    .delete()
    .in("id", [...ids]);
  if (error) {
    throw new Error(`Nie udało się usunąć testowych migawek: ${error.message}`);
  }
}

export async function countSnapshots(db: DbClient, eventId: number): Promise<number> {
  const { count, error } = await db
    .from("seating_snapshot")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) {
    throw new Error(`Nie udało się policzyć migawek: ${error.message}`);
  }
  return count ?? 0;
}

// A room with tables and a few guests created for one test (tagged names); remove with cleanupTestSeating().
export interface TestSeating {
  roomId: number;
  tableIds: number[];
  guestIds: number[];
  guestNames: string[];
  tableNames: string[];
}

export async function createTestSeating(
  db: DbClient,
  eventId: number,
  tag: string,
  tables: { seatCount: number; shape: "round" | "rectangular" }[],
  guestCount: number,
): Promise<TestSeating> {
  const { data: room, error: roomError } = await db
    .from("venue_room")
    .insert({ event_id: eventId, name: `Sala ${tag}` })
    .select("id")
    .single();
  if (roomError) {
    throw new Error(roomError.message);
  }
  const tableNames = tables.map((_, index) => `T${index + 1} ${tag}`);
  const { data: tableRows, error: tableError } = await db
    .from("venue_table")
    .insert(
      tables.map((t, index) => ({
        event_id: eventId,
        room_id: room.id,
        name: tableNames[index] ?? "",
        seat_count: t.seatCount,
        shape: t.shape,
        pos_x: 0.1 * (index + 1),
        pos_y: 0.5,
      })),
    )
    .select("id, name");
  if (tableError) {
    throw new Error(tableError.message);
  }
  const guestNames = Array.from({ length: guestCount }, (_, index) => `G${index + 1} ${tag}`);
  const { data: guestRows, error: guestError } = await db
    .from("guest")
    .insert(guestNames.map((display_name) => ({ event_id: eventId, display_name })))
    .select("id, display_name");
  if (guestError) {
    throw new Error(guestError.message);
  }
  const tableIdByName = new Map(tableRows.map((row) => [row.name, row.id]));
  const guestIdByName = new Map(guestRows.map((row) => [row.display_name, row.id]));
  return {
    roomId: room.id,
    tableIds: tableNames.map((name) => tableIdByName.get(name) ?? 0),
    guestIds: guestNames.map((name) => guestIdByName.get(name) ?? 0),
    guestNames,
    tableNames,
  };
}

// Removes what createTestSeating() made (seat rows go with their guests and tables).
export async function cleanupTestSeating(db: DbClient, seating: TestSeating | null): Promise<void> {
  if (!seating) {
    return;
  }
  await deleteTestGuests(db, seating.guestIds);
  await deleteTestRooms(db, [seating.roomId]);
}

// The guest-access switch (S-05) is shared event state: tests read it first and put it back afterwards.
export async function readGuestAccessEnabled(db: DbClient, eventId: number): Promise<boolean> {
  const { data, error } = await db.from("event").select("guest_access_enabled").eq("id", eventId).single();
  if (error) {
    throw new Error(`Nie udało się odczytać przełącznika dostępu gości: ${error.message}`);
  }
  return data.guest_access_enabled;
}

export async function writeGuestAccessEnabled(db: DbClient, eventId: number, enabled: boolean): Promise<void> {
  const { error } = await db.from("event").update({ guest_access_enabled: enabled }).eq("id", eventId);
  if (error) {
    throw new Error(`Nie udało się zmienić przełącznika dostępu gości: ${error.message}`);
  }
}

// Personal link keys of the given guests (S-05), by guest id.
export async function readGuestKeys(db: DbClient, ids: readonly number[]): Promise<Map<number, string>> {
  const { data, error } = await db
    .from("guest")
    .select("id, access_key")
    .in("id", [...ids]);
  if (error) {
    throw new Error(`Nie udało się odczytać kluczy gości: ${error.message}`);
  }
  return new Map(data.map((row) => [row.id, row.access_key]));
}

// The guess intake switch and the correct amount (S-06) are shared event state: tests read them first and put them
// back afterwards.
export interface GuessSettings {
  intakeOpen: boolean;
  correctAmountGrosze: number | null;
}

export async function readGuessSettings(db: DbClient, eventId: number): Promise<GuessSettings> {
  const { data, error } = await db
    .from("event")
    .select("guess_intake_open, correct_amount_grosze")
    .eq("id", eventId)
    .single();
  if (error) {
    throw new Error(`Nie udało się odczytać ustawień strzałów: ${error.message}`);
  }
  return { intakeOpen: data.guess_intake_open, correctAmountGrosze: data.correct_amount_grosze };
}

export async function writeGuessSettings(db: DbClient, eventId: number, settings: GuessSettings): Promise<void> {
  const { error } = await db
    .from("event")
    .update({ guess_intake_open: settings.intakeOpen, correct_amount_grosze: settings.correctAmountGrosze })
    .eq("id", eventId);
  if (error) {
    throw new Error(`Nie udało się zmienić ustawień strzałów: ${error.message}`);
  }
}

// Guests created for one test (tagged names, in this order); remove with deleteTestGuests().
export async function createTestGuests(
  db: DbClient,
  eventId: number,
  tag: string,
  count: number,
): Promise<{ ids: number[]; names: string[] }> {
  const names = Array.from({ length: count }, (_, index) => `G${index + 1} ${tag}`);
  const { data, error } = await db
    .from("guest")
    .insert(names.map((display_name) => ({ event_id: eventId, display_name })))
    .select("id, display_name");
  if (error) {
    throw new Error(error.message);
  }
  const idByName = new Map(data.map((row) => [row.display_name, row.id]));
  return { ids: names.map((name) => idByName.get(name) ?? 0), names };
}

// Deletes only the given questions (rows a test created itself, S-07); the event's real questions stay.
export async function deleteTestQuestions(db: DbClient, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await db
    .from("question")
    .delete()
    .in("id", [...ids]);
  if (error) {
    throw new Error(`Nie udało się usunąć testowych pytań: ${error.message}`);
  }
}
