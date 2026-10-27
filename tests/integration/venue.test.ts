import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import {
  MAX_PLAN_BYTES,
  MAX_ROOMS,
  MAX_TABLES,
  addRoom,
  addTable,
  deleteRoom,
  deleteTable,
  getPlanImage,
  getVenue,
  renameRoom,
  savePlanImage,
  updateTable,
  type TableFields,
} from "@/lib/venue";
import type { RoomDto, TableDto } from "@/types";
import {
  TINY_PNG,
  acquireTestEvent,
  deleteTestPlan,
  deleteTestRooms,
  hasLocalDb,
  localDb,
  planExists,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

// A PNG signature followed by every byte value, repeated up to `length` bytes (generated in memory).
function pngLikePayload(length: number): Uint8Array {
  const payload = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    payload[index] = (index * 7 + 92) % 256;
  }
  payload.set(TINY_PNG.subarray(0, 8));
  return payload;
}

describe.skipIf(!hasLocalDb)("venue service", () => {
  let db: DbClient;
  let event: TestEvent;
  // The plan is a singleton: its cases run only when no real plan exists before the suite.
  let planWasPresent = true;
  const tag = testTag();
  const createdRooms: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    planWasPresent = await planExists(db);
  });

  afterEach(async () => {
    await deleteTestRooms(db, createdRooms.splice(0));
  });

  afterAll(async () => {
    if (!planWasPresent) {
      await deleteTestPlan(db);
    }
    await releaseEvent(db, event);
  });

  async function room(name: string): Promise<RoomDto> {
    const result = await addRoom(db, name);
    if (result.status !== "added") {
      throw new Error(`room ${name}: ${result.status}`);
    }
    createdRooms.push(result.room.id);
    return result.room;
  }

  function fields(roomId: number, name: string, extra: Partial<TableFields> = {}): TableFields {
    return { roomId, name, seatCount: 8, shape: "round", x: 0.5, y: 0.5, ...extra };
  }

  async function table(roomId: number, name: string, extra: Partial<TableFields> = {}): Promise<TableDto> {
    const result = await addTable(db, fields(roomId, name, extra));
    if (result.status !== "added") {
      throw new Error(`table ${name}: ${result.status}`);
    }
    return result.table;
  }

  describe("rooms", () => {
    it("adds, renames and deletes a room", async () => {
      const added = await room(`  Sala   ${tag}  `);
      expect(added.name).toBe(`Sala ${tag}`);
      expect((await getVenue(db)).rooms).toContainEqual(added);

      const renamed = await renameRoom(db, added.id, `Ogród ${tag}`);
      expect(renamed).toEqual({ status: "renamed", room: { id: added.id, name: `Ogród ${tag}` } });

      expect(await deleteRoom(db, added.id)).toEqual({ status: "deleted", tablesDeleted: 0 });
      expect((await getVenue(db)).rooms.map((r) => r.id)).not.toContain(added.id);
    });

    it("refuses a name that exists in another letter case or spacing", async () => {
      await room(`Sala ${tag}`);
      expect(await addRoom(db, `SALA   ${tag.toUpperCase()}`)).toEqual({ status: "duplicate" });
      const other = await room(`Inna ${tag}`);
      expect(await renameRoom(db, other.id, `sala ${tag}`)).toEqual({ status: "duplicate" });
    });

    it("refuses empty and too long names", async () => {
      expect(await addRoom(db, "  ")).toEqual({ status: "invalid", reason: "empty" });
      expect(await addRoom(db, "x".repeat(41))).toEqual({ status: "invalid", reason: "too-long" });
      const added = await room(`Sala ${tag}`);
      expect(await renameRoom(db, added.id, "")).toEqual({ status: "invalid", reason: "empty" });
    });

    it("reports unknown rooms", async () => {
      expect(await renameRoom(db, UNKNOWN_ID, "Nowa")).toEqual({ status: "not-found" });
      expect(await deleteRoom(db, UNKNOWN_ID)).toEqual({ status: "not-found" });
    });

    it(`allows at most ${MAX_ROOMS} rooms`, async ({ skip }) => {
      const existing = (await getVenue(db)).rooms.length;
      if (existing >= MAX_ROOMS) {
        skip();
      }
      for (let index = existing; index < MAX_ROOMS; index++) {
        await room(`Limit ${tag} ${index}`);
      }
      expect(await addRoom(db, `Limit ${tag} extra`)).toEqual({ status: "too-many", limit: MAX_ROOMS });
    });
  });

  describe("tables", () => {
    it("adds a table with its pin and reads it back", async () => {
      const hall = await room(`Sala ${tag}`);
      const added = await table(hall.id, `  Okno   ${tag} `, {
        seatCount: 6,
        shape: "rectangular",
        x: 0.123456,
        y: 0.98765,
      });
      const expected: TableDto = {
        id: added.id,
        roomId: hall.id,
        name: `Okno ${tag}`,
        seatCount: 6,
        shape: "rectangular",
        x: 0.1235,
        y: 0.9877,
      };
      expect(added).toEqual(expected);
      expect((await getVenue(db)).tables).toContainEqual(expected);
    });

    it("keeps table names unique across rooms, regardless of letter case", async () => {
      const first = await room(`A ${tag}`);
      const second = await room(`B ${tag}`);
      await table(first.id, `Okno ${tag}`);
      expect(await addTable(db, fields(second.id, `OKNO ${tag.toUpperCase()}`))).toEqual({ status: "duplicate" });
    });

    it("refuses invalid fields", async () => {
      const hall = await room(`Sala ${tag}`);
      const invalid = (extra: Partial<TableFields>) => addTable(db, fields(hall.id, `T ${tag}`, extra));
      expect(await invalid({ seatCount: 1 })).toEqual({ status: "invalid", problem: { field: "seatCount" } });
      expect(await invalid({ seatCount: 21 })).toEqual({ status: "invalid", problem: { field: "seatCount" } });
      expect(await invalid({ x: -0.1 })).toEqual({ status: "invalid", problem: { field: "position" } });
      expect(await invalid({ y: 1.1 })).toEqual({ status: "invalid", problem: { field: "position" } });
      expect(await invalid({ x: Number.NaN })).toEqual({ status: "invalid", problem: { field: "position" } });
      expect(await invalid({ name: " " })).toEqual({
        status: "invalid",
        problem: { field: "name", reason: "empty" },
      });
      expect((await getVenue(db)).tables.filter((t) => t.roomId === hall.id)).toEqual([]);
    });

    it("refuses an unknown room", async () => {
      expect(await addTable(db, fields(UNKNOWN_ID, `T ${tag}`))).toEqual({ status: "room-not-found" });
    });

    it("updates every field", async () => {
      const first = await room(`A ${tag}`);
      const second = await room(`B ${tag}`);
      const added = await table(first.id, `T ${tag}`);
      const result = await updateTable(db, added.id, {
        roomId: second.id,
        name: `Kominek ${tag}`,
        seatCount: 12,
        shape: "rectangular",
        x: 0.25,
        y: 0.75,
      });
      expect(result).toEqual({
        status: "updated",
        table: {
          id: added.id,
          roomId: second.id,
          name: `Kominek ${tag}`,
          seatCount: 12,
          shape: "rectangular",
          x: 0.25,
          y: 0.75,
        },
      });
    });

    it("reports edit problems", async () => {
      const hall = await room(`Sala ${tag}`);
      const first = await table(hall.id, `T1 ${tag}`);
      await table(hall.id, `T2 ${tag}`);
      expect(await updateTable(db, first.id, { name: `t2 ${tag}` })).toEqual({ status: "duplicate" });
      expect(await updateTable(db, first.id, { roomId: UNKNOWN_ID })).toEqual({ status: "room-not-found" });
      expect(await updateTable(db, first.id, { x: 0.3 })).toEqual({
        status: "invalid",
        problem: { field: "position" },
      });
      expect(await updateTable(db, first.id, { seatCount: 0 })).toEqual({
        status: "invalid",
        problem: { field: "seatCount" },
      });
      expect(await updateTable(db, UNKNOWN_ID, { seatCount: 4 })).toEqual({ status: "not-found" });
    });

    it("deletes a table", async () => {
      const hall = await room(`Sala ${tag}`);
      const added = await table(hall.id, `T ${tag}`);
      expect(await deleteTable(db, added.id)).toEqual({ status: "deleted" });
      expect(await deleteTable(db, added.id)).toEqual({ status: "not-found" });
    });

    it("deletes a room together with its tables", async () => {
      const hall = await room(`Sala ${tag}`);
      const one = await table(hall.id, `T1 ${tag}`);
      const two = await table(hall.id, `T2 ${tag}`);
      expect(await deleteRoom(db, hall.id)).toEqual({ status: "deleted", tablesDeleted: 2 });
      const ids = (await getVenue(db)).tables.map((t) => t.id);
      expect(ids).not.toContain(one.id);
      expect(ids).not.toContain(two.id);
    });

    it("orders tables by room, then by name with numbers by value", async () => {
      const first = await room(`A ${tag}`);
      const second = await room(`B ${tag}`);
      await table(second.id, `S${tag} 1`);
      await table(first.id, `S${tag} 10`);
      await table(first.id, `S${tag} 2`);
      const names = (await getVenue(db)).tables
        .filter((t) => t.roomId === first.id || t.roomId === second.id)
        .map((t) => t.name);
      expect(names).toEqual([`S${tag} 2`, `S${tag} 10`, `S${tag} 1`]);
    });

    it(`allows at most ${MAX_TABLES} tables`, async ({ skip }) => {
      const existing = (await getVenue(db)).tables.length;
      if (existing >= MAX_TABLES) {
        skip();
      }
      const hall = await room(`Limit ${tag}`);
      const rows = Array.from({ length: MAX_TABLES - existing }, (_, index) => ({
        room_id: hall.id,
        name: `L${tag} ${index}`,
        seat_count: 4,
        shape: "round",
        pos_x: 0.5,
        pos_y: 0.5,
      }));
      const { error } = await db.from("venue_table").insert(rows);
      if (error) {
        throw new Error(error.message);
      }
      expect(await addTable(db, fields(hall.id, `L${tag} extra`))).toEqual({ status: "too-many", limit: MAX_TABLES });
    });
  });

  describe("plan image", () => {
    it("starts without a plan", async ({ skip }) => {
      if (planWasPresent) {
        skip();
      }
      expect((await getVenue(db)).plan).toBeNull();
      expect(await getPlanImage(db)).toBeNull();
    });

    it("stores a tiny PNG byte for byte, including 0x00, 0x5C and 0xFF", async ({ skip }) => {
      if (planWasPresent) {
        skip();
      }
      const bytes = new Uint8Array([...TINY_PNG, 0x00, 0x5c, 0xff]);
      const saved = await savePlanImage(db, bytes);
      expect(saved.status).toBe("saved");
      const image = await getPlanImage(db);
      expect(image?.mimeType).toBe("image/png");
      expect(image && sameBytes(image.bytes, bytes)).toBe(true);
      expect((await getVenue(db)).plan).toEqual({
        mimeType: "image/png",
        byteSize: bytes.length,
        version: image?.version,
      });
    });

    it("stores exactly 5 MB byte for byte and keeps the image out of the venue answer", async ({ skip }) => {
      if (planWasPresent) {
        skip();
      }
      const bytes = pngLikePayload(MAX_PLAN_BYTES);
      expect(await savePlanImage(db, bytes)).toMatchObject({ status: "saved", plan: { byteSize: MAX_PLAN_BYTES } });
      const image = await getPlanImage(db);
      expect(image && sameBytes(image.bytes, bytes)).toBe(true);
      expect(JSON.stringify(await getVenue(db)).length).toBeLessThan(20_000);
    });

    it("refuses more than 5 MB and anything that is not PNG, JPEG or WebP", async ({ skip }) => {
      if (planWasPresent) {
        skip();
      }
      const before = await getVenue(db);
      expect(await savePlanImage(db, pngLikePayload(MAX_PLAN_BYTES + 1))).toEqual({
        status: "too-large",
        limit: MAX_PLAN_BYTES,
      });
      for (const text of ["GIF89a", "<svg></svg>", "<!doctype html>", ""]) {
        expect(await savePlanImage(db, new TextEncoder().encode(text))).toEqual({ status: "unsupported-type" });
      }
      expect((await getVenue(db)).plan).toEqual(before.plan);
    });

    it("replaces the plan with a new version and keeps tables and their pins", async ({ skip }) => {
      if (planWasPresent) {
        skip();
      }
      await savePlanImage(db, TINY_PNG);
      const first = (await getVenue(db)).plan;
      const hall = await room(`Sala ${tag}`);
      const pinned = await table(hall.id, `T ${tag}`, { x: 0.1, y: 0.9 });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const replaced = await savePlanImage(db, jpeg);
      expect(replaced).toMatchObject({ status: "saved", plan: { mimeType: "image/jpeg", byteSize: jpeg.length } });
      const venue = await getVenue(db);
      expect(venue.plan?.version).not.toBe(first?.version);
      expect(venue.tables).toContainEqual(pinned);
    });
  });
});
