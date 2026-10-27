import { pluralPl } from "@/lib/guests/summary";
import { compareTableNames } from "@/lib/venue/rules";
import { sideALength } from "@/lib/venue/seats";
import type {
  PublishedSeatingDto,
  PublishedTableDto,
  SeatOccupantDto,
  SeatingSnapshot,
  TvSeatDto,
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

function fingerprint(tables: ComparableTable[], seats: ComparableSeat[]): string {
  const sortedTables = [...tables].sort((a, b) => byNumber(a.tableId, b.tableId) || a.name.localeCompare(b.name));
  const sortedSeats = [...seats].sort((a, b) => byNumber(a.tableId, b.tableId) || a.seat - b.seat);
  return JSON.stringify({
    tables: sortedTables.map((table) => [
      table.tableId,
      table.name,
      table.roomName,
      table.seatCount,
      table.shape,
      table.x,
      table.y,
    ]),
    seats: sortedSeats.map((seat) => [seat.tableId, seat.seat, seat.guestId, seat.guestName]),
  });
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
  }));
  const seats = assignments.flatMap((assignment) => {
    const guest = guestById.get(assignment.guestId);
    return guest && !guest.isAbsent
      ? [{ tableId: assignment.tableId, seat: assignment.seat, guestId: guest.id, guestName: guest.displayName }]
      : [];
  });
  return fingerprint(tables, seats);
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
  }));
  const seats = snapshot.seats.map((seat) => ({
    tableId: tableIdBySnapshotTable.get(seat.snapshotTableId) ?? null,
    seat: seat.seat,
    guestId: seat.guestId,
    guestName: seat.guestName,
  }));
  return fingerprint(tables, seats);
}

// True when publishing now would not change what the TV (and guest phones) show.
export function isUpToDate(snapshot: SeatingSnapshot | null, input: SeatingInput): boolean {
  return snapshot !== null && snapshotFingerprint(snapshot) === publishableFingerprint(input);
}

// The polling token: "<latest snapshot id>.<plan version>" (0 for none). Opaque to clients; compared for equality.
export function seatingVersion(snapshotId: number | null, planVersion: number | null): string {
  return `${snapshotId ?? 0}.${planVersion ?? 0}`;
}

// What the TV may see of a snapshot: tables in name order, seated names in seat order — no ids, no pins, no
// absences.
export function toTvSeating(snapshot: SeatingSnapshot | null, planVersion: number | null): TvSeatingDto {
  const version = seatingVersion(snapshot?.id ?? null, planVersion);
  if (!snapshot) {
    return { version, planVersion, publishedAt: null, tables: [] };
  }
  const tables = [...snapshot.tables]
    .sort((a, b) => compareTableNames(a.name, b.name) || a.snapshotTableId - b.snapshotTableId)
    .map((table): TvTableDto => ({
      name: table.name,
      shape: table.shape,
      seatCount: table.seatCount,
      x: table.x,
      y: table.y,
      seats: snapshot.seats
        .filter((seat) => seat.snapshotTableId === table.snapshotTableId)
        .sort((a, b) => a.seat - b.seat)
        .map((seat) => ({ seat: seat.seat, name: seat.guestName })),
    }));
  return { version, planVersion, publishedAt: snapshot.publishedAt, tables };
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

const ROUND_SINGLE_COLUMN_LIMIT = 8;

// The name columns of a TV table card: a rectangular table shows its two sides side by side; a round table one
// column in seat order, split in two halves when it holds more than 8 names. Empty columns are left out.
export function tableCardColumns(table: TvTableDto): TvSeatDto[][] {
  const seats = [...table.seats].sort((a, b) => a.seat - b.seat);
  let columns: TvSeatDto[][];
  if (table.shape === "rectangular") {
    const a = sideALength(table.seatCount);
    columns = [seats.filter((seat) => seat.seat <= a), seats.filter((seat) => seat.seat > a)];
  } else if (seats.length > ROUND_SINGLE_COLUMN_LIMIT) {
    const half = Math.ceil(seats.length / 2);
    columns = [seats.slice(0, half), seats.slice(half)];
  } else {
    columns = [seats];
  }
  return columns.filter((column) => column.length > 0);
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
