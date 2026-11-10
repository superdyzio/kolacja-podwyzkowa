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

// A room's rectangle on the drawing (venue-drawing): x, y = top-left corner, width, height — all fractions of the
// plan image, like table pins.
export interface RoomOutline {
  x: number;
  y: number;
  width: number;
  height: number;
}

// outline: null = the room is not drawn (its tables still are).
export interface RoomDto {
  id: number;
  name: string;
  outline: RoomOutline | null;
}

// A table with its pin: x, y are fractions 0–1 of the rendered plan image from its top-left corner (the table's
// centre on the drawing); rotation in degrees clockwise 0..359 (src/lib/venue/drawing.ts).
export interface TableDto {
  id: number;
  roomId: number;
  name: string;
  seatCount: number;
  shape: TableShape;
  x: number;
  y: number;
  rotation: number;
}

// The whole venue: plan metadata (null before the first upload), rooms in creation order, tables ordered by room
// and then by name (numeric-aware, Polish). chairPitch: distance between two chairs as a fraction of the plan width
// (the default when there is no plan); every table's drawn size follows from it.
export interface VenueDto {
  plan: VenuePlanDto | null;
  rooms: RoomDto[];
  tables: TableDto[];
  chairPitch: number;
}

// A layout read from the plan photo by AI (venue-drawing), matched against the venue: what would change if applied.
// Existing tables only move and turn (seat count and shape stay); new tables get a room; outlines only for existing
// rooms. Nothing is saved until the organizer applies the lines they keep (POST /venue/layout).
export interface LayoutTableUpdateDto {
  tableId: number;
  name: string;
  x: number;
  y: number;
  rotation: number;
  previous: { x: number; y: number; rotation: number };
}

export interface LayoutNewTableDto {
  roomId: number;
  name: string;
  shape: TableShape;
  seatCount: number;
  x: number;
  y: number;
  rotation: number;
}

export interface LayoutRoomOutlineDto {
  roomId: number;
  name: string;
  outline: RoomOutline;
  previous: RoomOutline | null;
}

export interface VenueLayoutProposalDto {
  chairPitch: number;
  previousChairPitch: number;
  // Only tables whose position or rotation would change.
  updates: LayoutTableUpdateDto[];
  newTables: LayoutNewTableDto[];
  rooms: LayoutRoomOutlineDto[];
  // Tables the AI saw that could not be offered (no room in the venue, or the table limit).
  skipped: number;
}

export interface VenueLayoutProposalAnswerDto {
  proposal: VenueLayoutProposalDto;
  // Estimated cost of this read (integer nano-dollars); 0 for the mock, null for a model without a known price.
  costNanoUsd: number | null;
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
  // 0 for snapshots published before rotations existed.
  rotation: number;
}

// A room outline as drawn (snapshot, TV, guest phone): the room name and its rectangle (fractions of the plan).
export interface DrawingRoomDto extends RoomOutline {
  name: string;
}

// A seated (present) guest in a snapshot, with the display name at publish time. guestId is null once deleted.
export interface SnapshotSeat {
  snapshotTableId: number;
  seat: number;
  guestId: number | null;
  guestName: string;
}

// A published snapshot (server-side; the base for the TV, guest phones in S-05 and the history in S-04).
// chairPitch: the default for snapshots published before the drawing existed; rooms: the outlined rooms only.
export interface SeatingSnapshot {
  id: number;
  publishedAt: string;
  tables: SnapshotTable[];
  seats: SnapshotSeat[];
  chairPitch: number;
  rooms: DrawingRoomDto[];
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
  rotation: number;
  seats: TvSeatDto[];
}

// The TV state: the latest published snapshot plus the current plan image version. version is the opaque polling
// token ("<snapshot id>.<plan version>"); publishedAt is null before the first publish. chairPitch and rooms: the
// drawing (venue-drawing), defaults before the first publish.
export interface TvSeatingDto {
  version: string;
  planVersion: number | null;
  publishedAt: string | null;
  tables: TvTableDto[];
  chairPitch: number;
  rooms: DrawingRoomDto[];
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

// A table on the guest's drawing: geometry, name and (guest-venue-names) the published names at its chairs — exactly
// what the TV shows for it (TvTableDto), never ids, keys or absences.
export type DrawingTableDto = TvTableDto;

// The published drawing as the guest's phone gets it (venue-drawing): the venue's tables and outlined rooms from the
// same snapshot as the guest's seat, every table with the names published at it (guest-venue-names; the TV's view).
// No ids, keys or absences.
export interface GuestDrawingDto {
  chairPitch: number;
  rooms: DrawingRoomDto[];
  tables: DrawingTableDto[];
}

// unpublished: nothing published yet; unseated: no seat in the latest published arrangement (absent or not seated
// when it was published); seated: `seat` is set.
export type GuestSeatStatus = "unpublished" | "unseated" | "seated";

// What a guest's phone shows (S-05) and polls for. version is the opaque polling token; name is the guest's current
// display name; planVersion is the plan image version (null before an upload); guess (S-06) is the intake flag and
// the guest's OWN guess. Nothing about other guests beyond the published seating the TV shows (seat.tablemates at
// their own table, drawing.tables[].seats everywhere), nothing about the correct amount or the ranking. drawing: the
// published venue drawing while the guest is seated (null otherwise); its snapshot is the one in the token (snapshots
// are immutable), so it needs no token part of its own.
export interface GuestStateDto {
  version: string;
  name: string;
  status: GuestSeatStatus;
  seat: GuestSeatDto | null;
  planVersion: number | null;
  guess: GuestGuessDto;
  drawing: GuestDrawingDto | null;
  // guest-delivered: the guest's own order lines, then the lines for the middle of their table (latest snapshot).
  orders: GuestOrderLineDto[];
}

// guest-delivered: an order line as a guest's phone shows it — no price, no ids of people. lineId addresses the line
// when marking a piece (the server checks it is the guest's own line or one of their table's). Every piece 1 …
// quantity, with who marked it from the guest's point of view (null = not delivered yet).
export interface GuestOrderLineDto {
  lineId: number;
  name: string;
  note: string | null;
  quantity: number;
  kind: "own" | "table";
  pieces: GuestOrderPieceDto[];
}

export type GuestPieceMarker = "you" | "guest" | "organizer";

export interface GuestOrderPieceDto {
  piece: number;
  deliveredBy: GuestPieceMarker | null;
}

// Guesses of the final raise amount (S-06). Every amount is an integer number of grosze (1 zł = 100), never a float.

// What a guest's phone may know about guesses: whether intake is open and the guest's OWN guess (null = none yet).
// Nothing about other guests, the correct amount or the ranking. guess-place: predictedPlace is the guest's own
// optional prediction of their final place (null = none); maxPlace is the highest place they may predict (the number
// of guests in the event).
export interface GuestGuessDto {
  intakeOpen: boolean;
  amountGrosze: number | null;
  predictedPlace: number | null;
  maxPlace: number;
}

// Who typed a guess in: the guest on their phone, or the organizer for them (proxy entry).
export type GuessEnteredBy = "guest" | "organizer";

// A guest on the organizer's guesses page with their guess (null = no guess yet) and their place prediction
// (guess-place; null = none).
export interface GuessGuestDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
  amountGrosze: number | null;
  predictedPlace: number | null;
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
// guess-place: predictedPlace is the guest's prediction of their own place (null = none); placeHit: the prediction
// lies within the places the entry's group spans (two people sharing place 2 span 2–3).
export interface RankingEntryDto {
  place: number;
  tied: boolean;
  guestId: number;
  displayName: string;
  isAbsent: boolean;
  amountGrosze: number;
  differenceGrosze: number;
  distanceGrosze: number;
  predictedPlace: number | null;
  placeHit: boolean;
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
export type ResetPart = "guesses" | "aiUsage" | "seating" | "guests" | "venue" | "orders" | "questions" | "guestLinks";

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
  // restaurant-orders: order lines (bill-drinks: plus the drink lines, which the part deletes too).
  orders: number;
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

// restaurant-orders: the evening's food order (src/lib/orders/). Money in integer grosze. A line is for a guest
// (served at the guest's seat in the latest published snapshot), a table (a loose line placed on the table) or
// nobody yet (guestId and tableId both null; also after its guest or table was deleted).
export interface OrderItemDto {
  id: number;
  name: string;
  note: string | null;
  quantity: number;
  unitPriceGrosze: number;
  guestId: number | null;
  tableId: number | null;
  // Every piece delivered (guest-delivered: = deliveredPieces covers 1 … quantity).
  delivered: boolean;
  // guest-delivered: the delivered pieces (1-based, ascending) and who marked each.
  deliveredPieces: number[];
  marks: OrderPieceMarkDto[];
}

// guest-delivered: one delivered piece of a line and who marked it — the organizer, or a guest on their phone
// (guestId = that guest; null once the guest was deleted).
export interface OrderPieceMarkDto {
  piece: number;
  by: "organizer" | "guest";
  guestId: number | null;
}

// What the restaurant sees of a line: no ids, no price, not who marked a piece.
export interface RestaurantItemDto {
  name: string;
  note: string | null;
  quantity: number;
  delivered: boolean;
  deliveredPieces: number[];
}

// A seated guest with their lines; guestName as published (like the TV).
export interface PlacedSeatDto<T> {
  seat: number;
  guestName: string;
  items: T[];
}

// A published table with lines: seats in order (only seats whose guest has lines), then the table's own lines.
export interface PlacedTableDto<T> {
  name: string;
  room: string;
  seats: PlacedSeatDto<T>[];
  tableItems: T[];
}

// „Do rozstawienia”: lines whose guest or table is not on the published plan (live name).
export interface UnplacedGroupDto<T> {
  kind: "guest" | "table";
  name: string;
  items: T[];
}

export interface OrderPlacementDto<T> {
  tables: PlacedTableDto<T>[];
  unplaced: UnplacedGroupDto<T>[];
  // „Nieprzypisane”: lines for nobody.
  unassigned: T[];
}

// One dish of the prep list (case-insensitive by name): toServe = the quantity not delivered yet.
export interface PrepLineDto {
  name: string;
  quantity: number;
  toServe: number;
  notes: { note: string; quantity: number }[];
}

export interface OrganizerPrepLineDto extends PrepLineDto {
  totalGrosze: number;
}

export interface OrderTotalsDto {
  lines: number;
  quantity: number;
  deliveredQuantity: number;
  totalGrosze: number;
}

// The assignment choices of the organizer's form: guests (Polish order) with their published seat, live tables.
export interface OrderGuestOptionDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
  seat: { table: string; seat: number } | null;
}

export interface OrderTableOptionDto {
  id: number;
  name: string;
  room: string;
  published: boolean;
}

// bill-drinks: one line of the drinks on the restaurant's bill, kept by the organizer only to check the bill (never
// for anyone in particular, never on a guest's phone, the TV or the restaurant's page).
export interface DrinkItemDto {
  id: number;
  name: string;
  quantity: number;
  unitPriceGrosze: number;
}

export interface DrinkTotalsDto {
  lines: number;
  quantity: number;
  totalGrosze: number;
}

// client-restaurant-split (FR-027): the venue's prices of an event — one row per dish or drink name (any letter
// case), with the price of its newest line; `mixed` when the lines of that name have different prices (data from
// before the split). GET|PUT /api/panel/events/<id>/prices.
export type PriceKind = "dish" | "drink";

export interface PriceListRowDto {
  kind: PriceKind;
  name: string;
  priceGrosze: number;
  mixed: boolean;
  lines: number;
}

export interface PriceListDto {
  rows: PriceListRowDto[];
}

// GET /api/o/<key>/orders and every mutation's answer.
export interface OrderBoardDto {
  items: OrderItemDto[];
  guests: OrderGuestOptionDto[];
  tables: OrderTableOptionDto[];
  published: boolean;
  // serving-highlight: the published drawing (what the restaurant sees), for lighting up where a dish goes.
  seating: TvSeatingDto;
  placement: OrderPlacementDto<OrderItemDto>;
  prep: OrganizerPrepLineDto[];
  // The dishes only (pieces and „wydane” count dishes).
  totals: OrderTotalsDto;
  // bill-drinks: the drinks and their sum; the bill = totals.totalGrosze + drinkTotals.totalGrosze.
  drinks: DrinkItemDto[];
  drinkTotals: DrinkTotalsDto;
}

// GET /api/r/<key>/orders: the restaurant's view. seating = what the TV draws (names at chairs, no ids); no prices,
// ids, keys or absences. version: opaque polling token (?since= equal → 204).
export interface RestaurantViewDto {
  version: string;
  seating: TvSeatingDto;
  prep: PrepLineDto[];
  placement: OrderPlacementDto<RestaurantItemDto>;
  totals: { quantity: number; toServe: number };
}

// --- Platform panel (platform-restaurants, S-10) -------------------------------------------------------------------

// An owner of a restaurant as the platform administrator sees them: no hashes, no sessions.
export interface PlatformOwnerDto {
  accountId: number;
  email: string;
  displayName: string | null;
  // false = the invitation was not accepted yet (no password set).
  hasPassword: boolean;
}

// A restaurant in the platform list: counters only, never its events, guests or keys (support access is S-13).
export interface PlatformRestaurantDto {
  id: number;
  name: string;
  disabled: boolean;
  eventCount: number;
  memberCount: number;
  owners: PlatformOwnerDto[];
}

// GET /api/panel/platform/restaurants and part of every answer of the platform API.
export interface PlatformRestaurantListDto {
  restaurants: PlatformRestaurantDto[];
}

// A one-time link for a staff account (invitation or password reset), shown once to the person who issued it.
export interface StaffLinkDto {
  kind: "invite" | "reset";
  // "/haslo/<token>"; the page adds its origin.
  path: string;
  expiresAt: string;
}

// The owner after „Załóż restaurację” or „Dodaj właściciela”: `link` is null when the account already has a password
// (the person sees the restaurant after logging in).
export interface OwnerResultDto {
  accountId: number;
  email: string;
  created: boolean;
  hasPassword: boolean;
  link: StaffLinkDto | null;
}

// --- Restaurant team (restaurant-team, S-12) -----------------------------------------------------------------------

// A member of the restaurant's team as owners and managers see it (never hashes or tokens).
export interface TeamMemberDto {
  accountId: number;
  email: string;
  displayName: string | null;
  role: "owner" | "manager" | "waiter";
  hasPassword: boolean;
}

// The team of one restaurant and who is looking at it (their account and role decide what the UI offers).
export interface TeamDto {
  restaurantId: number;
  you: { accountId: number; role: "owner" | "manager" | "waiter" };
  // Owners, then managers, then waiters; by e-mail inside a role.
  members: TeamMemberDto[];
}

// The person after „Zaproś”: `link` is a fresh invitation, or null when the e-mail already had an account (they see
// the restaurant after logging in, or after using the link they already have).
export interface TeamInviteResultDto {
  accountId: number;
  email: string;
  role: "owner" | "manager" | "waiter";
  created: boolean;
  hasPassword: boolean;
  link: StaffLinkDto | null;
}

// Every team answer: the whole team, or null when the person no longer manages it (removed themself or gave up the
// owner/manager role).
export interface TeamAnswerDto {
  team: TeamDto | null;
  invited?: TeamInviteResultDto;
  link?: StaffLinkDto;
}

// --- Restaurant events (restaurant-events, S-11) -------------------------------------------------------------------

// Where an event's day stands relative to "today" in the platform's time zone (src/lib/events/dates.ts): an event
// dated yesterday is still "today" until noon (FR-029's window).
export type EventTiming = "upcoming" | "today" | "past";

// The event's three link paths ("/o/<key>", "/tv/<key>", "/r/<key>"); the page adds its origin. Owners and managers
// only (waiters never see links).
export interface EventLinksDto {
  organizer: string;
  tv: string;
  restaurant: string;
}

// An event in the restaurant panel's lists: no keys.
export interface EventSummaryDto {
  id: number;
  name: string;
  // "YYYY-MM-DD"
  date: string;
  expectedGuests: number | null;
  archived: boolean;
  timing: EventTiming;
}

// The event card (/panel/wydarzenia/<id>): the summary plus its restaurant, guest count and links.
export interface EventCardDto extends EventSummaryDto {
  restaurantId: number;
  restaurantName: string;
  archivedAt: string | null;
  // client-restaurant-split (S-14): „Lokal prowadzi” — the staff edit the client's work, the organizer link is view-only.
  venueLeads: boolean;
  guestCount: number;
  links: EventLinksDto;
}

// GET /api/panel/restaurants/<id>/events: "today" in the platform's time zone and the three lists (upcoming = today
// and later, nearest first; past = latest first; archived = any date, latest first).
export interface RestaurantEventListDto {
  today: string;
  upcoming: EventSummaryDto[];
  past: EventSummaryDto[];
  archived: EventSummaryDto[];
}

// Every answer of the event routes that leave the event in place.
export interface EventCardAnswerDto {
  event: EventCardDto;
  role: "owner" | "manager" | "waiter";
}

// --- Platform admin's support access (admin-support-log, S-13) ------------------------------------------------------

// What a page or route opened in support mode knows about it (the banner): no grant, session or account id.
export interface SupportAccessDto {
  restaurantId: number;
  restaurantName: string;
  // Switched off by the platform admin (platform-restaurants): support mode still opens it.
  restaurantDisabled: boolean;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

// A live support session of the admin's login in one restaurant (the platform page's „Wsparcie aktywne”).
export interface SupportGrantDto {
  restaurantId: number;
  // "/panel/restauracje/<id>": where support mode starts.
  path: string;
  startedAt: string;
  expiresAt: string;
}

export type SupportLogKind = "enter" | "access" | "exit";

// One row of the owner's „Dziennik wejść administratora”: who (snapshot of the admin's e-mail and name), when, and
// what — the reason and end time of an entry, the method and path of an access (with the event's name), an exit.
export interface SupportLogEntryDto {
  id: number;
  kind: SupportLogKind;
  at: string;
  admin: { email: string; name: string | null };
  reason: string | null;
  expiresAt: string | null;
  method: string | null;
  path: string | null;
  event: { id: number; name: string } | null;
}

// GET /api/panel/restaurants/<id>/support-log (owners): newest first; `truncated` when older entries exist.
export interface SupportLogDto {
  restaurantId: number;
  entries: SupportLogEntryDto[];
  truncated: boolean;
}

// The event card as support mode shows it: everything but the links (keys never reach support mode).
export type SupportEventSummaryDto = Omit<EventCardDto, "links">;

// GET /api/panel/events/<id> in support mode.
export interface SupportEventAnswerDto {
  event: SupportEventSummaryDto;
  support: SupportAccessDto;
}
