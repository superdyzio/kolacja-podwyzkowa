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

// What the organizer put on the TV over the seating (tv-spotlight): a drawn question, an AI topic or a randomly drawn
// present guest's name. shownAt (ISO) is new for every show, so the TV notices a fresh draw. No ids.
export type TvSpotlightKind = "question" | "topic" | "person";

export interface TvSpotlightDto {
  kind: TvSpotlightKind;
  text: string;
  shownAt: string;
}

// The organizer's TV controls: every answer of /api/o/<key>/tv-spotlight[/person] (null = the TV shows the plan).
export interface TvSpotlightAnswerDto {
  spotlight: TvSpotlightDto | null;
}

// Everything the TV shows: the published seating plus the spotlight. version is the opaque polling token
// ("<snapshot id>.<plan version>.<spotlight id>"), compared for equality only.
export interface TvScreenDto extends TvSeatingDto {
  spotlight: TvSpotlightDto | null;
}

// The organizer's view of the latest published arrangement (S-09 offline readout): names on seats with the room, no
// ids. seats: seated guests only, in seat order.
export interface PublishedTableDto {
  name: string;
  room: string;
  shape: TableShape;
  seatCount: number;
  seats: TvSeatDto[];
}

// tables: by room name, then by table name (numeric-aware, Polish).
export interface PublishedSeatingDto {
  snapshotId: number;
  publishedAt: string;
  tables: PublishedTableDto[];
}

// GET /api/o/<key>/seating/published — null before the first publish.
export interface PublishedSeatingResponseDto {
  published: PublishedSeatingDto | null;
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

// How a tablemate sits relative to the guest (seats.ts): side = right next to them, opposite = across a rectangular
// table; null = elsewhere at the same table.
export type TablemateRelation = "side" | "opposite";

// Someone else at the guest's table in the same published snapshot: the seat and the name as published (exactly what
// the TV shows for that table). No ids, keys or absence flags.
export interface TablemateDto {
  seat: number;
  name: string;
  relation: TablemateRelation | null;
}

// The guest's own seat in the latest PUBLISHED arrangement (from the snapshot, like the TV): table name, room name,
// seat number, and the table's shape, seat count and pin (x, y fractions of the plan image). No ids. tablemates:
// everyone else at that table in the same snapshot, in seat order.
export interface GuestSeatDto {
  table: string;
  room: string;
  seat: number;
  shape: TableShape;
  seatCount: number;
  x: number;
  y: number;
  tablemates: TablemateDto[];
}

// unpublished: nothing published yet; unseated: no seat in the latest published arrangement (absent or not seated
// when it was published); seated: `seat` is set.
export type GuestSeatStatus = "unpublished" | "unseated" | "seated";

// What a guest's phone shows (S-05) and polls for. version is the opaque polling token; name is the guest's current
// display name; planVersion is the plan image version (null before an upload); guess (S-06) is the intake flag and
// the guest's OWN guess. Nothing about other guests beyond the published names at their own table (seat.tablemates),
// nothing about the correct amount or the ranking.
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

// Conversation questions (S-07). The category values are stored as is and shared with S-08's AI topics
// (src/lib/questions/categories.ts has the order, labels and the guard).
export type QuestionCategory = "kontrowersyjne" | "generyczne" | "refleksyjne";

export type QuestionRow = Tables["question"]["Row"];

// One question as the organizer manages it, and the one question a draw returns (to whoever drew it only).
export interface QuestionDto {
  id: number;
  category: QuestionCategory;
  text: string;
}

// The organizer's question base: questions in category order, then by id; starterMissing = how many starter
// questions are not in the base (the "Wczytaj bazę startową" button adds them).
export interface QuestionListDto {
  questions: QuestionDto[];
  starterMissing: number;
}

// Why a pasted line was not added: duplicate = already in the base; repeated = an earlier line of the same paste;
// too-short / too-long = outside 5–300 characters.
export type QuestionSkipReason = "duplicate" | "repeated" | "too-short" | "too-long";

// A skipped pasted line (1-based line number, counting blank lines; text normalized).
export interface QuestionSkipDto {
  line: number;
  text: string;
  reason: QuestionSkipReason;
}

// Answer to a paste: what was added (count) and what was skipped, plus the whole base.
export interface QuestionPasteResultDto extends QuestionListDto {
  added: number;
  skipped: QuestionSkipDto[];
}

// Answer to "Wczytaj bazę startową": how many starter questions were added, plus the whole base.
export interface StarterLoadResultDto extends QuestionListDto {
  added: number;
}

// Answer to a draw: the drawn question, or null when the chosen category (or the whole base) is empty.
export interface QuestionDrawDto {
  question: QuestionDto | null;
}

// AI conversation topics (S-08). A topic is shown only to whoever generated it; the server keeps only the attempt
// (who, category, state), never the text.
export interface AiTopicDto {
  category: QuestionCategory;
  text: string;
}

// A guest's own quota: used = succeeded + in-flight attempts; eventExhausted = the evening pool (300) is used up.
export interface GuestAiQuotaDto {
  limit: number;
  used: number;
  remaining: number;
  eventExhausted: boolean;
}

// The evening's usage (organizer only): used = succeeded + in-flight attempts of everyone; failed attempts never count.
// Tokens = what the provider billed this evening (since the last „Licznik tematów AI” reset), successes and failures
// after an answer alike; costNanoUsd = an estimate at list prices in nano-dollars (null when a model has no price in
// the app) — never the account balance. lastFailureHint = why the latest finished attempt failed (Polish, the same
// text as the organizer's own failure hint), null when it succeeded or there is none.
export interface AiTopicUsageDto {
  used: number;
  limit: number;
  failed: number;
  guestLimit: number;
  inputTokens: number;
  outputTokens: number;
  costNanoUsd: number | null;
  lastFailureHint: string | null;
}

export type AiProviderKind = "mock" | "anthropic";

// Which AI answers (organizer only): kind null = AI_PROVIDER has an unknown value; ready false = every attempt fails
// at once and `problem` says why (Polish, never the key).
export interface AiProviderStatusDto {
  kind: AiProviderKind | null;
  model: string | null;
  ready: boolean;
  problem: string | null;
}

// GET /api/o/<key>/ai-topics.
export interface AiTopicBoardDto {
  usage: AiTopicUsageDto;
  provider: AiProviderStatusDto;
}

// POST /api/g/<key>/ai-topics → 200. Error bodies are { error, quota }.
export interface GuestAiTopicAnswerDto {
  topic: AiTopicDto;
  quota: GuestAiQuotaDto;
}

// POST /api/o/<key>/ai-topics → 200. Error bodies are { error, hint?, usage }.
export interface OrganizerAiTopicAnswerDto {
  topic: AiTopicDto;
  usage: AiTopicUsageDto;
}

// Organizer reset („Reset danych”). Part ids in canonical order (src/lib/reset/parts.ts has the labels, texts and
// implications: guests ⇒ guesses, aiUsage, seating; venue ⇒ seating).
export type ResetPart = "guesses" | "aiUsage" | "seating" | "guests" | "venue" | "questions" | "guestLinks";

// What a reset would remove (and the flags it would change), read in one query (DB function reset_counts).
export interface ResetCountsDto {
  guesses: number;
  correctAmountSet: boolean;
  intakeOpen: boolean;
  // Every attempt row; aiUsed = the evening's used topics (succeeded + in flight).
  aiAttempts: number;
  aiUsed: number;
  // Working seats (pinned ones included) and published snapshots.
  seats: number;
  pinned: number;
  snapshots: number;
  guests: number;
  groups: number;
  plan: boolean;
  rooms: number;
  tables: number;
  questions: number;
  guestAccessEnabled: boolean;
}

// GET /api/o/<key>/reset: fresh counts for the modal; starterQuestions = how many the questions part puts back.
export interface ResetPreviewDto {
  counts: ResetCountsDto;
  starterQuestions: number;
}

// POST /api/o/<key>/reset → 200: the parts really reset (implied ones added, canonical order), the counts read inside
// the reset transaction before anything was removed, and the Polish summary lines.
export interface ResetResultDto {
  parts: ResetPart[];
  before: ResetCountsDto;
  questionsAdded: number;
  guestKeysReplaced: number;
  summary: string[];
}
