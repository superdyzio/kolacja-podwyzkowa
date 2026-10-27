import type { Database } from "@/db/database.types";
import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import type {
  PlanImageType,
  RoomDto,
  TableDto,
  VenueDto,
  VenuePlanDto,
  VenuePlanRow,
  VenueRoomRow,
  VenueTableRow,
} from "@/types";
import { MAX_PLAN_BYTES, base64ToBytes, bytesToBase64, isPlanImageType, sniffImageType } from "./image";
import {
  MAX_ROOMS,
  MAX_TABLES,
  compareTableNames,
  isTableShape,
  normalizeVenueName,
  roundFraction,
  validateRoomName,
  validateTableFields,
  type TableFieldProblem,
  type TableFields,
  type VenueNameProblem,
} from "./rules";

// Venue plan image, rooms and tables (PRD FR-005, FR-006) for the singleton event. Functions take the client as a
// parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw; expected
// outcomes (not found, duplicate name, limits, invalid fields) come back as status unions.
//
// The image (base64) is read only by getPlanImage(); every other query selects plan metadata only.

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const ROOM_FOREIGN_KEY = "venue_table_room_id_fkey";

const PLAN_METADATA_COLUMNS = "mime_type, byte_size, updated_at";
const ROOM_COLUMNS = "id, name";
const TABLE_COLUMNS = "id, room_id, name, seat_count, shape, pos_x, pos_y";

type PlanMetadata = Pick<VenuePlanRow, "mime_type" | "byte_size" | "updated_at">;
type RoomColumns = Pick<VenueRoomRow, "id" | "name">;
type TableColumns = Pick<VenueTableRow, "id" | "room_id" | "name" | "seat_count" | "shape" | "pos_x" | "pos_y">;
type TableUpdate = Database["public"]["Tables"]["venue_table"]["Update"];

export type SavePlanResult =
  { status: "saved"; plan: VenuePlanDto } | { status: "too-large"; limit: number } | { status: "unsupported-type" };

export interface PlanImage {
  mimeType: PlanImageType;
  bytes: Uint8Array<ArrayBuffer>;
  version: number;
}

export type AddRoomResult =
  | { status: "added"; room: RoomDto }
  | { status: "invalid"; reason: VenueNameProblem }
  | { status: "duplicate" }
  | { status: "too-many"; limit: number };

export type RenameRoomResult =
  | { status: "renamed"; room: RoomDto }
  | { status: "invalid"; reason: VenueNameProblem }
  | { status: "duplicate" }
  | { status: "not-found" };

export type DeleteRoomResult = { status: "deleted"; tablesDeleted: number } | { status: "not-found" };

export type AddTableResult =
  | { status: "added"; table: TableDto }
  | { status: "invalid"; problem: TableFieldProblem }
  | { status: "duplicate" }
  | { status: "room-not-found" }
  | { status: "too-many"; limit: number };

export type UpdateTableResult =
  | { status: "updated"; table: TableDto }
  | { status: "invalid"; problem: TableFieldProblem }
  | { status: "duplicate" }
  | { status: "room-not-found" }
  | { status: "not-found" };

export type DeleteTableResult = { status: "deleted" } | { status: "not-found" };

export type TablePatch = Partial<TableFields>;

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function toPlanDto(row: PlanMetadata): VenuePlanDto {
  if (!isPlanImageType(row.mime_type)) {
    fail("odczytać planu", `nieznany typ obrazu ${row.mime_type}`);
  }
  return { mimeType: row.mime_type, byteSize: row.byte_size, version: Date.parse(row.updated_at) };
}

function toRoomDto(row: RoomColumns): RoomDto {
  return { id: row.id, name: row.name };
}

function toTableDto(row: TableColumns): TableDto {
  if (!isTableShape(row.shape)) {
    fail("odczytać stolika", `nieznany typ stolika ${row.shape}`);
  }
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    seatCount: row.seat_count,
    shape: row.shape,
    x: row.pos_x,
    y: row.pos_y,
  };
}

// Plan metadata, rooms in creation order, tables ordered by their room and then by name („Stolik 2” < „Stolik 10”).
export async function getVenue(db: DbClient): Promise<VenueDto> {
  const [plan, rooms, tables] = await Promise.all([
    db.from("venue_plan").select(PLAN_METADATA_COLUMNS).eq("event_id", EVENT_ID).maybeSingle(),
    db.from("venue_room").select(ROOM_COLUMNS).order("id"),
    db.from("venue_table").select(TABLE_COLUMNS),
  ]);
  if (plan.error) {
    fail("odczytać planu", plan.error.message);
  }
  if (rooms.error) {
    fail("odczytać sal", rooms.error.message);
  }
  if (tables.error) {
    fail("odczytać stolików", tables.error.message);
  }

  const roomOrder = new Map(rooms.data.map((room, index) => [room.id, index]));
  const sortedTables = tables.data
    .map(toTableDto)
    .sort(
      (a, b) =>
        (roomOrder.get(a.roomId) ?? 0) - (roomOrder.get(b.roomId) ?? 0) ||
        compareTableNames(a.name, b.name) ||
        a.id - b.id,
    );

  return {
    plan: plan.data ? toPlanDto(plan.data) : null,
    rooms: rooms.data.map(toRoomDto),
    tables: sortedTables,
  };
}

// The stored image with its sniffed type, or null before the first upload.
export async function getPlanImage(db: DbClient): Promise<PlanImage | null> {
  const { data, error } = await db
    .from("venue_plan")
    .select("mime_type, image_base64, updated_at")
    .eq("event_id", EVENT_ID)
    .maybeSingle();
  if (error) {
    fail("odczytać planu", error.message);
  }
  if (!data) {
    return null;
  }
  if (!isPlanImageType(data.mime_type)) {
    fail("odczytać planu", `nieznany typ obrazu ${data.mime_type}`);
  }
  return { mimeType: data.mime_type, bytes: base64ToBytes(data.image_base64), version: Date.parse(data.updated_at) };
}

// Uploads or replaces the plan. The type comes from the magic bytes; tables and their pins are untouched.
export async function savePlanImage(db: DbClient, bytes: Uint8Array): Promise<SavePlanResult> {
  if (bytes.length > MAX_PLAN_BYTES) {
    return { status: "too-large", limit: MAX_PLAN_BYTES };
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    return { status: "unsupported-type" };
  }
  const { data, error } = await db
    .from("venue_plan")
    .upsert(
      {
        event_id: EVENT_ID,
        mime_type: mimeType,
        byte_size: bytes.length,
        image_base64: bytesToBase64(bytes),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    )
    .select(PLAN_METADATA_COLUMNS)
    .single();
  if (error) {
    fail("zapisać planu", error.message);
  }
  return { status: "saved", plan: toPlanDto(data) };
}

async function countRows(db: DbClient, table: "venue_room" | "venue_table", action: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) {
    fail(action, error.message);
  }
  return count ?? 0;
}

export async function addRoom(db: DbClient, rawName: string): Promise<AddRoomResult> {
  const name = normalizeVenueName(rawName);
  const reason = validateRoomName(name);
  if (reason) {
    return { status: "invalid", reason };
  }
  if ((await countRows(db, "venue_room", "policzyć sal")) >= MAX_ROOMS) {
    return { status: "too-many", limit: MAX_ROOMS };
  }
  const { data, error } = await db.from("venue_room").insert({ name }).select(ROOM_COLUMNS).single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("dodać sali", error.message);
  }
  return { status: "added", room: toRoomDto(data) };
}

export async function renameRoom(db: DbClient, id: number, rawName: string): Promise<RenameRoomResult> {
  const name = normalizeVenueName(rawName);
  const reason = validateRoomName(name);
  if (reason) {
    return { status: "invalid", reason };
  }
  const { data, error } = await db.from("venue_room").update({ name }).eq("id", id).select(ROOM_COLUMNS).maybeSingle();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("zmienić nazwy sali", error.message);
  }
  return data ? { status: "renamed", room: toRoomDto(data) } : { status: "not-found" };
}

// Deletes a room together with its tables (FK on delete cascade); S-03 seat assignments at them go too.
export async function deleteRoom(db: DbClient, id: number): Promise<DeleteRoomResult> {
  const { count, error: countError } = await db
    .from("venue_table")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id);
  if (countError) {
    fail("policzyć stolików", countError.message);
  }
  const { data, error } = await db.from("venue_room").delete().eq("id", id).select("id");
  if (error) {
    fail("usunąć sali", error.message);
  }
  return data.length > 0 ? { status: "deleted", tablesDeleted: count ?? 0 } : { status: "not-found" };
}

// Names normalized; positions rounded to 4 decimals (after validation).
function toTableUpdate(fields: TablePatch): TableUpdate {
  const update: TableUpdate = {};
  if (fields.roomId !== undefined) {
    update.room_id = fields.roomId;
  }
  if (fields.name !== undefined) {
    update.name = fields.name;
  }
  if (fields.seatCount !== undefined) {
    update.seat_count = fields.seatCount;
  }
  if (fields.shape !== undefined) {
    update.shape = fields.shape;
  }
  if (fields.x !== undefined && fields.y !== undefined) {
    update.pos_x = roundFraction(fields.x);
    update.pos_y = roundFraction(fields.y);
  }
  return update;
}

function normalizeName<T extends TablePatch>(fields: T): T {
  return fields.name === undefined ? fields : { ...fields, name: normalizeVenueName(fields.name) };
}

type TableWriteError = { status: "duplicate" } | { status: "room-not-found" };

function tableWriteError(error: { code: string; message: string }, action: string): TableWriteError {
  if (error.code === UNIQUE_VIOLATION) {
    return { status: "duplicate" };
  }
  if (error.code === FOREIGN_KEY_VIOLATION && error.message.includes(ROOM_FOREIGN_KEY)) {
    return { status: "room-not-found" };
  }
  fail(action, error.message);
}

export async function addTable(db: DbClient, input: TableFields): Promise<AddTableResult> {
  const fields = normalizeName(input);
  const problem = validateTableFields(fields);
  if (problem) {
    return { status: "invalid", problem };
  }
  if ((await countRows(db, "venue_table", "policzyć stolików")) >= MAX_TABLES) {
    return { status: "too-many", limit: MAX_TABLES };
  }
  const { data, error } = await db
    .from("venue_table")
    .insert({
      room_id: fields.roomId,
      name: fields.name,
      seat_count: fields.seatCount,
      shape: fields.shape,
      pos_x: roundFraction(fields.x),
      pos_y: roundFraction(fields.y),
    })
    .select(TABLE_COLUMNS)
    .single();
  if (error) {
    return tableWriteError(error, "dodać stolika");
  }
  return { status: "added", table: toTableDto(data) };
}

// Changes any of a table's fields (the pin needs x and y together). Seating rules for seat-count changes and
// deletions belong to S-03 (see the venue migration).
export async function updateTable(db: DbClient, id: number, patch: TablePatch): Promise<UpdateTableResult> {
  const fields = normalizeName(patch);
  const problem = validateTableFields(fields);
  if (problem) {
    return { status: "invalid", problem };
  }
  const update = toTableUpdate(fields);
  const query =
    Object.keys(update).length > 0
      ? db.from("venue_table").update(update).eq("id", id).select(TABLE_COLUMNS).maybeSingle()
      : db.from("venue_table").select(TABLE_COLUMNS).eq("id", id).maybeSingle();
  const { data, error } = await query;
  if (error) {
    return tableWriteError(error, "zmienić stolika");
  }
  return data ? { status: "updated", table: toTableDto(data) } : { status: "not-found" };
}

export async function deleteTable(db: DbClient, id: number): Promise<DeleteTableResult> {
  const { data, error } = await db.from("venue_table").delete().eq("id", id).select("id");
  if (error) {
    fail("usunąć stolika", error.message);
  }
  return data.length > 0 ? { status: "deleted" } : { status: "not-found" };
}
