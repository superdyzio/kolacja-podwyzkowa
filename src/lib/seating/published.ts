import { pluralPl } from "@/lib/guests/summary";
import { DEFAULT_CHAIR_PITCH, compareTableNames } from "@/lib/venue/rules";
import type {
  DrawingRoomDto,
  PublishedSeatingDto,
  PublishedTableDto,
  SeatOccupantDto,
  SeatingSnapshot,
  TvSeatingDto,
  TvTableDto,
} from "@/types";
import { seatLabel, type SeatingInput } from "./rules";

// The published side of seating (pure): is the latest snapshot still what a publish would write now, what the TV
// may see of a snapshot, the polling version token, and which working seats a venue edit removes.

interface ComparableTable {
  tableId: number | null;
  name: string;
  roomName: string;
  seatCount: number;
  shape: string;
  x: number;
  y: number;
  rotation: number;
}

interface ComparableSeat {
  tableId: number | null;
  seat: number;
  guestId: number | null;
  guestName: string;
}

function byNumber(a: number | null, b: number | null): number {
  return (a ?? -1) - (b ?? -1);
}

// The drawing part (venue-drawing): the pitch and the outlined rooms. A snapshot from before the drawing reads as
// the defaults (src/lib/seating/service.ts), the live venue without outlines and with the default pitch gives the
// same, so publishing the drawing columns never turned an old board "unpublished".
interface ComparableDrawing {
  chairPitch: number;
  rooms: readonly DrawingRoomDto[];
}

function fingerprint(tables: ComparableTable[], seats: ComparableSeat[], drawing: ComparableDrawing): string {
  const sortedTables = [...tables].sort((a, b) => byNumber(a.tableId, b.tableId) || a.name.localeCompare(b.name));
  const sortedSeats = [...seats].sort((a, b) => byNumber(a.tableId, b.tableId) || a.seat - b.seat);
  const sortedRooms = [...drawing.rooms].sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify({
    tables: sortedTables.map((table) => [
      table.tableId,
      table.name,
      table.roomName,
      table.seatCount,
      table.shape,
      table.x,
      table.y,
      table.rotation,
    ]),
    seats: sortedSeats.map((seat) => [seat.tableId, seat.seat, seat.guestId, seat.guestName]),
    chairPitch: drawing.chairPitch,
    rooms: sortedRooms.map((room) => [room.name, room.x, room.y, room.width, room.height]),
  });
}

// The outlined rooms of the live venue, as publish_seating() copies them.
export function outlinedRooms(venue: SeatingInput["venue"]): DrawingRoomDto[] {
  return venue.rooms.flatMap((room) => (room.outline ? [{ name: room.name, ...room.outline }] : []));
}

// What publish_seating() would write now: every table (with its room name) and every seated present guest.
export function publishableFingerprint({ guestList, venue, assignments }: SeatingInput): string {
  const roomNameById = new Map(venue.rooms.map((room) => [room.id, room.name]));
  const guestById = new Map(guestList.guests.map((guest) => [guest.id, guest]));
  const tables = venue.tables.map((table) => ({
    tableId: table.id,
    name: table.name,
    roomName: roomNameById.get(table.roomId) ?? "",
    seatCount: table.seatCount,
    shape: table.shape,
    x: table.x,
    y: table.y,
    rotation: table.rotation,
  }));
  const seats = assignments.flatMap((assignment) => {
    const guest = guestById.get(assignment.guestId);
    return guest && !guest.isAbsent
      ? [{ tableId: assignment.tableId, seat: assignment.seat, guestId: guest.id, guestName: guest.displayName }]
      : [];
  });
  return fingerprint(tables, seats, { chairPitch: venue.chairPitch, rooms: outlinedRooms(venue) });
}

// The same shape for a stored snapshot. A table or guest deleted since (null id) never matches the live data.
export function snapshotFingerprint(snapshot: SeatingSnapshot): string {
  const tableIdBySnapshotTable = new Map(snapshot.tables.map((table) => [table.snapshotTableId, table.tableId]));
  const tables = snapshot.tables.map((table) => ({
    tableId: table.tableId,
    name: table.name,
    roomName: table.roomName,
    seatCount: table.seatCount,
    shape: table.shape,
    x: table.x,
    y: table.y,
    rotation: table.rotation,
  }));
  const seats = snapshot.seats.map((seat) => ({
    tableId: tableIdBySnapshotTable.get(seat.snapshotTableId) ?? null,
    seat: seat.seat,
    guestId: seat.guestId,
    guestName: seat.guestName,
  }));
  return fingerprint(tables, seats, snapshot);
}

// True when publishing now would not change what the TV (and guest phones) show.
export function isUpToDate(snapshot: SeatingSnapshot | null, input: SeatingInput): boolean {
  return snapshot !== null && snapshotFingerprint(snapshot) === publishableFingerprint(input);
}

// The polling token: "<latest snapshot id>.<plan version>" (0 for none). Opaque to clients; compared for equality.
export function seatingVersion(snapshotId: number | null, planVersion: number | null): string {
  return `${snapshotId ?? 0}.${planVersion ?? 0}`;
}

// What the TV may see of a snapshot: tables in name order, seated names in seat order, the drawing (rotations,
// pitch, outlined rooms) — no ids, no pins, no absences.
export function toTvSeating(snapshot: SeatingSnapshot | null, planVersion: number | null): TvSeatingDto {
  const version = seatingVersion(snapshot?.id ?? null, planVersion);
  if (!snapshot) {
    return { version, planVersion, publishedAt: null, tables: [], chairPitch: DEFAULT_CHAIR_PITCH, rooms: [] };
  }
  const tables = [...snapshot.tables]
    .sort((a, b) => compareTableNames(a.name, b.name) || a.snapshotTableId - b.snapshotTableId)
    .map((table): TvTableDto => ({
      name: table.name,
      shape: table.shape,
      seatCount: table.seatCount,
      x: table.x,
      y: table.y,
      rotation: table.rotation,
      seats: snapshot.seats
        .filter((seat) => seat.snapshotTableId === table.snapshotTableId)
        .sort((a, b) => a.seat - b.seat)
        .map((seat) => ({ seat: seat.seat, name: seat.guestName })),
    }));
  return {
    version,
    planVersion,
    publishedAt: snapshot.publishedAt,
    tables,
    chairPitch: snapshot.chairPitch,
    rooms: snapshot.rooms.map((room) => ({ ...room })),
  };
}

// The organizer's offline readout of a snapshot (S-09): every table with its room, seated names in seat order, no
// ids. Tables by room name, then table name („Stolik 2” before „Stolik 10”), then copy order.
export function toPublishedSeating(snapshot: SeatingSnapshot | null): PublishedSeatingDto | null {
  if (!snapshot) {
    return null;
  }
  const tables = [...snapshot.tables]
    .sort(
      (a, b) =>
        compareTableNames(a.roomName, b.roomName) ||
        compareTableNames(a.name, b.name) ||
        a.snapshotTableId - b.snapshotTableId,
    )
    .map((table): PublishedTableDto => ({
      name: table.name,
      room: table.roomName,
      shape: table.shape,
      seatCount: table.seatCount,
      seats: snapshot.seats
        .filter((seat) => seat.snapshotTableId === table.snapshotTableId)
        .sort((a, b) => a.seat - b.seat)
        .map((seat) => ({ seat: seat.seat, name: seat.guestName })),
    }));
  return { snapshotId: snapshot.id, publishedAt: snapshot.publishedAt, tables };
}

// A venue edit that removes working seats (the DB does the same: FK cascade and the seat-count trigger).
export type VenueSeatChange =
  | { kind: "delete-table"; tableId: number }
  | { kind: "delete-room"; tableIds: readonly number[] }
  | { kind: "seat-count"; tableId: number; seatCount: number };

function losesSeat(occupant: SeatOccupantDto, change: VenueSeatChange): boolean {
  switch (change.kind) {
    case "delete-table":
      return occupant.tableId === change.tableId;
    case "delete-room":
      return change.tableIds.includes(occupant.tableId);
    case "seat-count":
      return occupant.tableId === change.tableId && occupant.seat > change.seatCount;
  }
}

// The occupants (pinned ones too) who lose their seat through `change`, by table and seat.
export function occupantsRemovedBy(occupancy: readonly SeatOccupantDto[], change: VenueSeatChange): SeatOccupantDto[] {
  return occupancy
    .filter((occupant) => losesSeat(occupant, change))
    .sort((a, b) => a.tableId - b.tableId || a.seat - b.seat);
}

// Who sits where according to a seating board (the venue page re-reads it when it comes back into view).
export function occupancyOf({ guestList, assignments }: Pick<SeatingInput, "guestList" | "assignments">) {
  const nameById = new Map(guestList.guests.map((guest) => [guest.id, guest.displayName]));
  return assignments.map((assignment): SeatOccupantDto => ({
    tableId: assignment.tableId,
    seat: assignment.seat,
    guestName: nameById.get(assignment.guestId) ?? "?",
  }));
}

// The occupancy once `change` has been saved (the venue page keeps it in step with the DB without reloading).
export function occupancyAfter(occupancy: readonly SeatOccupantDto[], change: VenueSeatChange): SeatOccupantDto[] {
  return occupancy.filter((occupant) => !losesSeat(occupant, change));
}

const LISTED_OCCUPANTS = 12;

// „Miejsce stracą: Ania (Okno, miejsce 7), Kuba (Okno, miejsce 8).” — empty when nobody loses a seat.
export function describeRemovedOccupants(
  removed: readonly SeatOccupantDto[],
  tableNameById: ReadonlyMap<number, string>,
): string {
  if (removed.length === 0) {
    return "";
  }
  const listed = removed
    .slice(0, LISTED_OCCUPANTS)
    .map(
      (occupant) => `${occupant.guestName} (${seatLabel(tableNameById.get(occupant.tableId) ?? "?", occupant.seat)})`,
    );
  const rest = removed.length - listed.length;
  const more = rest > 0 ? ` i ${rest} ${pluralPl(rest, "inna osoba", "inne osoby", "innych osób")}` : "";
  return `Miejsce ${removed.length === 1 ? "straci" : "stracą"}: ${listed.join(", ")}${more}.`;
}
