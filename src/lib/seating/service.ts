import { EVENT_ID } from "@/lib/event";
import { getGuestList } from "@/lib/guests/service";
import type { DbClient } from "@/lib/supabase-client";
import { isTableShape } from "@/lib/venue/rules";
import { getVenue } from "@/lib/venue/service";
import type {
  DraftSeatDto,
  NeighbourHistoryDto,
  PublicationDto,
  SeatAssignmentDto,
  SeatOccupantDto,
  SeatingBoardDto,
  SeatingSnapshot,
  SnapshotSeat,
  SnapshotTable,
  TvSeatingDto,
} from "@/types";
import { describeDraftProblem, describeRestore, restoreSeats, validateDraft } from "./draft";
import { neighbourPairs, type PairSeat, type PairTable } from "./neighbours";
import { isUpToDate, seatingVersion, toTvSeating } from "./published";

// The working seating arrangement, publishing and the published reads (PRD FR-004, FR-007, FR-008) for the
// singleton event. Functions take the client as a parameter (no `astro:*`), so they are tested against the local
// DB. Supabase errors always throw; expected outcomes come back as status unions.
//
// Moves go through the DB function seat_guest() (atomic seat / move / swap / replace, pinned guests locked);
// publishing goes through publish_seating() (one consistent copy into a new snapshot). See the seating migration.

const ASSIGNMENT_COLUMNS = "guest_id, table_id, seat, is_pinned";

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

export type SeatGuestResult =
  | { status: "seated" }
  | { status: "guest-not-found" }
  | { status: "table-not-found" }
  | { status: "seat-out-of-range" }
  | { status: "guest-pinned"; guestName: string }
  | { status: "seat-pinned"; occupantName: string };

export type UnseatGuestResult =
  { status: "unseated" } | { status: "guest-not-found" } | { status: "pinned"; guestName: string };

export type SetPinnedResult = { status: "updated" } | { status: "guest-not-found" } | { status: "not-seated" };

export type PublishSeatingResult =
  { status: "published"; snapshotId: number } | { status: "unchanged"; snapshotId: number };

// The working arrangement, by table and seat.
export async function getAssignments(db: DbClient): Promise<SeatAssignmentDto[]> {
  const { data, error } = await db.from("seat_assignment").select(ASSIGNMENT_COLUMNS).order("table_id").order("seat");
  if (error) {
    fail("odczytać rozsadzenia", error.message);
  }
  return data.map((row) => ({ guestId: row.guest_id, tableId: row.table_id, seat: row.seat, pinned: row.is_pinned }));
}

async function guestName(db: DbClient, guestId: number): Promise<string | null> {
  const { data, error } = await db.from("guest").select("display_name").eq("id", guestId).maybeSingle();
  if (error) {
    fail("odczytać gościa", error.message);
  }
  return data?.display_name ?? null;
}

async function occupantName(db: DbClient, tableId: number, seat: number): Promise<string> {
  const { data, error } = await db
    .from("seat_assignment")
    .select("guest_id")
    .eq("table_id", tableId)
    .eq("seat", seat)
    .maybeSingle();
  if (error) {
    fail("odczytać miejsca", error.message);
  }
  return (data ? await guestName(db, data.guest_id) : null) ?? "?";
}

// Seats a guest on (table, seat): an empty seat → move there; a seat taken by someone → swap when the guest had a
// seat, otherwise the occupant becomes unseated; the guest's own seat → no change. Pinned guests are never moved.
export async function seatGuest(
  db: DbClient,
  guestId: number,
  tableId: number,
  seat: number,
): Promise<SeatGuestResult> {
  const { error } = await db.rpc("seat_guest", { p_guest_id: guestId, p_table_id: tableId, p_seat: seat });
  if (!error) {
    return { status: "seated" };
  }
  switch (error.message) {
    case "GUEST_NOT_FOUND":
      return { status: "guest-not-found" };
    case "TABLE_NOT_FOUND":
      return { status: "table-not-found" };
    case "SEAT_OUT_OF_RANGE":
      return { status: "seat-out-of-range" };
    case "GUEST_PINNED":
      return { status: "guest-pinned", guestName: (await guestName(db, guestId)) ?? "?" };
    case "SEAT_PINNED":
      return { status: "seat-pinned", occupantName: await occupantName(db, tableId, seat) };
    default:
      fail("posadzić gościa", error.message);
  }
}

// Frees a guest's seat (a guest without a seat stays without one). A pinned guest must be unpinned first.
export async function unseatGuest(db: DbClient, guestId: number): Promise<UnseatGuestResult> {
  const { data, error } = await db
    .from("seat_assignment")
    .delete()
    .eq("guest_id", guestId)
    .eq("is_pinned", false)
    .select("guest_id");
  if (error) {
    fail("zwolnić miejsca", error.message);
  }
  if (data.length > 0) {
    return { status: "unseated" };
  }
  const name = await guestName(db, guestId);
  if (name === null) {
    return { status: "guest-not-found" };
  }
  const { data: pinned, error: pinnedError } = await db
    .from("seat_assignment")
    .select("guest_id")
    .eq("guest_id", guestId)
    .maybeSingle();
  if (pinnedError) {
    fail("odczytać miejsca", pinnedError.message);
  }
  return pinned ? { status: "pinned", guestName: name } : { status: "unseated" };
}

// Pins a seated guest to their seat (FR-004) or unpins them.
export async function setPinned(db: DbClient, guestId: number, pinned: boolean): Promise<SetPinnedResult> {
  const { data, error } = await db
    .from("seat_assignment")
    .update({ is_pinned: pinned })
    .eq("guest_id", guestId)
    .select("guest_id");
  if (error) {
    fail("przypiąć miejsca", error.message);
  }
  if (data.length > 0) {
    return { status: "updated" };
  }
  return (await guestName(db, guestId)) === null ? { status: "guest-not-found" } : { status: "not-seated" };
}

async function latestSnapshotRow(db: DbClient): Promise<{ id: number; published_at: string } | null> {
  const { data, error } = await db
    .from("seating_snapshot")
    .select("id, published_at")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    fail("odczytać publikacji", error.message);
  }
  return data;
}

async function readSnapshot(db: DbClient, row: { id: number; published_at: string }): Promise<SeatingSnapshot> {
  const [tables, seats] = await Promise.all([
    db
      .from("seating_snapshot_table")
      .select("id, table_id, room_name, name, seat_count, shape, pos_x, pos_y")
      .eq("snapshot_id", row.id),
    db.from("seating_snapshot_seat").select("snapshot_table_id, seat, guest_id, guest_name").eq("snapshot_id", row.id),
  ]);
  if (tables.error) {
    fail("odczytać publikacji", tables.error.message);
  }
  if (seats.error) {
    fail("odczytać publikacji", seats.error.message);
  }
  return {
    id: row.id,
    publishedAt: new Date(row.published_at).toISOString(),
    tables: tables.data.map((table): SnapshotTable => {
      if (!isTableShape(table.shape)) {
        fail("odczytać publikacji", `nieznany typ stolika ${table.shape}`);
      }
      return {
        snapshotTableId: table.id,
        tableId: table.table_id,
        roomName: table.room_name,
        name: table.name,
        seatCount: table.seat_count,
        shape: table.shape,
        x: table.pos_x,
        y: table.pos_y,
      };
    }),
    seats: seats.data.map((seat): SnapshotSeat => ({
      snapshotTableId: seat.snapshot_table_id,
      seat: seat.seat,
      guestId: seat.guest_id,
      guestName: seat.guest_name,
    })),
  };
}

// The currently published arrangement (the snapshot with the highest id), or null before the first publish.
export async function getLatestSnapshot(db: DbClient): Promise<SeatingSnapshot | null> {
  const row = await latestSnapshotRow(db);
  return row ? readSnapshot(db, row) : null;
}

export async function getSnapshot(db: DbClient, id: number): Promise<SeatingSnapshot | null> {
  const { data, error } = await db.from("seating_snapshot").select("id, published_at").eq("id", id).maybeSingle();
  if (error) {
    fail("odczytać publikacji", error.message);
  }
  return data ? readSnapshot(db, data) : null;
}

// The snapshot published before the latest one (S-04 "back to the previous arrangement"), or null. Its own query,
// so latestSnapshotRow (TV polling) stays a one-row read.
async function previousSnapshotRow(db: DbClient): Promise<{ id: number; published_at: string } | null> {
  const { data, error } = await db
    .from("seating_snapshot")
    .select("id, published_at")
    .order("id", { ascending: false })
    .range(1, 1)
    .maybeSingle();
  if (error) {
    fail("odczytać publikacji", error.message);
  }
  return data;
}

function toPublication(row: { id: number; published_at: string } | null): PublicationDto | null {
  return row ? { snapshotId: row.id, publishedAt: new Date(row.published_at).toISOString() } : null;
}

// Everything the organizer seating page shows, including whether the TV is up to date.
export async function getSeatingBoard(db: DbClient): Promise<SeatingBoardDto> {
  const [guestList, venue, assignments, latest, previous] = await Promise.all([
    getGuestList(db),
    getVenue(db),
    getAssignments(db),
    getLatestSnapshot(db),
    previousSnapshotRow(db),
  ]);
  return {
    guestList,
    venue,
    assignments,
    published: latest ? { snapshotId: latest.id, publishedAt: latest.publishedAt } : null,
    previous: toPublication(previous),
    upToDate: isUpToDate(latest, { guestList, venue, assignments }),
  };
}

// Publishes the working arrangement as a new snapshot — unless it would be identical to the latest one.
export async function publishSeating(db: DbClient): Promise<PublishSeatingResult> {
  const [guestList, venue, assignments, latest] = await Promise.all([
    getGuestList(db),
    getVenue(db),
    getAssignments(db),
    getLatestSnapshot(db),
  ]);
  if (latest && isUpToDate(latest, { guestList, venue, assignments })) {
    return { status: "unchanged", snapshotId: latest.id };
  }
  const { data, error } = await db.rpc("publish_seating");
  if (error) {
    fail("opublikować rozsadzenia", error.message);
  }
  return { status: "published", snapshotId: data };
}

async function planVersion(db: DbClient): Promise<number | null> {
  const { data, error } = await db.from("venue_plan").select("updated_at").eq("event_id", EVENT_ID).maybeSingle();
  if (error) {
    fail("odczytać planu", error.message);
  }
  return data ? Date.parse(data.updated_at) : null;
}

// What is published now, without reading it: the latest snapshot id, the plan version and their polling token
// (two tiny queries, no seats). The TV and guest phones (S-05) poll against this.
export interface PublishedVersion {
  snapshotId: number | null;
  planVersion: number | null;
  version: string;
}

export async function getPublishedVersion(db: DbClient): Promise<PublishedVersion> {
  const [latest, plan] = await Promise.all([latestSnapshotRow(db), planVersion(db)]);
  const snapshotId = latest?.id ?? null;
  return { snapshotId, planVersion: plan, version: seatingVersion(snapshotId, plan) };
}

// The polling token of what the TV shows (latest snapshot id + plan version).
export async function getSeatingVersion(db: DbClient): Promise<string> {
  return (await getPublishedVersion(db)).version;
}

// The TV state: the latest snapshot as names on tables, plus the plan version for the image URL.
export async function getTvSeating(db: DbClient): Promise<TvSeatingDto> {
  const [latest, plan] = await Promise.all([getLatestSnapshot(db), planVersion(db)]);
  return toTvSeating(latest, plan);
}

// Who sits where in the working arrangement (venue page confirmations).
export async function getSeatOccupancy(db: DbClient): Promise<SeatOccupantDto[]> {
  const [assignments, guests] = await Promise.all([getAssignments(db), db.from("guest").select("id, display_name")]);
  if (guests.error) {
    fail("odczytać listy gości", guests.error.message);
  }
  const nameById = new Map(guests.data.map((guest) => [guest.id, guest.display_name]));
  return assignments.map((assignment) => ({
    tableId: assignment.tableId,
    seat: assignment.seat,
    guestName: nameById.get(assignment.guestId) ?? "?",
  }));
}

// Supabase error codes of constraint violations: unique (a guest or seat twice, a pinned collision), foreign key
// (guest or table deleted meanwhile), check.
const CONFLICT_CODES = new Set(["23505", "23503", "23514"]);
const HISTORY_PAGE = 1000;

export type ReplaceSeatingResult = { status: "replaced" } | { status: "conflict" };

export type SaveDraftResult = { status: "saved" } | { status: "invalid"; problems: string[] } | { status: "conflict" };

export type RestoreSnapshotResult =
  { status: "restored"; notice: string } | { status: "not-found" } | { status: "conflict" };

// The neighbour history (S-04): every pair of guests who sat next to each other in any published snapshot, from the
// snapshot's own table geometry. Reads every snapshot table and seat in pages (PostgREST caps a response at
// max_rows = 1000 rows, silently).
export async function getNeighbourHistory(db: DbClient): Promise<NeighbourHistoryDto> {
  const { count, error: countError } = await db.from("seating_snapshot").select("id", { count: "exact", head: true });
  if (countError) {
    fail("odczytać historii", countError.message);
  }

  const tables: PairTable[] = [];
  for (let from = 0; ; from += HISTORY_PAGE) {
    const { data, error } = await db
      .from("seating_snapshot_table")
      .select("id, shape, seat_count")
      .order("id")
      .range(from, from + HISTORY_PAGE - 1);
    if (error) {
      fail("odczytać historii", error.message);
    }
    for (const row of data) {
      if (isTableShape(row.shape)) {
        tables.push({ key: row.id, shape: row.shape, seatCount: row.seat_count });
      }
    }
    if (data.length < HISTORY_PAGE) {
      break;
    }
  }

  const seats: PairSeat[] = [];
  for (let from = 0; ; from += HISTORY_PAGE) {
    const { data, error } = await db
      .from("seating_snapshot_seat")
      .select("snapshot_table_id, seat, guest_id")
      .not("guest_id", "is", null)
      .order("snapshot_table_id")
      .order("seat")
      .range(from, from + HISTORY_PAGE - 1);
    if (error) {
      fail("odczytać historii", error.message);
    }
    for (const row of data) {
      seats.push({ tableKey: row.snapshot_table_id, seat: row.seat, guestId: row.guest_id });
    }
    if (data.length < HISTORY_PAGE) {
      break;
    }
  }

  // Snapshot table ids are unique across snapshots, so all tables can be paired at once.
  return {
    snapshotCount: count ?? 0,
    pairs: neighbourPairs(tables, seats).map(([a, b]) => [a, b]),
  };
}

// Replaces every non-pinned working row with `seats` in one transaction (replace_seating()). A constraint violation
// means the data changed since the rows were computed: nothing is written.
export async function replaceSeating(db: DbClient, seats: readonly DraftSeatDto[]): Promise<ReplaceSeatingResult> {
  const { error } = await db.rpc("replace_seating", {
    p_seats: seats.map((row) => ({ guest_id: row.guestId, table_id: row.tableId, seat: row.seat })),
  });
  if (!error) {
    return { status: "replaced" };
  }
  if (CONFLICT_CODES.has(error.code) || error.message === "SEAT_OUT_OF_RANGE") {
    return { status: "conflict" };
  }
  fail("zapisać projektu rozsadzenia", error.message);
}

// Saves a drawn draft as the working arrangement (FR-009) after re-checking the hard rules against the current data
// (validateDraft). The TV keeps the latest snapshot until the organizer publishes.
export async function saveDraft(db: DbClient, seats: readonly DraftSeatDto[]): Promise<SaveDraftResult> {
  const [guestList, venue, assignments] = await Promise.all([getGuestList(db), getVenue(db), getAssignments(db)]);
  const problems = validateDraft({ guestList, venue, assignments }, seats);
  if (problems.length > 0) {
    return { status: "invalid", problems: problems.map(describeDraftProblem) };
  }
  const written = await replaceSeating(db, seats);
  return written.status === "replaced" ? { status: "saved" } : written;
}

// Puts a published snapshot back into the working arrangement (FR-010 "back to the previous arrangement", or
// discarding a draft): restoreSeats() rules, pinned rows kept; the organizer publishes it afterwards.
export async function restoreSnapshot(db: DbClient, snapshotId: number): Promise<RestoreSnapshotResult> {
  const [snapshot, guestList, venue, assignments] = await Promise.all([
    getSnapshot(db, snapshotId),
    getGuestList(db),
    getVenue(db),
    getAssignments(db),
  ]);
  if (!snapshot) {
    return { status: "not-found" };
  }
  const { seats, unseated } = restoreSeats(snapshot, { guestList, venue, assignments });
  const written = await replaceSeating(db, seats);
  if (written.status === "conflict") {
    return written;
  }
  return { status: "restored", notice: describeRestore(snapshot.publishedAt, unseated) };
}
