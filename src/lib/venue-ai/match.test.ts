import { describe, expect, it } from "vitest";
import { MAX_TABLES } from "@/lib/venue/rules";
import type { TableDto, VenueDto } from "@/types";
import { matchLayout } from "./match";
import type { RawLayout, RawLayoutTable } from "./schema";

function existing(id: number, name: string, x: number, y: number, roomId = 1): TableDto {
  return { id, roomId, name, seatCount: 8, shape: "round", x, y, rotation: 0 };
}

function proposed(name: string, x: number, y: number, extra: Partial<RawLayoutTable> = {}): RawLayoutTable {
  return { name, room: "Sala A", shape: "round", seatCount: 8, x, y, rotation: 0, ...extra };
}

const venue: VenueDto = {
  plan: { mimeType: "image/png", byteSize: 10, version: 1 },
  chairPitch: 0.035,
  rooms: [
    { id: 1, name: "Sala A", outline: null },
    { id: 2, name: "Sala B", outline: { x: 0.5, y: 0, width: 0.5, height: 1 } },
  ],
  tables: [existing(10, "Okno", 0.1, 0.1), existing(11, "Kominek", 0.3, 0.3), existing(12, "Stolik 3", 0.7, 0.7, 2)],
};

function layout(tables: RawLayoutTable[], rooms: RawLayout["rooms"] = []): RawLayout {
  return { chairPitch: 0.04, rooms, tables };
}

describe("matchLayout", () => {
  it("pairs by name first, case-insensitively, and lists only real changes", () => {
    const result = matchLayout(
      layout([proposed("OKNO", 0.15, 0.1), proposed("kominek", 0.3, 0.3, { rotation: 0 })]),
      venue,
    );
    expect(result.updates).toEqual([
      { tableId: 10, name: "Okno", x: 0.15, y: 0.1, rotation: 0, previous: { x: 0.1, y: 0.1, rotation: 0 } },
    ]);
    expect(result.newTables).toEqual([]);
    expect(result).toMatchObject({ chairPitch: 0.04, previousChairPitch: 0.035, skipped: 0 });
  });

  it("keeps a round table's turn and the venue's scale when the answer has none", () => {
    const turned: VenueDto = { ...venue, tables: [{ ...existing(10, "Okno", 0.1, 0.1), rotation: 30 }] };
    // Not moved: the AI's 0° for a round table is no change at all.
    const still = matchLayout({ ...layout([proposed("Okno", 0.1, 0.1)]), chairPitch: null }, turned);
    expect(still.updates).toEqual([]);
    expect(still).toMatchObject({ chairPitch: 0.035, previousChairPitch: 0.035 });
    // Moved: the new place keeps the turn.
    const moved = matchLayout(layout([proposed("Okno", 0.2, 0.1)]), turned);
    expect(moved.updates[0]).toMatchObject({ x: 0.2, rotation: 30, previous: { rotation: 30 } });
  });

  it("then pairs the nearest pin within the radius, closest first, one to one", () => {
    const result = matchLayout(
      layout([proposed("Stół A", 0.32, 0.3), proposed("Stół B", 0.31, 0.3), proposed("Daleki", 0.5, 0.5)]),
      venue,
    );
    // „Stół B” is closer to Kominek, so it wins it; „Stół A” then has no free table nearby.
    expect(result.updates.map((update) => [update.tableId, update.x])).toEqual([[11, 0.31]]);
    expect(result.newTables.map((table) => table.name)).toEqual(["Stół A", "Daleki"]);
  });

  it("never pairs a pin farther than the radius", () => {
    const result = matchLayout(layout([proposed("Nowy", 0.1, 0.3)]), venue);
    expect(result.updates).toEqual([]);
    expect(result.newTables).toHaveLength(1);
  });

  it("gives new tables a room by name, then by outline, then the first room, and a free name", () => {
    const rooms = [{ name: "sala a", outline: { x: 0, y: 0, width: 0.5, height: 1 } }];
    const result = matchLayout(
      layout(
        [
          proposed("Okno", 0.9, 0.9, { room: "Sala B" }),
          proposed("Taras", 0.9, 0.1, { room: "Nieznana" }),
          proposed("Okno", 0.2, 0.9, { room: "" }),
        ],
        rooms,
      ),
      { ...venue, tables: venue.tables.filter((table) => table.id === 10).map((table) => ({ ...table, x: 0.05 })) },
    );
    // The first „Okno” pairs with the existing one by name; the second is new and gets a free „Stolik N” name.
    expect(result.newTables.map((table) => [table.name, table.roomId])).toEqual([
      ["Taras", 2],
      ["Stolik 1", 1],
    ]);
    expect(result.rooms).toEqual([
      { roomId: 1, name: "Sala A", outline: { x: 0, y: 0, width: 0.5, height: 1 }, previous: null },
    ]);
  });

  it("skips new tables past the limit or without any room", () => {
    const many = Array.from({ length: MAX_TABLES }, (_, index) => proposed(`Nowy ${String(index)}`, 0.95, 0.95));
    const result = matchLayout(layout(many), venue);
    expect(result.newTables).toHaveLength(MAX_TABLES - venue.tables.length);
    expect(result.skipped).toBe(venue.tables.length);
    const roomless = matchLayout(layout([proposed("Nowy", 0.9, 0.9)]), { ...venue, rooms: [], tables: [] });
    expect(roomless).toMatchObject({ newTables: [], skipped: 1 });
  });
});
