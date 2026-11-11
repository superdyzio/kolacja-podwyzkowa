import { describe, expect, it } from "vitest";
import type { DrawingRoomDto, TvTableDto } from "@/types";
import {
  DEFAULT_TV_SCREEN,
  TV_READABLE_FRACTION,
  isVenueReadable,
  keepRoomIndex,
  nextRoomIndex,
  planTvView,
  roomScene,
  smallestNameFontPx,
  stageScale,
  tvRoomNames,
} from "./rotation";

const PITCH = 0.035;
const ASPECT = 16 / 9;

function table(room: string, name: string, x: number, y: number, seatCount: number, names: string[]): TvTableDto {
  return {
    name,
    room,
    shape: "round",
    seatCount,
    x,
    y,
    rotation: 0,
    seats: names.map((guest, index) => ({ seat: index + 1, name: guest })),
  };
}

// Two tables of four, short names, in two rooms: the whole venue is readable.
const sparse: TvTableDto[] = [
  table("Sala A", "Stół 1", 0.3, 0.5, 4, ["Ala", "Ola", "Ewa", "Iza"]),
  table("Sala B", "Stół 2", 0.7, 0.5, 4, ["Jan", "Piotr", "Adam", "Ewa"]),
];

// 150 guests at 15 tables of ten, spread over three rooms of one wide venue, with long names: unreadable at once.
function denseVenue(): TvTableDto[] {
  const tables: TvTableDto[] = [];
  const rooms = ["Sala 10", "Sala 2", "Ogród"];
  for (let index = 0; index < 15; index++) {
    const room = rooms[index % 3];
    const names = Array.from({ length: 10 }, (_, seat) => `Gość ${String(index)}-${String(seat)} Nazwiskowski`);
    tables.push(
      table(
        room,
        `Stół ${String(index + 1)}`,
        0.08 + (index % 5) * 0.21,
        0.15 + Math.floor(index / 5) * 0.35,
        10,
        names,
      ),
    );
  }
  return tables;
}

const outlines: DrawingRoomDto[] = [{ name: "sala a", x: 0.1, y: 0.1, width: 0.4, height: 0.8 }];

describe("tvRoomNames", () => {
  it("lists every room with a table once, in natural order, case-insensitively", () => {
    const tables = [...denseVenue(), table("sala 2", "Extra", 0.5, 0.5, 2, [])];
    expect(tvRoomNames(tables)).toEqual(["Ogród", "Sala 2", "Sala 10"]);
    expect(tvRoomNames([])).toEqual([]);
  });
});

describe("roomScene", () => {
  it("takes the room's tables and its outline when it has one", () => {
    const scene = roomScene(sparse, outlines, "SALA A");
    expect(scene.tables.map((t) => t.name)).toEqual(["Stół 1"]);
    expect(scene.rooms).toEqual(outlines);
  });

  it("takes the tables alone for a room without an outline", () => {
    const scene = roomScene(sparse, outlines, "Sala B");
    expect(scene.tables.map((t) => t.name)).toEqual(["Stół 2"]);
    expect(scene.rooms).toEqual([]);
  });
});

describe("readability", () => {
  it("fits the view into the screen minus the padding", () => {
    const scale = stageScale({ left: 0, top: 0, right: 1000, bottom: 500 }, DEFAULT_TV_SCREEN);
    // Width-bound: (1920 − 32.4) / 1000.
    expect(scale).toBeCloseTo(1.8876, 3);
  });

  it("is readable without names", () => {
    expect(
      smallestNameFontPx({ tables: [], rooms: [], chairPitch: PITCH, aspect: ASPECT, screen: DEFAULT_TV_SCREEN }),
    ).toBe(null);
  });

  it("keeps a sparse venue whole and rotates a dense one", () => {
    const base = { rooms: [], chairPitch: PITCH, aspect: ASPECT, screen: DEFAULT_TV_SCREEN };
    const sparseFont = smallestNameFontPx({ ...base, tables: sparse });
    expect(sparseFont).not.toBeNull();
    expect(sparseFont ?? 0).toBeGreaterThanOrEqual(TV_READABLE_FRACTION * 1080);
    expect(isVenueReadable({ ...base, tables: sparse })).toBe(true);
    expect(planTvView({ ...base, tables: sparse, pinnedRoom: null })).toEqual({ mode: "venue" });

    const dense = denseVenue();
    expect(isVenueReadable({ ...base, tables: dense })).toBe(false);
    expect(planTvView({ ...base, tables: dense, pinnedRoom: null })).toEqual({
      mode: "rotate",
      rooms: ["Ogród", "Sala 2", "Sala 10"],
    });
  });

  it("depends on the screen's shape: a taller screen fits the same venue differently", () => {
    const base = { rooms: [], chairPitch: PITCH, aspect: ASPECT, tables: denseVenue() };
    const wide = smallestNameFontPx({ ...base, screen: { width: 1920, height: 1080 } }) ?? 0;
    const tall = smallestNameFontPx({ ...base, screen: { width: 1080, height: 1920 } }) ?? 0;
    expect(tall).toBeLessThan(wide);
  });

  it("does not rotate through a single room, however dense", () => {
    const one = denseVenue().map((t) => ({ ...t, room: "Sala" }));
    const input = { rooms: [], chairPitch: PITCH, aspect: ASPECT, screen: DEFAULT_TV_SCREEN, tables: one };
    expect(isVenueReadable(input)).toBe(false);
    expect(planTvView({ ...input, pinnedRoom: null })).toEqual({ mode: "venue" });
  });

  it("shows the pinned room whatever the readability", () => {
    const input = { rooms: [], chairPitch: PITCH, aspect: ASPECT, screen: DEFAULT_TV_SCREEN, tables: sparse };
    expect(planTvView({ ...input, pinnedRoom: "Sala B" })).toEqual({ mode: "room", room: "Sala B" });
  });
});

describe("rotation order", () => {
  it("wraps around", () => {
    expect(nextRoomIndex(0, 3)).toBe(1);
    expect(nextRoomIndex(2, 3)).toBe(0);
    expect(nextRoomIndex(5, 0)).toBe(0);
  });

  it("stays on the same room after a publish when it is still there", () => {
    expect(keepRoomIndex("sala 2", ["Ogród", "Sala 2", "Sala 10"])).toBe(1);
    expect(keepRoomIndex("Taras", ["Ogród", "Sala 2"])).toBe(0);
    expect(keepRoomIndex(null, ["Ogród"])).toBe(0);
  });
});
