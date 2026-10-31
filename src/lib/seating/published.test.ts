import { describe, expect, it } from "vitest";
import type { SeatingSnapshot, TvTableDto } from "@/types";
import { guest, input, seat, snapshotOf, table } from "./fixtures.test-helpers";
import {
  describeRemovedOccupants,
  isUpToDate,
  occupancyAfter,
  occupancyOf,
  occupantsRemovedBy,
  publishableFingerprint,
  seatingVersion,
  snapshotFingerprint,
  tableCardColumns,
  toPublishedSeating,
  toTvSeating,
} from "./published";

const ania = guest(1, "Ania");
const kuba = guest(2, "Kuba");
const ola = guest(3, "Ola");
const okno = table(1, "Okno", 8);
const kominek = table(2, "Kominek", 6, "rectangular");
const base = input([ania, kuba, ola], [okno, kominek], [seat(1, 1, 1), seat(2, 2, 4)]);

describe("isUpToDate", () => {
  it("is false before the first publish", () => {
    expect(isUpToDate(null, base)).toBe(false);
  });

  it("matches the snapshot published from the same data, whatever the row order", () => {
    const snapshot = snapshotOf(base);
    expect(isUpToDate(snapshot, base)).toBe(true);
    const reordered = { ...base, assignments: [...base.assignments].reverse() };
    expect(isUpToDate({ ...snapshot, tables: [...snapshot.tables].reverse() }, reordered)).toBe(true);
    expect(snapshotFingerprint(snapshot)).toBe(publishableFingerprint(base));
  });

  it("ignores pins (a pin changes nothing on the TV)", () => {
    const pinned = { ...base, assignments: [seat(1, 1, 1, true), seat(2, 2, 4)] };
    expect(isUpToDate(snapshotOf(base), pinned)).toBe(true);
  });

  it("notices a move, a rename, an absence, a moved pin, a renamed room and a new table", () => {
    const snapshot = snapshotOf(base);
    const changes = [
      { ...base, assignments: [seat(1, 1, 2), seat(2, 2, 4)] },
      { ...base, guestList: { ...base.guestList, guests: [{ ...ania, displayName: "Anna" }, kuba, ola] } },
      { ...base, guestList: { ...base.guestList, guests: [ania, { ...kuba, isAbsent: true }, ola] } },
      { ...base, venue: { ...base.venue, tables: [{ ...okno, x: 0.9 }, kominek] } },
      { ...base, venue: { ...base.venue, rooms: [{ id: 1, name: "Ogród" }] } },
      { ...base, venue: { ...base.venue, tables: [okno, kominek, table(3, "Taras", 4)] } },
    ];
    for (const changed of changes) {
      expect(isUpToDate(snapshot, changed)).toBe(false);
    }
  });

  it("leaves absent guests out of what would be published", () => {
    const withAbsent = input(
      [ania, kuba, { ...ola, isAbsent: true }],
      [okno, kominek],
      [...base.assignments, seat(3, 1, 5)],
    );
    expect(isUpToDate(snapshotOf(base), withAbsent)).toBe(true);
  });

  it("never matches a snapshot whose table was deleted since", () => {
    const snapshot = snapshotOf(base);
    const orphaned = {
      ...snapshot,
      tables: snapshot.tables.map((t) => (t.tableId === 2 ? { ...t, tableId: null } : t)),
    };
    expect(isUpToDate(orphaned, base)).toBe(false);
  });
});

describe("toTvSeating", () => {
  it("shows nothing before the first publish", () => {
    expect(toTvSeating(null, 1234)).toEqual({ version: "0.1234", planVersion: 1234, publishedAt: null, tables: [] });
  });

  it("lists tables by name and names by seat, without ids", () => {
    const tv = toTvSeating(snapshotOf(base, 7), null);
    expect(tv.version).toBe("7.0");
    expect(tv.publishedAt).toBe("2026-10-27T18:42:00.000Z");
    expect(tv.tables.map((t) => t.name)).toEqual(["Kominek", "Okno"]);
    expect(tv.tables[1]).toEqual({
      name: "Okno",
      shape: "round",
      seatCount: 8,
      x: 0.1,
      y: 0.05,
      seats: [{ seat: 1, name: "Ania" }],
    });
    const json = JSON.stringify(tv);
    expect(json).not.toContain("guestId");
    expect(json).not.toContain("tableId");
    expect(json).not.toContain("pinned");
  });
});

describe("seatingVersion", () => {
  it("joins the snapshot id and the plan version", () => {
    expect(seatingVersion(12, 1761529200000)).toBe("12.1761529200000");
    expect(seatingVersion(null, null)).toBe("0.0");
  });
});

describe("tableCardColumns", () => {
  function tvTable(shape: TvTableDto["shape"], seatCount: number, seats: number[]): TvTableDto {
    return { name: "T", shape, seatCount, x: 0, y: 0, seats: seats.map((s) => ({ seat: s, name: `G${s}` })) };
  }
  const numbers = (columns: ReturnType<typeof tableCardColumns>) => columns.map((column) => column.map((s) => s.seat));

  it("splits a rectangular table into its two sides", () => {
    expect(numbers(tableCardColumns(tvTable("rectangular", 6, [6, 1, 2, 4])))).toEqual([
      [1, 2],
      [4, 6],
    ]);
    expect(numbers(tableCardColumns(tvTable("rectangular", 7, [4, 5])))).toEqual([[4], [5]]);
    expect(numbers(tableCardColumns(tvTable("rectangular", 10, [1, 2, 3])))).toEqual([[1, 2, 3]]);
  });

  it("keeps a round table in one column up to 8 names, then halves it", () => {
    expect(numbers(tableCardColumns(tvTable("round", 4, [3, 1])))).toEqual([[1, 3]]);
    expect(numbers(tableCardColumns(tvTable("round", 10, [1, 2, 3, 4, 5, 6, 7, 8, 9])))).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9],
    ]);
    expect(tableCardColumns(tvTable("round", 10, []))).toEqual([]);
  });
});

describe("occupantsRemovedBy", () => {
  const occupancy = [
    { tableId: 1, seat: 7, guestName: "Kuba" },
    { tableId: 1, seat: 2, guestName: "Ania" },
    { tableId: 2, seat: 5, guestName: "Ola" },
  ];
  const names = (removed: ReturnType<typeof occupantsRemovedBy>) => removed.map((o) => o.guestName);

  it("removes everyone at a deleted table or in a deleted room", () => {
    expect(names(occupantsRemovedBy(occupancy, { kind: "delete-table", tableId: 1 }))).toEqual(["Ania", "Kuba"]);
    expect(names(occupantsRemovedBy(occupancy, { kind: "delete-room", tableIds: [1, 2] }))).toEqual([
      "Ania",
      "Kuba",
      "Ola",
    ]);
  });

  it("removes only the seats above a lowered seat count", () => {
    expect(names(occupantsRemovedBy(occupancy, { kind: "seat-count", tableId: 1, seatCount: 6 }))).toEqual(["Kuba"]);
    expect(names(occupantsRemovedBy(occupancy, { kind: "seat-count", tableId: 1, seatCount: 7 }))).toEqual([]);
    expect(names(occupantsRemovedBy(occupancy, { kind: "seat-count", tableId: 1, seatCount: 20 }))).toEqual([]);
  });

  it("keeps everyone else once the change is saved", () => {
    expect(names(occupancyAfter(occupancy, { kind: "delete-table", tableId: 1 }))).toEqual(["Ola"]);
    expect(names(occupancyAfter(occupancy, { kind: "delete-room", tableIds: [2] }))).toEqual(["Kuba", "Ania"]);
    expect(names(occupancyAfter(occupancy, { kind: "seat-count", tableId: 1, seatCount: 6 }))).toEqual(["Ania", "Ola"]);
    expect(occupancyAfter(occupancy, { kind: "seat-count", tableId: 2, seatCount: 20 })).toEqual(occupancy);
  });

  it("reads who sits where from a seating board", () => {
    expect(occupancyOf(base)).toEqual([
      { tableId: 1, seat: 1, guestName: "Ania" },
      { tableId: 2, seat: 4, guestName: "Kuba" },
    ]);
  });

  it("describes who loses a seat", () => {
    const tableNames = new Map([
      [1, "Okno"],
      [2, "Kominek"],
    ]);
    expect(describeRemovedOccupants([], tableNames)).toBe("");
    expect(describeRemovedOccupants([occupancy[0]], tableNames)).toBe("Miejsce straci: Kuba (Okno, miejsce 7).");
    const many = Array.from({ length: 15 }, (_, index) => ({
      tableId: 2,
      seat: index + 1,
      guestName: `G${index + 1}`,
    }));
    expect(describeRemovedOccupants(many, tableNames)).toMatch(
      /^Miejsce stracą: G1 \(Kominek, miejsce 1\), .* i 3 inne osoby\.$/,
    );
  });
});

describe("toPublishedSeating", () => {
  it("is null before the first publish", () => {
    expect(toPublishedSeating(null)).toBeNull();
  });

  it("orders tables by room, then by table name (numbers by value), and seats by number", () => {
    const snapshot: SeatingSnapshot = {
      id: 7,
      publishedAt: "2026-11-08T20:05:00.000Z",
      tables: [
        {
          snapshotTableId: 3,
          tableId: 3,
          roomName: "Sala B",
          name: "Stolik 1",
          seatCount: 4,
          shape: "round",
          x: 0,
          y: 0,
        },
        {
          snapshotTableId: 1,
          tableId: 1,
          roomName: "Sala A",
          name: "Stolik 10",
          seatCount: 6,
          shape: "round",
          x: 0,
          y: 0,
        },
        {
          snapshotTableId: 2,
          tableId: null,
          roomName: "Sala A",
          name: "Stolik 2",
          seatCount: 6,
          shape: "rectangular",
          x: 0,
          y: 0,
        },
      ],
      seats: [
        { snapshotTableId: 1, seat: 5, guestId: 1, guestName: "Ola" },
        { snapshotTableId: 1, seat: 2, guestId: null, guestName: "Kuba" },
        { snapshotTableId: 3, seat: 1, guestId: 3, guestName: "Ania" },
      ],
    };
    expect(toPublishedSeating(snapshot)).toEqual({
      snapshotId: 7,
      publishedAt: "2026-11-08T20:05:00.000Z",
      tables: [
        { name: "Stolik 2", room: "Sala A", shape: "rectangular", seatCount: 6, seats: [] },
        {
          name: "Stolik 10",
          room: "Sala A",
          shape: "round",
          seatCount: 6,
          seats: [
            { seat: 2, name: "Kuba" },
            { seat: 5, name: "Ola" },
          ],
        },
        { name: "Stolik 1", room: "Sala B", shape: "round", seatCount: 4, seats: [{ seat: 1, name: "Ania" }] },
      ],
    });
  });

  it("carries no ids, only names", () => {
    const json = JSON.stringify(toPublishedSeating(snapshotOf(base)));
    expect(json).not.toMatch(/tableId|guestId|snapshotTableId/);
    expect(json).toContain("Ania");
  });
});
