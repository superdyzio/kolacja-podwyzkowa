import type { Database } from "@/db/database.types";

// Shared entity types (DB rows and DTOs).

type Tables = Database["public"]["Tables"];

export type EventRow = Tables["event"]["Row"];
export type GuestRow = Tables["guest"]["Row"];
export type GuestGroupRow = Tables["guest_group"]["Row"];

// A guest as the organizer UI and later slices see it.
export interface GuestDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
  // The inseparable group this guest belongs to (at most one), or null.
  groupId: number | null;
}

// An inseparable group of 2–5 guests; memberIds in the same (Polish alphabetical) order as the guest list.
export interface GuestGroupDto {
  id: number;
  memberIds: number[];
}

// The whole guest list: guests in Polish alphabetical order, groups ordered by their first member.
export interface GuestListDto {
  guests: GuestDto[];
  groups: GuestGroupDto[];
}

export type VenuePlanRow = Tables["venue_plan"]["Row"];
export type VenueRoomRow = Tables["venue_room"]["Row"];
export type VenueTableRow = Tables["venue_table"]["Row"];

// Plan image types the app accepts (recognized by magic bytes, never by the client's header).
export type PlanImageType = "image/png" | "image/jpeg" | "image/webp";

// round: seats 1..n clockwise; rectangular: side A then side B (see src/lib/venue/seats.ts).
export type TableShape = "round" | "rectangular";

// Plan metadata (never the image itself). `version` (epoch ms of the last upload) goes into the image URL so a
// replaced plan gets a new URL.
export interface VenuePlanDto {
  mimeType: PlanImageType;
  byteSize: number;
  version: number;
}

export interface RoomDto {
  id: number;
  name: string;
}

// A table with its pin: x, y are fractions 0–1 of the rendered plan image from its top-left corner.
export interface TableDto {
  id: number;
  roomId: number;
  name: string;
  seatCount: number;
  shape: TableShape;
  x: number;
  y: number;
}

// The whole venue: plan metadata (null before the first upload), rooms in creation order, tables ordered by room
// and then by name (numeric-aware, Polish).
export interface VenueDto {
  plan: VenuePlanDto | null;
  rooms: RoomDto[];
  tables: TableDto[];
}

export type SeatAssignmentRow = Tables["seat_assignment"]["Row"];
export type SeatingSnapshotRow = Tables["seating_snapshot"]["Row"];
export type SeatingSnapshotTableRow = Tables["seating_snapshot_table"]["Row"];
export type SeatingSnapshotSeatRow = Tables["seating_snapshot_seat"]["Row"];

// A guest's seat in the working arrangement (what the organizer edits). pinned: the guest is locked to this seat.
export interface SeatAssignmentDto {
  guestId: number;
  tableId: number;
  seat: number;
  pinned: boolean;
}

// The latest published snapshot: its id is the published version.
export interface PublicationDto {
  snapshotId: number;
  publishedAt: string;
}

// Everything the organizer seating page needs. upToDate: publishing now would not change what the TV shows.
export interface SeatingBoardDto {
  guestList: GuestListDto;
  venue: VenueDto;
  assignments: SeatAssignmentDto[];
  published: PublicationDto | null;
  upToDate: boolean;
}

// A venue table as it was when a snapshot was published (renders without the live venue). tableId is null once the
// table has been deleted.
export interface SnapshotTable {
  snapshotTableId: number;
  tableId: number | null;
  roomName: string;
  name: string;
  seatCount: number;
  shape: TableShape;
  x: number;
  y: number;
}

// A seated (present) guest in a snapshot, with the display name at publish time. guestId is null once deleted.
export interface SnapshotSeat {
  snapshotTableId: number;
  seat: number;
  guestId: number | null;
  guestName: string;
}

// A published snapshot (server-side; the base for the TV, guest phones in S-05 and the history in S-04).
export interface SeatingSnapshot {
  id: number;
  publishedAt: string;
  tables: SnapshotTable[];
  seats: SnapshotSeat[];
}

// What the TV may see: names on seats, no ids, pins, absences or keys.
export interface TvSeatDto {
  seat: number;
  name: string;
}

export interface TvTableDto {
  name: string;
  shape: TableShape;
  seatCount: number;
  x: number;
  y: number;
  seats: TvSeatDto[];
}

// The TV state: the latest published snapshot plus the current plan image version. version is the opaque polling
// token ("<snapshot id>.<plan version>"); publishedAt is null before the first publish.
export interface TvSeatingDto {
  version: string;
  planVersion: number | null;
  publishedAt: string | null;
  tables: TvTableDto[];
}

// One row of a drawn draft (or a restored snapshot) for the working arrangement: a non-pinned present guest on a seat.
export interface DraftSeatDto {
  guestId: number;
  tableId: number;
  seat: number;
}

// The neighbour history (S-04): how many arrangements were published and every pair of guest ids that sat next to
// each other in any of them ([smaller, larger], sorted). Organizer only.
export interface NeighbourHistoryDto {
  snapshotCount: number;
  pairs: [number, number][];
}

// Who sits where in the working arrangement, for the venue page's "who loses their seat" confirmations.
export interface SeatOccupantDto {
  tableId: number;
  seat: number;
  guestName: string;
}
