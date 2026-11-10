import { isDietTag } from "@/lib/diets/rules";
import { floorWindowEnd } from "@/lib/floor/rules";
import { isMenuCourse } from "@/lib/menu/rules";
import { toRestaurantItem } from "@/lib/orders/restaurant";
import type {
  DietBoardDto,
  OrderBoardDto,
  OrderPlacementDto,
  PrepLineDto,
  RestaurantItemDto,
  RestaurantViewDto,
  StaffReadoutDto,
  TvSeatingDto,
} from "@/types";
import { offlineOwner } from "./cache";

// The staff's offline readout (staff-offline-readout, S-27; PRD v2 NFR-017, FR-047, US-08): the kitchen tablet
// (/r/<key>), the staff floor (/panel/obsluga/<id>) and the per-event waiter's floor (/kelner/sala/<id>) keep the last
// state of their event in this browser — the tablet's own view (the published seating, the prep list by course, where
// to serve what with the delivered pieces, the totals, the diets) plus the plan photo's aspect ratio, never prices,
// ids, keys or who marked a piece. One fixed localStorage key per area (no key in the names); every copy is tagged
// with its scope's owner (the link, or the event and the account / the waiter) and expires when the floor window ends
// (noon Europe/Warsaw the day after the event), so nothing — the diets included — outlives the event day on a
// device. Storage is never trusted: every read is validated in depth. Pure: no DB, no `astro:*`, no `window`.

export type StaffReadoutArea = "tablet" | "floor" | "waiter";

export const STAFF_READOUT_AREAS: readonly StaffReadoutArea[] = ["tablet", "floor", "waiter"];

export const STAFF_READOUT_STORAGE_KEYS: Readonly<Record<StaffReadoutArea, string>> = {
  tablet: "kolacja-podwyzkowa:odczyt:tablet",
  floor: "kolacja-podwyzkowa:odczyt:sala",
  waiter: "kolacja-podwyzkowa:odczyt:kelner",
};

export const STAFF_READOUT_VERSION = 1;

// Where the live pages of an area live: the readout worker's scope kinds and what logging out clears.
export const STAFF_READOUT_PATH_PREFIXES: Readonly<Record<StaffReadoutArea, string>> = {
  tablet: "/r/",
  floor: "/panel/obsluga/",
  waiter: "/kelner/sala/",
};

// What a page hands its island (computed on the server): no secret and no saved data. owner: who may read the copy;
// expiresAt: when the copy stops existing; apiBase: the live API (its `/orders` is the read); livePath: the live
// page (= the readout worker's scope); readoutPath: livePath + "/odczyt".
export interface StaffReadoutScope {
  area: StaffReadoutArea;
  owner: string;
  expiresAt: string;
  apiBase: string;
  livePath: string;
  readoutPath: string;
}

export interface StaffOfflineEntry {
  v: typeof STAFF_READOUT_VERSION;
  area: StaffReadoutArea;
  owner: string;
  // ISO time of the last successful read from the server (not of the last change).
  savedAt: string;
  expiresAt: string;
  data: StaffReadoutDto;
}

// Only the three live APIs keep a copy; the client's page and the panel's preview reuse the same islands without one.
const API_BASES: Readonly<Record<StaffReadoutArea, RegExp>> = {
  tablet: /^\/api\/r\/[A-Za-z0-9_-]{24}$/,
  floor: /^\/api\/panel\/events\/[1-9][0-9]*\/obsluga$/,
  waiter: /^\/api\/kelner\/sala\/[1-9][0-9]*$/,
};

export function isStaffReadoutApiBase(area: StaffReadoutArea, apiBase: string): boolean {
  return API_BASES[area].test(apiBase);
}

// FNV-1a over the area and the parts: tells two scopes apart, says nothing about a key.
export function staffReadoutOwner(area: StaffReadoutArea, ...parts: readonly (string | number)[]): string {
  return offlineOwner([area, ...parts.map(String)].join("|"));
}

function scope(area: StaffReadoutArea, owner: string, expiresAt: string, apiBase: string, livePath: string) {
  return { area, owner, expiresAt, apiBase, livePath, readoutPath: `${livePath}/odczyt` };
}

// The kitchen tablet of one link (a replaced link is another owner).
export function tabletReadoutScope(key: string, eventDate: string): StaffReadoutScope {
  const livePath = `/r/${key}`;
  return scope("tablet", staffReadoutOwner("tablet", livePath), floorWindowEnd(eventDate), `/api${livePath}`, livePath);
}

// The staff floor of one event for one account (another account on the same device never reads it).
export function floorReadoutScope(eventId: number, accountId: number, eventDate: string): StaffReadoutScope {
  const id = String(eventId);
  return scope(
    "floor",
    staffReadoutOwner("floor", eventId, accountId),
    floorWindowEnd(eventDate),
    `/api/panel/events/${id}/obsluga`,
    `/panel/obsluga/${id}`,
  );
}

// The per-event waiter's floor for one waiter (a waiter added again is a new id); the earlier of the floor window's
// end and the waiter's own expiry.
export function waiterReadoutScope(
  eventId: number,
  waiterId: number,
  eventDate: string,
  waiterExpiresAt: string,
): StaffReadoutScope {
  const id = String(eventId);
  const windowEnd = floorWindowEnd(eventDate);
  const expiresAt = Date.parse(waiterExpiresAt) < Date.parse(windowEnd) ? waiterExpiresAt : windowEnd;
  return scope(
    "waiter",
    staffReadoutOwner("waiter", eventId, waiterId),
    new Date(expiresAt).toISOString(),
    `/api/kelner/sala/${id}`,
    `/kelner/sala/${id}`,
  );
}

// --- The copy -------------------------------------------------------------------------------------------------------

export type PlanAspect = StaffReadoutDto["planAspect"];

export function staffReadoutFromView(view: RestaurantViewDto, planAspect: PlanAspect): StaffReadoutDto {
  return {
    seating: view.seating,
    prep: view.prep,
    placement: view.placement,
    totals: view.totals,
    diets: view.diets,
    planAspect,
  };
}

function placementOf<T>(placement: OrderPlacementDto<T>, item: (line: T) => RestaurantItemDto) {
  return {
    tables: placement.tables.map((table) => ({
      name: table.name,
      room: table.room,
      seats: table.seats.map((seat) => ({ seat: seat.seat, guestName: seat.guestName, items: seat.items.map(item) })),
      tableItems: table.tableItems.map(item),
    })),
    unplaced: placement.unplaced.map((group) => ({ kind: group.kind, name: group.name, items: group.items.map(item) })),
    unassigned: placement.unassigned.map(item),
  };
}

// A floor's board as the tablet sees it: the lines without ids, prices or marks, the prep list without amounts, no
// guests' or tables' lists, no drinks, menu or bill.
export function staffReadoutFromBoard(board: OrderBoardDto, planAspect: PlanAspect): StaffReadoutDto {
  return {
    seating: board.seating,
    prep: board.prep.map((line): PrepLineDto => ({
      course: line.course,
      name: line.name,
      quantity: line.quantity,
      toServe: line.toServe,
      notes: line.notes.map((note) => ({ note: note.note, quantity: note.quantity })),
    })),
    placement: placementOf(board.placement, toRestaurantItem),
    totals: { quantity: board.totals.quantity, toServe: board.totals.quantity - board.totals.deliveredQuantity },
    diets: board.diets,
    planAspect,
  };
}

// --- Validation -----------------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCount(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDateString(value: unknown): value is string {
  return isString(value) && !Number.isNaN(Date.parse(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isArrayOf<T>(value: unknown, item: (element: unknown) => element is T): value is T[] {
  return Array.isArray(value) && value.every(item);
}

function isSeating(value: unknown): value is TvSeatingDto {
  return (
    isRecord(value) &&
    isString(value.version) &&
    (value.planVersion === null || isCount(value.planVersion)) &&
    (value.publishedAt === null || isDateString(value.publishedAt)) &&
    isFiniteNumber(value.chairPitch) &&
    isArrayOf(value.rooms, (room): room is TvSeatingDto["rooms"][number] => {
      return (
        isRecord(room) &&
        isString(room.name) &&
        isFiniteNumber(room.x) &&
        isFiniteNumber(room.y) &&
        isFiniteNumber(room.width) &&
        isFiniteNumber(room.height)
      );
    }) &&
    isArrayOf(value.tables, (table): table is TvSeatingDto["tables"][number] => {
      return (
        isRecord(table) &&
        isString(table.name) &&
        isString(table.room) &&
        (table.shape === "round" || table.shape === "rectangular") &&
        isCount(table.seatCount, 1) &&
        isFiniteNumber(table.x) &&
        isFiniteNumber(table.y) &&
        isFiniteNumber(table.rotation) &&
        isArrayOf(table.seats, (seat): seat is { seat: number; name: string } => {
          return isRecord(seat) && isCount(seat.seat, 1) && isString(seat.name);
        })
      );
    })
  );
}

function isPrepLine(value: unknown): value is PrepLineDto {
  return (
    isRecord(value) &&
    (value.course === null || isMenuCourse(value.course)) &&
    isString(value.name) &&
    isCount(value.quantity) &&
    isCount(value.toServe) &&
    isArrayOf(value.notes, (note): note is PrepLineDto["notes"][number] => {
      return isRecord(note) && isString(note.note) && isCount(note.quantity);
    })
  );
}

function isItem(value: unknown): value is RestaurantItemDto {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isNullableString(value.note) &&
    isCount(value.quantity, 1) &&
    typeof value.delivered === "boolean" &&
    isArrayOf(value.deliveredPieces, (piece): piece is number => isCount(piece, 1))
  );
}

function isPlacement(value: unknown): value is OrderPlacementDto<RestaurantItemDto> {
  return (
    isRecord(value) &&
    isArrayOf(value.tables, (table): table is OrderPlacementDto<RestaurantItemDto>["tables"][number] => {
      return (
        isRecord(table) &&
        isString(table.name) &&
        isString(table.room) &&
        isArrayOf(table.seats, (seat): seat is { seat: number; guestName: string; items: RestaurantItemDto[] } => {
          return isRecord(seat) && isCount(seat.seat, 1) && isString(seat.guestName) && isArrayOf(seat.items, isItem);
        }) &&
        isArrayOf(table.tableItems, isItem)
      );
    }) &&
    isArrayOf(value.unplaced, (group): group is OrderPlacementDto<RestaurantItemDto>["unplaced"][number] => {
      return (
        isRecord(group) &&
        (group.kind === "guest" || group.kind === "table") &&
        isString(group.name) &&
        isArrayOf(group.items, isItem)
      );
    }) &&
    isArrayOf(value.unassigned, isItem)
  );
}

function isDietSeat(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value.seat, 1) &&
    isString(value.guestName) &&
    isArrayOf(value.diets, isDietTag) &&
    isNullableString(value.note)
  );
}

function isDiets(value: unknown): value is DietBoardDto {
  return (
    isRecord(value) &&
    isArrayOf(value.tables, (table): table is DietBoardDto["tables"][number] => {
      return (
        isRecord(table) &&
        isString(table.name) &&
        isString(table.room) &&
        Array.isArray(table.seats) &&
        table.seats.every(isDietSeat)
      );
    }) &&
    isArrayOf(value.unplaced, (guest): guest is DietBoardDto["unplaced"][number] => {
      return (
        isRecord(guest) &&
        isString(guest.guestName) &&
        isArrayOf(guest.diets, isDietTag) &&
        isNullableString(guest.note)
      );
    }) &&
    isArrayOf(value.counts, (count): count is DietBoardDto["counts"][number] => {
      return isRecord(count) && isDietTag(count.tag) && isCount(count.count, 1);
    }) &&
    isCount(value.guests)
  );
}

function isPlanAspect(value: unknown): value is PlanAspect {
  return (
    value === null ||
    (isRecord(value) && isCount(value.planVersion) && isFiniteNumber(value.aspect) && value.aspect > 0)
  );
}

export function isStaffReadout(value: unknown): value is StaffReadoutDto {
  return (
    isRecord(value) &&
    isSeating(value.seating) &&
    isArrayOf(value.prep, isPrepLine) &&
    isPlacement(value.placement) &&
    isRecord(value.totals) &&
    isCount(value.totals.quantity) &&
    isCount(value.totals.toServe) &&
    value.totals.toServe <= value.totals.quantity &&
    isDiets(value.diets) &&
    isPlanAspect(value.planAspect)
  );
}

function isArea(value: unknown): value is StaffReadoutArea {
  return value === "tablet" || value === "floor" || value === "waiter";
}

// --- The envelope ---------------------------------------------------------------------------------------------------

// The copy to store, or null when it would already be expired (e.g. a tablet opened after the window: nothing kept).
export function staffOfflineEntry(
  readoutScope: StaffReadoutScope,
  data: StaffReadoutDto,
  savedAt: string,
): StaffOfflineEntry | null {
  if (Date.parse(savedAt) >= Date.parse(readoutScope.expiresAt)) {
    return null;
  }
  return {
    v: STAFF_READOUT_VERSION,
    area: readoutScope.area,
    owner: readoutScope.owner,
    savedAt,
    expiresAt: readoutScope.expiresAt,
    data,
  };
}

export function serializeStaffOfflineEntry(entry: StaffOfflineEntry | null): string {
  return JSON.stringify(entry);
}

// The stored text's shape only (the local store caches the parse per text, so the clock is checked by the reader).
export function parseStaffOfflineEntry(raw: string | null): StaffOfflineEntry | null {
  if (raw === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    value.v !== STAFF_READOUT_VERSION ||
    !isArea(value.area) ||
    !isString(value.owner) ||
    value.owner === "" ||
    !isDateString(value.savedAt) ||
    !isDateString(value.expiresAt) ||
    !isStaffReadout(value.data)
  ) {
    return null;
  }
  return {
    v: STAFF_READOUT_VERSION,
    area: value.area,
    owner: value.owner,
    savedAt: value.savedAt,
    expiresAt: value.expiresAt,
    data: value.data,
  };
}

export function isExpired(entry: Pick<StaffOfflineEntry, "expiresAt">, now: Date): boolean {
  return now.getTime() >= Date.parse(entry.expiresAt);
}

// The entry itself (same object) when it is this scope's and not expired, else null.
export function liveStaffEntry(
  entry: StaffOfflineEntry | null,
  readoutScope: Pick<StaffReadoutScope, "area" | "owner">,
  now: Date,
): StaffOfflineEntry | null {
  return entry?.area === readoutScope.area && entry.owner === readoutScope.owner && !isExpired(entry, now)
    ? entry
    : null;
}

// --- Reading from the server ----------------------------------------------------------------------------------------

// The app's own denial: a 404 (the key or event guard) or a 401 (no staff or waiter session) with the private header
// every guarded answer carries — a captive portal's or a proxy's error never wipes a copy.
export function isAppDenial(response: Pick<Response, "status" | "headers">): boolean {
  return (
    (response.status === 404 || response.status === 401) &&
    (response.headers.get("x-robots-tag") ?? "").includes("noindex")
  );
}

export type StaffReadResult = { status: "ok"; data: StaffReadoutDto } | { status: "offline" } | { status: "gone" };

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

const OFFLINE: StaffReadResult = { status: "offline" };

// One read of the area's live state (GET <apiBase>/orders: the tablet's view or the floor's board) turned into the
// copy. Also the readout page's connectivity check: no answer, a slow one (the caller aborts), a server error or a
// body that is not ours → offline; the app's denial → gone.
export async function readStaffReadoutOnce(
  readoutScope: Pick<StaffReadoutScope, "area" | "apiBase">,
  planAspect: PlanAspect,
  fetchFn: FetchFunction,
  signal: AbortSignal,
): Promise<StaffReadResult> {
  let response: Response;
  try {
    response = await fetchFn(`${readoutScope.apiBase}/orders`, { signal, cache: "no-store" });
  } catch {
    return OFFLINE;
  }
  if (isAppDenial(response)) {
    return { status: "gone" };
  }
  if (response.status !== 200) {
    return OFFLINE;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return OFFLINE;
  }
  let data: StaffReadoutDto;
  try {
    data =
      readoutScope.area === "tablet"
        ? staffReadoutFromView(body as RestaurantViewDto, planAspect)
        : staffReadoutFromBoard(body as OrderBoardDto, planAspect);
  } catch {
    return OFFLINE;
  }
  if (!isStaffReadout(data) || signal.aborted) {
    return OFFLINE;
  }
  return { status: "ok", data };
}
