import type { Database } from "@/db/database.types";
import type { DietTag } from "@/lib/diets/rules";
import type { GuestModules, ModuleKey } from "@/lib/modules/rules";

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
  // guest-import-diets (S-23): diet and allergy tags (DIET_TAGS order) and the note for the kitchen (≤ 120), or none.
  // Health data: GuestDto is the organizer's (client link, panel through the dispatcher) — never a guest's or the TV's.
  diets: DietTag[];
  dietNote: string | null;
}

// --- Diets at the seat (guest-import-diets, S-23) — the kitchen's and the staff's view, no ids ---------------------

// A present guest at a published seat with a diet or a note (the name as published, like the TV).
export interface DietSeatDto {
  seat: number;
  guestName: string;
  diets: DietTag[];
  note: string | null;
}

// A published table with the seats that have a diet, in seat order.
export interface DietTableDto {
  name: string;
  room: string;
  seats: DietSeatDto[];
}

// A present guest with a diet who has no seat in the latest published snapshot (live name).
export interface DietGuestDto {
  guestName: string;
  diets: DietTag[];
  note: string | null;
}

export interface DietCountDto {
  tag: DietTag;
  count: number;
}

// tables: by room, then table name; unplaced: Polish name order; counts: DIET_TAGS order, zeros left out; guests: the
// present guests with any diet or note. Built by dietBoard() (src/lib/diets/board.ts).
export interface DietBoardDto {
  tables: DietTableDto[];
  unplaced: DietGuestDto[];
  counts: DietCountDto[];
  guests: number;
}

// One row of a guest import as it would be saved (line = the 1-based line of the file, header counted).
export interface GuestImportRowDto {
  line: number;
  name: string;
  diets: DietTag[];
  note: string | null;
}

export type GuestImportSeparator = "tab" | "semicolon" | "comma" | "none";

// POST /api/o/<key>/guests/import { text, preview: true } → the preview (nothing saved); also the body of a 400 when
// a save finds problems. problems: one localized line each („Linia 4: …”); ready: no problems and at least one row.
export interface GuestImportPreviewDto {
  rows: GuestImportRowDto[];
  problems: string[];
  header: boolean;
  separator: GuestImportSeparator;
  existing: number;
  ready: boolean;
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
  // The table's room as published (tv-room-rotation: the TV groups tables by room); a name, never an id.
  room: string;
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
  // pub-quiz (S-28): the running quiz while the module is on (null otherwise); its own layer over the spotlight.
  quiz: TvQuizDto | null;
}

// pub-quiz (S-28): the steps of a running quiz.
export type QuizPhase = "intro" | "question" | "reveal" | "results";

// pub-quiz: one question of the client's board (the client sees everything about its own quiz). `counts` = answers per
// option (index = option), `answers` their sum; `askedAt` set = shown (locked), `closedAt` set = its answers count.
export interface QuizQuestionDto {
  id: number;
  number: number;
  text: string;
  options: string[];
  correct: number;
  askedAt: string | null;
  closedAt: string | null;
  answers: number;
  counts: number[];
}

// pub-quiz: one player of the client's live standings (guests with ≥ 1 answer to a closed question), best first,
// competition places (1, 2, 2, 4).
export interface QuizStandingDto {
  place: number;
  tied: boolean;
  guestId: number;
  name: string;
  points: number;
  answered: number;
}

// pub-quiz: GET /api/o/<key>/quiz — the client's whole quiz.
export interface QuizBoardDto {
  run: { phase: QuizPhase; questionId: number | null } | null;
  questions: QuizQuestionDto[];
  standings: QuizStandingDto[];
  // Players = standings.length; closed = questions closed so far.
  closed: number;
  guestCount: number;
  maxQuestions: number;
}

// pub-quiz: the guest's OWN quiz on the phone (null while no quiz runs or the module is off). `question.id` is the
// handle for answering (re-checked under the run lock); `correct` only once the question is closed; `points` = own
// correct answers to closed questions; `result` = own place among the players at the results (null = did not play).
export interface GuestQuizDto {
  phase: QuizPhase;
  total: number;
  closed: number;
  question: { id: number; number: number; text: string; options: string[]; correct: number | null } | null;
  answer: number | null;
  points: number;
  result: { place: number; players: number } | null;
}

// pub-quiz: what the TV shows of the quiz — no ids; names only at the results (places 1–3, the PRD's exception to
// „ranking only at the organizer”); per-option counts only once the question is closed.
export interface TvQuizDto {
  phase: QuizPhase;
  total: number;
  closed: number;
  question: {
    number: number;
    text: string;
    options: string[];
    answered: number;
    correct: number | null;
    counts: number[] | null;
  } | null;
  results: { players: number; entries: { place: number; name: string; points: number }[]; more: number } | null;
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
  // event-modules: which of the phone's sections are on (questions, AI topics, the guess); in the token's hashed part.
  modules: GuestModules;
  // guest-rsvp-menu: the guest's OWN attendance answer and dish choice, null while the client has RSVP off; in the
  // token's hashed part. Never other guests' answers, counts, prices or ids.
  rsvp: GuestRsvpDto | null;
  // pub-quiz (S-28): the guest's OWN quiz while one runs and the module is on (null otherwise); in the token's hashed
  // part. Never other guests' answers, scores or names.
  quiz: GuestQuizDto | null;
}

// guest-rsvp-menu (S-25): a dish guests may pick — a menu item the event's menu offers, by name (no price, no id).
export interface RsvpOptionDto {
  name: string;
  course: MenuCourse;
}

// guest-rsvp-menu: what the guest's phone shows. `open` = before the deadline (decided by the database's clock);
// `attending` = the derived attendance (absent → false, answered → true, else null); `byOrganizer` = the client or the
// venue decided it (an absence marked without an answer counts as theirs).
export interface GuestRsvpDto {
  open: boolean;
  deadline: string;
  attending: boolean | null;
  dish: string | null;
  byOrganizer: boolean;
  options: RsvpOptionDto[];
}

// guest-rsvp-menu: one guest on the client's board.
export interface RsvpGuestDto {
  id: number;
  displayName: string;
  attending: boolean | null;
  dish: string | null;
  byOrganizer: boolean;
  answeredAt: string | null;
}

// guest-rsvp-menu: not coming = absent; coming = present and answered; no answer = present without an answer;
// dishes count the coming guests' choices (`offered` false = no longer an option the menu offers), `noDish` the
// coming guests without one. total = coming + notComing + noAnswer.
export interface RsvpCountsDto {
  total: number;
  coming: number;
  notComing: number;
  noAnswer: number;
  noDish: number;
  dishes: { name: string; course: MenuCourse; count: number; offered: boolean }[];
}

// guest-rsvp-menu: GET /api/o/<key>/rsvp (and every change) — the client's (and the staff's) whole RSVP view.
// `options` = the client's choice (available = the event's menu offers it now); `menu` = what may be chosen.
export interface RsvpBoardDto {
  deadline: string | null;
  open: boolean;
  eventDate: string;
  guestLinksOn: boolean;
  options: (RsvpOptionDto & { available: boolean })[];
  menu: RsvpOptionDto[];
  counts: RsvpCountsDto;
  guests: RsvpGuestDto[];
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
export type ResetPart =
  "guesses" | "aiUsage" | "seating" | "guests" | "venue" | "orders" | "questions" | "guestLinks" | "quiz";

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
  // pub-quiz: the quiz answers and the questions already asked (the part `quiz` clears both).
  quizAnswers: number;
  quizAsked: number;
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
  // menu-catalog-courses: the course at order time (a line from the menu); null = free text.
  course: MenuCourse | null;
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
  // menu-catalog-courses: lists are grouped by course (MENU_COURSES order), null (free text) last.
  course: MenuCourse | null;
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
  // menu-catalog-courses: the event's available menu (no catalog ids); active = new lines must come from it.
  menu: OrderMenuDto;
  // guest-import-diets (S-23): diets at the published seats and the counts (client, panel preview, both floors).
  diets: DietBoardDto;
}

// GET /api/r/<key>/orders: the restaurant's view. seating = what the TV draws (names at chairs, no ids); no prices,
// ids, keys or absences. version: opaque polling token (?since= equal → 204).
export interface RestaurantViewDto {
  version: string;
  seating: TvSeatingDto;
  prep: PrepLineDto[];
  placement: OrderPlacementDto<RestaurantItemDto>;
  totals: { quantity: number; toServe: number };
  // guest-import-diets (S-23): diets at the published seats and the counts (no ids); covered by `version`.
  diets: DietBoardDto;
}

// staff-offline-readout (S-27): what the kitchen tablet and both floors keep on the device for a readout without
// network — the tablet's view without its polling token (no prices, ids, keys or who marked a piece), plus the plan
// photo's aspect ratio measured online (the photo itself is an API answer no worker stores), for that plan version.
export interface StaffReadoutDto extends Omit<RestaurantViewDto, "version"> {
  planAspect: { planVersion: number; aspect: number } | null;
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
  // tv-room-rotation (S-20): the venue's room names, for the per-room TV links (`/tv/<key>?sala=<room>`).
  rooms: string[];
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

// event-modules: "unlock" / "lock" = the administrator unlocked (locked again) a paid module of an event.
// review-fixes: "link" = the administrator issued a one-time link (invite or password reset) for an owner („Nowy link”).
export type SupportLogKind = "enter" | "access" | "exit" | "unlock" | "lock" | "link";

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
  // event-modules: the module of an unlock / lock entry, else null.
  module: ModuleKey | null;
  // review-fixes: a link entry's link kind and the account it was issued for (e-mail snapshot), else null; `expiresAt`
  // is then the link's expiry.
  link: { kind: StaffLinkDto["kind"]; email: string } | null;
}

// GET /api/panel/restaurants/<id>/support-log (owners): newest first; `truncated` when older entries exist.
export interface SupportLogDto {
  restaurantId: number;
  entries: SupportLogEntryDto[];
  truncated: boolean;
}

// The event card as support mode shows it: everything but the links (keys never reach support mode).
export type SupportEventSummaryDto = Omit<EventCardDto, "links" | "rooms">;

// GET /api/panel/events/<id> in support mode.
export interface SupportEventAnswerDto {
  event: SupportEventSummaryDto;
  support: SupportAccessDto;
}

// venue-templates (S-15; FR-030, US-06, US-09): a restaurant's venue template — an event row with is_template, whose
// venue (plan, rooms, tables, drawing) is edited with the venue editor through /api/panel/templates/<id>/sala. Never
// keys, never guests.
export interface VenueTemplateSummaryDto {
  id: number;
  name: string;
  roomCount: number;
  tableCount: number;
  seatCount: number;
  hasPlan: boolean;
}

// GET|POST /api/panel/restaurants/<id>/templates (POST adds `template`); GET|PATCH /api/panel/templates/<id>.
export interface TemplateListAnswerDto {
  templates: VenueTemplateSummaryDto[];
  template?: VenueTemplateSummaryDto;
}

export interface TemplateAnswerDto {
  template: VenueTemplateSummaryDto;
  restaurantId: number;
}

// A guest who would lose their seat in „Zaktualizuj z szablonu” (their table is not in the template, or it has fewer
// seats there).
export interface TemplateLostSeatDto {
  guestName: string;
  table: string;
  seat: number;
}

// What „Zaktualizuj z szablonu” would change in the event's venue (match by name, case-insensitive): computed before
// the confirm, so it names everyone who loses a seat. planChange: the plan photo is replaced by the template's
// ("replaced"), removed because the template has none ("removed"), or neither has one ("none").
export interface TemplateUpdatePreviewDto {
  templateId: number;
  templateName: string;
  lost: TemplateLostSeatDto[];
  tablesAdded: string[];
  tablesRemoved: string[];
  tablesResized: string[];
  roomsAdded: string[];
  roomsRemoved: string[];
  planChange: "replaced" | "removed" | "none";
}

// The counts apply_venue_template reports (seat assignments before and after).
export interface TemplateUpdateResultDto {
  seatsBefore: number;
  seatsAfter: number;
  roomsAdded: number;
  roomsRemoved: number;
  tablesAdded: number;
  tablesRemoved: number;
  tablesKept: number;
}

// GET (preview) / POST (apply) /api/panel/events/<id>/from-template/<templateId>.
export interface TemplateUpdateAnswerDto {
  preview: TemplateUpdatePreviewDto;
  result?: TemplateUpdateResultDto;
}

// --- Menu catalog (menu-catalog-courses, S-16) ----------------------------------------------------------------------

// Stored course keys, in the kitchen's order; labels per locale in src/lib/menu/messages.ts.
export type MenuCourse = "starter" | "soup" | "main" | "dessert" | "drinks";

// off = free-text orders (v1; every event from before S-16), full = the whole catalog, reduced = chosen items.
export type EventMenuMode = "off" | "full" | "reduced";

export interface MenuItemDto {
  id: number;
  name: string;
  course: MenuCourse;
  priceGrosze: number;
}

// GET /api/panel/restaurants/<id>/menu and every catalog change: the whole catalog, by course then name.
export interface MenuCatalogDto {
  restaurantId: number;
  items: MenuItemDto[];
}

export interface EventMenuItemDto extends MenuItemDto {
  available: boolean;
}

// GET|PUT /api/panel/events/<id>/menu: the mode and every catalog item with whether this event offers it.
export interface EventMenuDto {
  eventId: number;
  mode: EventMenuMode;
  items: EventMenuItemDto[];
}

// An item of the event's available menu as the order form sees it: no ids; the price a new line gets now (the
// event's price of that name, else the catalog's).
export interface OrderMenuItemDto {
  name: string;
  course: MenuCourse;
  priceGrosze: number;
}

export interface OrderMenuDto {
  active: boolean;
  items: OrderMenuItemDto[];
}

// event-modules (S-17): one module of an event as the client, the venue and the administrator see it. `active` =
// available ∧ enabled ∧ (¬paid ∨ unlocked) — what decides the routes, pages, guest phones and the TV.
export interface EventModuleDto {
  key: ModuleKey;
  available: boolean;
  enabled: boolean;
  paid: boolean;
  unlocked: boolean;
  active: boolean;
}

export interface EventModulesDto {
  modules: EventModuleDto[];
}

// event-branding (S-18): a logo's metadata (never the bytes); `version` = epoch ms of the upload, put into the URL.
export interface LogoDto {
  mimeType: PlanImageType;
  byteSize: number;
  version: number;
}

// The brand of one event as every page of its links shows it: the restaurant's (name, colour with its readable text
// colour, logo) and the client's (company or event name, logo). No ids, no keys.
export interface BrandingDto {
  restaurant: { name: string; color: string | null; textColor: "#000000" | "#ffffff" | null; logo: LogoDto | null };
  client: { name: string | null; logo: LogoDto | null };
}

// The restaurant's brand in the panel (owner edits, manager reads).
export interface RestaurantBrandingDto {
  restaurantId: number;
  name: string;
  color: string | null;
  textColor: "#000000" | "#ffffff" | null;
  logo: LogoDto | null;
}

// --- Per-event waiters (event-waiter-access, S-21b) -----------------------------------------------------------------

// unused: link and code not used yet; redeemed: on the floor (or logged out); expired: past noon after the event.
export type EventWaiterStatus = "unused" | "redeemed" | "expired";

// One per-event waiter as the event card lists it — never a hash, a token or the code.
export interface EventWaiterDto {
  id: number;
  name: string;
  status: EventWaiterStatus;
  createdAt: string;
  expiresAt: string;
}

export interface EventWaitersDto {
  eventId: number;
  // Not archived and the floor window not over yet (today or upcoming).
  canAdd: boolean;
  waiters: EventWaiterDto[];
}

// The credentials of a new per-event waiter, shown ONCE to the person who added it: the link path (the page adds its
// origin) and the code to type on /kelner. The database keeps only their hashes.
export interface EventWaiterIssuedDto {
  id: number;
  name: string;
  path: string;
  code: string;
  expiresAt: string;
}

export interface EventWaiterAnswerDto {
  waiters: EventWaitersDto;
  issued: EventWaiterIssuedDto;
}

// --- Guest data retention (privacy-retention, S-26) --------------------------------------------------------------

// What purge_event_guest_data did to one event: not-found (unknown id or a venue template — never purged), kept
// (inside its term), clean (purged before, nothing new since), purged (deleted now; the counts say what went).
export type PurgeStatus = "not-found" | "kept" | "clean" | "purged";

export interface PurgeResultDto {
  eventId: number;
  status: PurgeStatus;
  // When the guests' data was deleted the first time (null = never).
  purgedAt: string | null;
  guests: number;
  groups: number;
  snapshots: number;
  spotlight: number;
  waiters: number;
  notes: number;
}

// GET|PATCH /api/panel/restaurants/<id>/retention: the restaurant's term (owners change it, owners and managers read it).
export interface RetentionSettingsDto {
  restaurantId: number;
  guestRetentionDays: number;
  minDays: number;
  maxDays: number;
}

// One event's retention as its pages show it: the last day the guests' data is kept ("YYYY-MM-DD", Europe/Warsaw)
// and when it was deleted (null = not yet).
export interface EventRetentionDto {
  eventDate: string;
  retentionDays: number;
  deleteAfter: string;
  purgedAt: string | null;
}

// GET /api/panel/events/<id>/export (format=json): one event's data for its restaurant's owners and managers, to keep
// before the guests' data is deleted. NO ids, link keys, tokens or hashes anywhere: guests, tables and rooms are
// referenced by name, groups by their number in this file. After a purge `guests` is empty and `purgedAt` is set.
export interface EventExportDto {
  version: 1;
  exportedAt: string;
  event: {
    name: string;
    date: string;
    restaurant: string;
    archived: boolean;
    guestData: { retentionDays: number; deleteAfter: string; purgedAt: string | null };
  };
  guests: EventExportGuestDto[];
  // Each inseparable group as its members' names (a guest's `group` is the number of its group here, from 1).
  groups: string[][];
  // null while the client asks no RSVP.
  rsvp: { deadline: string; open: boolean; options: RsvpOptionDto[] } | null;
  venue: { rooms: { name: string; tables: { name: string; shape: TableShape; seatCount: number }[] }[] };
  // The latest published seating (null before the first publish).
  seating: { publishedAt: string; tables: PublishedTableDto[] } | null;
  orders: {
    lines: EventExportOrderLineDto[];
    drinks: { name: string; quantity: number; unitPriceGrosze: number; totalGrosze: number }[];
    dishesGrosze: number;
    drinksGrosze: number;
    billGrosze: number;
  };
  guesses: { intakeOpen: boolean; correctAmountGrosze: number | null };
  // pub-quiz (S-28): the client's questions and the live standings by name (no ids).
  quiz: {
    questions: { text: string; options: string[]; correct: number; asked: boolean; closed: boolean }[];
    standings: { place: number; name: string; points: number }[];
  };
}

export interface EventExportGuestDto {
  name: string;
  absent: boolean;
  group: number | null;
  diets: DietTag[];
  dietNote: string | null;
  // The invitation answer (null while the client asks no RSVP).
  rsvp: { attending: boolean | null; dish: string | null; byOrganizer: boolean; answeredAt: string | null } | null;
  // The guest's seat in the latest published seating.
  seat: { room: string; table: string; seat: number } | null;
  guess: { amountGrosze: number; predictedPlace: number | null } | null;
}

export interface EventExportOrderLineDto {
  name: string;
  course: MenuCourse | null;
  note: string | null;
  quantity: number;
  unitPriceGrosze: number;
  totalGrosze: number;
  deliveredPieces: number;
  // For whom: a guest (by name) or the middle of a table; null = not assigned (or its guest / table is gone).
  place: { guest: string } | { table: string } | null;
}

// --- Room prints (room-prints, S-24; FR-038) — view models of the printed sheets: no ids, keys or prices ------------

// The brand on a print: names, the restaurant's colour and the logos' URLs (null without a logo, or where the page
// loads no image — support mode, the floors).
export interface PrintBrandDto {
  restaurantName: string;
  clientName: string | null;
  color: string | null;
  textColor: "#000000" | "#ffffff" | null;
  restaurantLogo: string | null;
  clientLogo: string | null;
}

// What a print page reads (getRoomPrintSource): the event, its brand, the latest PUBLISHED seating (null before the
// first publish or after the guests' data was deleted), whether the working arrangement still matches it, and — for
// the staff list only — the diets at the published seats (null for every other print).
export interface RoomPrintSourceDto {
  event: { name: string; date: string; purgedAt: string | null };
  branding: BrandingDto | null;
  published: PublishedSeatingDto | null;
  upToDate: boolean;
  diets: DietBoardDto | null;
}

// „Znajdź swój stolik”: one published seat (room null while the venue has one room only).
export interface BoardEntryDto {
  name: string;
  table: string;
  room: string | null;
}

// A row of a board column: a letter heading or a guest; `units` = rows of the column it takes (long rows wrap).
export type BoardRowDto =
  { kind: "letter"; letter: string; continued: boolean } | ({ kind: "guest"; units: number } & BoardEntryDto);

export interface BoardPageDto {
  columns: BoardRowDto[][];
}

// A table card: the table's name, its room (null with one room) and the names seated there in seat order.
export interface TableCardDto {
  name: string;
  room: string | null;
  guests: string[];
}

// A place card („winietka”): the guest's name and their published table (room null with one room).
export interface PlaceCardDto {
  name: string;
  table: string;
  room: string | null;
}

// Where place cards sit on an A4 sheet (mm). folded: the piece is two faces tall with a fold line in the middle.
export interface PlaceCardLayoutDto {
  pageWidthMm: number;
  pageHeightMm: number;
  cardWidthMm: number;
  cardHeightMm: number;
  pieceHeightMm: number;
  folded: boolean;
  columns: number;
  rows: number;
  perPage: number;
  offsetXMm: number;
  offsetYMm: number;
}

// The staff list: an occupied published seat with the guest's diet (none for a guest without one or absent since).
export interface StaffSeatDto {
  seat: number;
  name: string;
  diets: DietTag[];
  note: string | null;
  units: number;
}

export interface StaffTableDto {
  name: string;
  room: string | null;
  people: number;
  counts: DietCountDto[];
  seats: StaffSeatDto[];
}

export interface StaffListDto {
  tables: StaffTableDto[];
  // Present guests with a diet but no published seat.
  unplaced: DietGuestDto[];
  counts: DietCountDto[];
  // Present guests with a diet or a note.
  withDiets: number;
}

// One block of a staff-list page; `continued` = the rest of a block begun on an earlier page.
export type StaffBlockDto =
  | { kind: "summary"; counts: DietCountDto[]; withDiets: number }
  | { kind: "table"; table: StaffTableDto; continued: boolean }
  | { kind: "unplaced"; guests: DietGuestDto[]; continued: boolean };

export interface StaffPageDto {
  blocks: StaffBlockDto[];
}
