import { generateAccessKey } from "@/lib/access/keys";
import { EVENT_ID } from "@/lib/event";
import { getGuestList } from "@/lib/guests/service";
import { toTvSeating } from "@/lib/seating/published";
import { getLatestSnapshot, getPlanVersion } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { getVenue } from "@/lib/venue/service";
import type {
  DrinkItemDto,
  GuestListDto,
  GuestOrderLineDto,
  OrderBoardDto,
  OrderItemDto,
  RestaurantViewDto,
  SeatingSnapshot,
  VenueDto,
} from "@/types";
import type { OrderAssignmentInput } from "./api";
import { drinkTotals } from "./drinks";
import { getDrinkItems } from "./drinks-service";
import { isLineDelivered, toGuestOrderLines, toPieceMarks, type PieceMarkRow } from "./pieces";
import { placeOrders, type PlacementSource } from "./placement";
import { organizerPrepList } from "./prep";
import { toRestaurantView } from "./restaurant";
import { MAX_ORDER_ITEMS, orderTotals } from "./rules";

// The evening's food order and the restaurant link (restaurant-orders) for the singleton event. Functions take the
// client as a parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw;
// expected outcomes come back as status unions. Inputs are already normalized and validated (rules.ts).

// guest-delivered: the marked pieces come embedded (order_piece rows); `delivered` is derived from them.
const ITEM_COLUMNS =
  "id, name, note, quantity, unit_price_grosze, guest_id, table_id, order_piece(piece, marked_by, guest_id)";
const FOREIGN_KEY_VIOLATION = "23503";

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

interface ItemRow {
  id: number;
  name: string;
  note: string | null;
  quantity: number;
  unit_price_grosze: number;
  guest_id: number | null;
  table_id: number | null;
  order_piece: PieceMarkRow[];
}

function toItemDto(row: ItemRow): OrderItemDto {
  const { marks, deliveredPieces } = toPieceMarks(row.order_piece.filter((mark) => mark.piece <= row.quantity));
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    quantity: row.quantity,
    unitPriceGrosze: row.unit_price_grosze,
    guestId: row.guest_id,
    tableId: row.table_id,
    delivered: isLineDelivered({ quantity: row.quantity, deliveredPieces }),
    deliveredPieces,
    marks,
  };
}

export async function getOrderItems(db: DbClient): Promise<OrderItemDto[]> {
  const { data, error } = await db.from("order_item").select(ITEM_COLUMNS).eq("event_id", EVENT_ID).order("id");
  if (error) {
    fail("odczytać zamówienia", error.message);
  }
  return data.map(toItemDto);
}

function placementSource(guestList: GuestListDto, venue: VenueDto, snapshot: SeatingSnapshot | null): PlacementSource {
  const rooms = new Map(venue.rooms.map((room) => [room.id, room.name]));
  return {
    guests: new Map(guestList.guests.map((guest) => [guest.id, guest.displayName])),
    tables: new Map(venue.tables.map((table) => [table.id, { name: table.name, room: rooms.get(table.roomId) ?? "" }])),
    snapshot,
  };
}

export function toOrderBoard(
  items: OrderItemDto[],
  guestList: GuestListDto,
  venue: VenueDto,
  snapshot: SeatingSnapshot | null,
  drinks: DrinkItemDto[],
): OrderBoardDto {
  const source = placementSource(guestList, venue, snapshot);
  const snapshotTables = new Map(snapshot?.tables.map((table) => [table.snapshotTableId, table]) ?? []);
  const seats = new Map(
    (snapshot?.seats ?? []).flatMap((seat) =>
      seat.guestId === null
        ? []
        : [[seat.guestId, { table: snapshotTables.get(seat.snapshotTableId)?.name ?? "?", seat: seat.seat }] as const],
    ),
  );
  const publishedTableIds = new Set(snapshot?.tables.map((table) => table.tableId) ?? []);
  return {
    items,
    guests: guestList.guests.map((guest) => ({
      id: guest.id,
      displayName: guest.displayName,
      isAbsent: guest.isAbsent,
      seat: seats.get(guest.id) ?? null,
    })),
    tables: venue.tables.map((table) => ({
      id: table.id,
      name: table.name,
      room: source.tables.get(table.id)?.room ?? "",
      published: publishedTableIds.has(table.id),
    })),
    published: snapshot !== null,
    seating: toTvSeating(snapshot, venue.plan?.version ?? null),
    placement: placeOrders(items, source, (item) => item),
    prep: organizerPrepList(items),
    totals: orderTotals(items),
    drinks,
    drinkTotals: drinkTotals(drinks),
  };
}

// Everything the organizer's order page shows (bill-drinks: with the drinks on the bill — the organizer's board is
// the only reader of drink_item).
export async function getOrderBoard(db: DbClient): Promise<OrderBoardDto> {
  const [items, guestList, venue, snapshot, drinks] = await Promise.all([
    getOrderItems(db),
    getGuestList(db),
    getVenue(db),
    getLatestSnapshot(db),
    getDrinkItems(db),
  ]);
  return toOrderBoard(items, guestList, venue, snapshot, drinks);
}

// What the restaurant sees (one read of everything, then a fingerprint; see restaurant.ts).
export async function getRestaurantView(db: DbClient): Promise<RestaurantViewDto> {
  const [items, guestList, venue, snapshot, planVersion] = await Promise.all([
    getOrderItems(db),
    getGuestList(db),
    getVenue(db),
    getLatestSnapshot(db),
    getPlanVersion(db),
  ]);
  return toRestaurantView(items, placementSource(guestList, venue, snapshot), planVersion);
}

export interface OrderItemInput {
  name: string;
  note: string | null;
  quantity: number;
  unitPriceGrosze: number;
  assignment: OrderAssignmentInput;
}

function assignmentColumns(assignment: OrderAssignmentInput): { guest_id: number | null; table_id: number | null } {
  if (assignment === null) {
    return { guest_id: null, table_id: null };
  }
  return "guestId" in assignment
    ? { guest_id: assignment.guestId, table_id: null }
    : { guest_id: null, table_id: assignment.tableId };
}

export type AddOrderItemResult = { status: "added" } | { status: "too-many" } | { status: "place-gone" };

export async function addOrderItem(db: DbClient, input: OrderItemInput): Promise<AddOrderItemResult> {
  const counted = await db.from("order_item").select("id", { count: "exact", head: true }).eq("event_id", EVENT_ID);
  if (counted.error) {
    fail("dodać pozycji zamówienia", counted.error.message);
  }
  if ((counted.count ?? 0) >= MAX_ORDER_ITEMS) {
    return { status: "too-many" };
  }
  const { error } = await db.from("order_item").insert({
    event_id: EVENT_ID,
    name: input.name,
    note: input.note,
    quantity: input.quantity,
    unit_price_grosze: input.unitPriceGrosze,
    ...assignmentColumns(input.assignment),
  });
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "place-gone" };
    }
    fail("dodać pozycji zamówienia", error.message);
  }
  return { status: "added" };
}

// delivered: the whole line („Wydane”) — every piece marked by the organizer, or every mark removed (guest-delivered).
export type OrderItemPatch = Partial<OrderItemInput> & { delivered?: boolean };

export type UpdateOrderItemResult = { status: "updated" } | { status: "not-found" } | { status: "place-gone" };

export async function updateOrderItem(db: DbClient, id: number, patch: OrderItemPatch): Promise<UpdateOrderItemResult> {
  const { data, error } = await db
    .from("order_item")
    .update({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.unitPriceGrosze === undefined ? {} : { unit_price_grosze: patch.unitPriceGrosze }),
      ...(patch.assignment === undefined ? {} : assignmentColumns(patch.assignment)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("event_id", EVENT_ID)
    .select("id");
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "place-gone" };
    }
    fail("zmienić pozycji zamówienia", error.message);
  }
  if (data.length === 0) {
    return { status: "not-found" };
  }
  if (patch.delivered !== undefined) {
    // After the other fields: a new quantity has already dropped the marks above it (trigger).
    const marked = await markOrderPieces(db, id, null, patch.delivered);
    if (marked.status === "not-found") {
      return { status: "not-found" };
    }
  }
  return { status: "updated" };
}

// --- Delivered pieces (guest-delivered) ----------------------------------------------------------------------------

export type MarkPiecesResult =
  { status: "marked" } | { status: "not-found" } | { status: "out-of-range" } | { status: "marked-by-organizer" };

// One RPC: the line is locked, the guest's right to it checked, the pieces marked (the first mark of a piece stays)
// or unmarked, and order_item.delivered kept in step — all in one transaction (set_order_pieces).
async function setOrderPieces(
  db: DbClient,
  itemId: number,
  pieces: number[] | null,
  delivered: boolean,
  guestId: number | null,
): Promise<MarkPiecesResult> {
  const { error } = await db.rpc("set_order_pieces", {
    p_item_id: itemId,
    p_pieces: pieces,
    p_delivered: delivered,
    p_guest_id: guestId,
  });
  if (!error) {
    return { status: "marked" };
  }
  switch (error.message) {
    case "ITEM_NOT_FOUND":
      return { status: "not-found" };
    case "PIECE_OUT_OF_RANGE":
      return { status: "out-of-range" };
    case "MARKED_BY_ORGANIZER":
      return { status: "marked-by-organizer" };
    default:
      return fail("oznaczyć wydania", error.message);
  }
}

// The organizer marks (or unmarks) pieces of a line; pieces null = the whole line. Unmarking removes anyone's mark.
export function markOrderPieces(
  db: DbClient,
  itemId: number,
  pieces: number[] | null,
  delivered: boolean,
): Promise<MarkPiecesResult> {
  return setOrderPieces(db, itemId, pieces, delivered, null);
}

// A guest marks (or unmarks) one piece: only of their own lines and of their table's lines in the latest published
// snapshot (else not-found), never undoing the organizer's mark (marked-by-organizer).
export function markGuestPiece(
  db: DbClient,
  guestId: number,
  itemId: number,
  piece: number,
  delivered: boolean,
): Promise<MarkPiecesResult> {
  return setOrderPieces(db, itemId, [piece], delivered, guestId);
}

// What the guest's phone shows of the order: their own lines, then their table's lines (one RPC; also on the 204
// poll path, so the token sees a tablemate's mark).
export async function getGuestOrders(db: DbClient, guestId: number): Promise<GuestOrderLineDto[]> {
  const { data, error } = await db.rpc("guest_order_lines", { p_guest_id: guestId });
  if (error) {
    fail("odczytać zamówienia gościa", error.message);
  }
  return toGuestOrderLines(data, guestId);
}

export type DeleteOrderItemResult = { status: "deleted" } | { status: "not-found" };

export async function deleteOrderItem(db: DbClient, id: number): Promise<DeleteOrderItemResult> {
  const { data, error } = await db.from("order_item").delete().eq("id", id).eq("event_id", EVENT_ID).select("id");
  if (error) {
    fail("usunąć pozycji zamówienia", error.message);
  }
  return data.length > 0 ? { status: "deleted" } : { status: "not-found" };
}

// „Wymień link”: a fresh restaurant key; the old link opens nothing from now on. Returns the new key.
export async function rotateRestaurantKey(db: DbClient): Promise<string> {
  const key = generateAccessKey();
  const { error } = await db.from("event").update({ restaurant_key: key }).eq("id", EVENT_ID);
  if (error) {
    fail("wymienić linku restauracji", error.message);
  }
  return key;
}
