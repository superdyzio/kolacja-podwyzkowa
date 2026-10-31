import { generateAccessKey } from "@/lib/access/keys";
import { EVENT_ID } from "@/lib/event";
import { getGuestGuess } from "@/lib/guesses/service";
import { getPublishedVersion } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { isTableShape } from "@/lib/venue/rules";
import type { GuestLinksDto, GuestSeatDto, GuestStateDto } from "@/types";
import { guestStateVersion, toGuestState, toTablemates } from "./state";

// Personal guest links and the guest's own view (S-05, PRD FR-011..FR-013) for the singleton event. Functions take the
// client as a parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw;
// expected outcomes come back as status unions.
//
// Keys live in guest.access_key (the DB default gives every guest one); revoking writes a fresh key, so the old link
// stops working at once. The guest side reads only what the guest may see: their own seat in the latest snapshot and
// the published names at that table (what the TV shows anyway).

const UNIQUE_VIOLATION = "23505";

const polishCollator = new Intl.Collator("pl");

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

export type RevokeGuestKeyResult = { status: "revoked"; key: string } | { status: "not-found" };

// The switch and every guest's link, guests in Polish alphabetical order (like the guest list).
export async function getGuestLinks(db: DbClient): Promise<GuestLinksDto> {
  const [event, guests] = await Promise.all([
    db.from("event").select("guest_access_enabled").eq("id", EVENT_ID).maybeSingle(),
    db.from("guest").select("id, display_name, access_key"),
  ]);
  if (event.error) {
    fail("odczytać dostępu gości", event.error.message);
  }
  if (guests.error) {
    fail("odczytać linków gości", guests.error.message);
  }
  return {
    enabled: event.data?.guest_access_enabled ?? false,
    guests: guests.data
      .map((row) => ({ id: row.id, displayName: row.display_name, key: row.access_key }))
      .sort((a, b) => polishCollator.compare(a.displayName, b.displayName) || a.id - b.id),
  };
}

// Just the switch (the organizer shell card).
export async function getGuestAccessEnabled(db: DbClient): Promise<boolean> {
  const { data, error } = await db.from("event").select("guest_access_enabled").eq("id", EVENT_ID).maybeSingle();
  if (error) {
    fail("odczytać dostępu gości", error.message);
  }
  return data?.guest_access_enabled ?? false;
}

// Turns guest access on or off (FR-012); answers with the whole links list.
export async function setGuestAccess(db: DbClient, enabled: boolean): Promise<GuestLinksDto> {
  const { error } = await db.from("event").update({ guest_access_enabled: enabled }).eq("id", EVENT_ID);
  if (error) {
    fail("zmienić dostępu gości", error.message);
  }
  return getGuestLinks(db);
}

// Revokes a guest's link by giving them a new key (FR-012). A key collision (practically impossible at 144 bits)
// is retried once with another key.
export async function revokeGuestKey(db: DbClient, guestId: number): Promise<RevokeGuestKeyResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = generateAccessKey();
    const { data, error } = await db.from("guest").update({ access_key: key }).eq("id", guestId).select("id");
    if (error) {
      if (error.code === UNIQUE_VIOLATION && attempt === 0) {
        continue;
      }
      fail("unieważnić linku", error.message);
    }
    return data.length > 0 ? { status: "revoked", key } : { status: "not-found" };
  }
  return fail("unieważnić linku", "powtórzony klucz");
}

// The guest's own seat in snapshot `snapshotId` (one row, its snapshot table embedded), or null; then the other seats
// of that snapshot table (names as published, the same the TV shows) as the tablemates.
async function guestSeat(db: DbClient, snapshotId: number, guestId: number): Promise<GuestSeatDto | null> {
  const { data, error } = await db
    .from("seating_snapshot_seat")
    .select("seat, snapshot_table_id, seating_snapshot_table(name, room_name, seat_count, shape, pos_x, pos_y)")
    .eq("snapshot_id", snapshotId)
    .eq("guest_id", guestId)
    .maybeSingle();
  if (error) {
    fail("odczytać miejsca", error.message);
  }
  if (!data) {
    return null;
  }
  const table = data.seating_snapshot_table;
  if (!isTableShape(table.shape)) {
    fail("odczytać miejsca", `nieznany typ stolika ${table.shape}`);
  }
  const others = await db
    .from("seating_snapshot_seat")
    .select("seat, guest_name")
    .eq("snapshot_table_id", data.snapshot_table_id)
    .neq("seat", data.seat);
  if (others.error) {
    fail("odczytać stolika", others.error.message);
  }
  const shape = table.shape;
  return {
    table: table.name,
    room: table.room_name,
    seat: data.seat,
    shape,
    seatCount: table.seat_count,
    x: table.pos_x,
    y: table.pos_y,
    tablemates: toTablemates(
      { shape, seatCount: table.seat_count },
      data.seat,
      others.data.map((row) => ({ seat: row.seat, name: row.guest_name })),
    ),
  };
}

// What the guest's phone shows: their current name, their seat in the latest PUBLISHED arrangement, and (S-06) the
// guess intake flag with their own guess.
export async function getGuestState(db: DbClient, guest: { id: number; displayName: string }): Promise<GuestStateDto> {
  const [published, guess] = await Promise.all([getPublishedVersion(db), getGuestGuess(db, guest.id)]);
  const seat = published.snapshotId === null ? null : await guestSeat(db, published.snapshotId, guest.id);
  return toGuestState({
    seatingVersion: published.version,
    snapshotId: published.snapshotId,
    planVersion: published.planVersion,
    name: guest.displayName,
    seat,
    guess,
  });
}

// The guest's polling token without reading any seat (the 204 path): the published version and the own guess in
// parallel, one round trip.
export async function getGuestStateVersion(db: DbClient, guest: { id: number; displayName: string }): Promise<string> {
  const [published, guess] = await Promise.all([getPublishedVersion(db), getGuestGuess(db, guest.id)]);
  return guestStateVersion(published.version, guest.displayName, guess);
}
