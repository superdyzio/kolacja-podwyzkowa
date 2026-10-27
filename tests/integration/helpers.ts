import { createEvent, EVENT_ID, hasEvent } from "@/lib/event";
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

export interface TestEvent {
  name: string;
  organizerKey: string;
  tvKey: string;
  // Only an event the test created itself may be deleted afterwards; a pre-existing event is real data.
  createdByTest: boolean;
}

export async function readEvent(db: DbClient): Promise<Omit<TestEvent, "createdByTest">> {
  const { data, error } = await db.from("event").select("name, organizer_key, tv_key").eq("id", EVENT_ID).single();
  if (error) {
    throw new Error(`Nie udało się odczytać wydarzenia: ${error.message}`);
  }
  return { name: data.name, organizerKey: data.organizer_key, tvKey: data.tv_key };
}

// Reuses the existing event, or creates one that releaseEvent() deletes afterwards (its guests and groups go with
// it through ON DELETE CASCADE).
export async function acquireTestEvent(db: DbClient): Promise<TestEvent> {
  if (await hasEvent(db)) {
    return { ...(await readEvent(db)), createdByTest: false };
  }
  await createEvent(db);
  return { ...(await readEvent(db)), createdByTest: true };
}

export async function releaseEvent(db: DbClient, event: TestEvent): Promise<void> {
  if (!event.createdByTest) {
    return;
  }
  const { error } = await db.from("event").delete().eq("organizer_key", event.organizerKey);
  if (error) {
    throw new Error(`Nie udało się usunąć testowego wydarzenia: ${error.message}`);
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

// The venue plan is a singleton: a test may upload one only when none exists (it would overwrite real data).
export async function planExists(db: DbClient): Promise<boolean> {
  const { data, error } = await db.from("venue_plan").select("event_id").eq("event_id", EVENT_ID).maybeSingle();
  if (error) {
    throw new Error(`Nie udało się odczytać planu: ${error.message}`);
  }
  return data !== null;
}

export async function deleteTestPlan(db: DbClient): Promise<void> {
  const { error } = await db.from("venue_plan").delete().eq("event_id", EVENT_ID);
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

export async function countSnapshots(db: DbClient): Promise<number> {
  const { count, error } = await db.from("seating_snapshot").select("id", { count: "exact", head: true });
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
  tag: string,
  tables: { seatCount: number; shape: "round" | "rectangular" }[],
  guestCount: number,
): Promise<TestSeating> {
  const { data: room, error: roomError } = await db
    .from("venue_room")
    .insert({ name: `Sala ${tag}` })
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
    .insert(guestNames.map((display_name) => ({ display_name })))
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
