import { generateAccessKey } from "@/lib/access/keys";
import { EVENT_ID } from "@/lib/event";
import { getGuestList } from "@/lib/guests/service";
import { getLatestSnapshot, getPlanVersion } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { getVenue } from "@/lib/venue/service";
import type { GuestListDto, OrderBoardDto, OrderItemDto, RestaurantViewDto, SeatingSnapshot, VenueDto } from "@/types";
import type { OrderAssignmentInput } from "./api";
import { placeOrders, type PlacementSource } from "./placement";
import { organizerPrepList } from "./prep";
import { toRestaurantView } from "./restaurant";
import { MAX_ORDER_ITEMS, orderTotals } from "./rules";

// The evening's food order and the restaurant link (restaurant-orders) for the singleton event. Functions take the
// client as a parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw;
// expected outcomes come back as status unions. Inputs are already normalized and validated (rules.ts).

const ITEM_COLUMNS = "id, name, note, quantity, unit_price_grosze, guest_id, table_id, delivered";
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
  delivered: boolean;
}

function toItemDto(row: ItemRow): OrderItemDto {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    quantity: row.quantity,
    unitPriceGrosze: row.unit_price_grosze,
    guestId: row.guest_id,
    tableId: row.table_id,
    delivered: row.delivered,
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
    placement: placeOrders(items, source, (item) => item),
    prep: organizerPrepList(items),
    totals: orderTotals(items),
  };
}

// Everything the organizer's order page shows.
export async function getOrderBoard(db: DbClient): Promise<OrderBoardDto> {
  const [items, guestList, venue, snapshot] = await Promise.all([
    getOrderItems(db),
    getGuestList(db),
    getVenue(db),
    getLatestSnapshot(db),
  ]);
  return toOrderBoard(items, guestList, venue, snapshot);
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
      ...(patch.delivered === undefined ? {} : { delivered: patch.delivered }),
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
  return data.length > 0 ? { status: "updated" } : { status: "not-found" };
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
