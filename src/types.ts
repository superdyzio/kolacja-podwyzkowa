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
// previous: the snapshot published before the latest one ("back to the previous arrangement", S-04), or null.
export interface SeatingBoardDto {
  guestList: GuestListDto;
  venue: VenueDto;
  assignments: SeatAssignmentDto[];
  published: PublicationDto | null;
  previous: PublicationDto | null;
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

// One guest's personal link (S-05, organizer only): key opens /g/<key>.
export interface GuestLinkDto {
  id: number;
  displayName: string;
  key: string;
}

// The organizer's links page: the guest-access switch and every guest's link (Polish alphabetical order).
export interface GuestLinksDto {
  enabled: boolean;
  guests: GuestLinkDto[];
}

// The guest's own seat in the latest PUBLISHED arrangement (from the snapshot, like the TV): table name, room name,
// seat number, and the table's shape, seat count and pin (x, y fractions of the plan image). No ids.
export interface GuestSeatDto {
  table: string;
  room: string;
  seat: number;
  shape: TableShape;
  seatCount: number;
  x: number;
  y: number;
}

// unpublished: nothing published yet; unseated: no seat in the latest published arrangement (absent or not seated
// when it was published); seated: `seat` is set.
export type GuestSeatStatus = "unpublished" | "unseated" | "seated";

// What a guest's phone shows (S-05) and polls for. version is the opaque polling token; name is the guest's current
// display name; planVersion is the plan image version (null before an upload); guess (S-06) is the intake flag and
// the guest's OWN guess. Nothing about other guests, the correct amount or the ranking.
export interface GuestStateDto {
  version: string;
  name: string;
  status: GuestSeatStatus;
  seat: GuestSeatDto | null;
  planVersion: number | null;
  guess: GuestGuessDto;
}

// Guesses of the final raise amount (S-06). Every amount is an integer number of grosze (1 zł = 100), never a float.

// What a guest's phone may know about guesses: whether intake is open and the guest's OWN guess (null = none yet).
// Nothing about other guests, the correct amount or the ranking.
export interface GuestGuessDto {
  intakeOpen: boolean;
  amountGrosze: number | null;
}

// Who typed a guess in: the guest on their phone, or the organizer for them (proxy entry).
export type GuessEnteredBy = "guest" | "organizer";

// A guest on the organizer's guesses page with their guess (null = no guess yet).
export interface GuessGuestDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
  amountGrosze: number | null;
  enteredBy: GuessEnteredBy | null;
}

// A guest who has not guessed yet (absent guests included, marked).
export interface MissingGuessDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
}

// One ranked guess. place: competition ranking by distance (1, 2, 2, 4); tied: the place is shared.
// differenceGrosze = guess − correct (negative: too low); distanceGrosze = |differenceGrosze|.
export interface RankingEntryDto {
  place: number;
  tied: boolean;
  guestId: number;
  displayName: string;
  isAbsent: boolean;
  amountGrosze: number;
  differenceGrosze: number;
  distanceGrosze: number;
}

// The ranking (organizer only), self-contained so it renders without anything else (S-09 caches it for offline
// reading). entries: best first (place ascending; inside a place by Polish name, then id).
export interface GuessRankingDto {
  correctAmountGrosze: number;
  entries: RankingEntryDto[];
}

// The organizer's guesses page. guests: every guest in Polish alphabetical order; missing: guests without a guess;
// ranking: null until the correct amount is entered.
export interface GuessBoardDto {
  intakeOpen: boolean;
  correctAmountGrosze: number | null;
  guests: GuessGuestDto[];
  missing: MissingGuessDto[];
  ranking: GuessRankingDto | null;
}
