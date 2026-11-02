import { compareTableNames } from "@/lib/venue/rules";
import type { OrderPlacementDto, PlacedTableDto, SeatingSnapshot, UnplacedGroupDto } from "@/types";

// Where every order line is served (restaurant-orders), pure. The base is the LATEST published snapshot — what the
// TV and the guests' phones show — so the restaurant serves where the guests really sit:
//   a guest's line  → the guest's seat in the snapshot (by guest id);
//   a table's line  → the snapshot table with that table id (a loose line on the table);
//   not in the snapshot (guest unpublished, unseated or absent at publish time; table added after the publish)
//                   → „Do rozstawienia” under the live name;
//   nobody          → „Nieprzypisane” (never assigned, or its guest/table was deleted).
// Generic over the line type, so the organizer (full lines) and the restaurant (no ids or prices) share it.

export interface PlaceableLine {
  id: number;
  guestId: number | null;
  tableId: number | null;
}

export interface PlacementSource {
  // Live guest names by id.
  guests: ReadonlyMap<number, string>;
  // Live tables by id (name and room name).
  tables: ReadonlyMap<number, { name: string; room: string }>;
  snapshot: SeatingSnapshot | null;
}

const nameCollator = new Intl.Collator("pl", { numeric: true });

export function placeOrders<T extends PlaceableLine, R>(
  items: readonly T[],
  source: PlacementSource,
  view: (item: T) => R,
): OrderPlacementDto<R> {
  const snapshot = source.snapshot;
  const tablesBySnapshotId = new Map(snapshot?.tables.map((table) => [table.snapshotTableId, table]) ?? []);
  const snapshotTableByTableId = new Map(
    (snapshot?.tables ?? []).flatMap((table) =>
      table.tableId === null ? [] : [[table.tableId, table.snapshotTableId] as const],
    ),
  );
  const seatByGuest = new Map(
    (snapshot?.seats ?? []).flatMap((seat) => (seat.guestId === null ? [] : [[seat.guestId, seat] as const])),
  );

  interface TableBucket {
    seats: Map<number, { guestName: string; items: T[] }>;
    tableItems: T[];
  }
  const buckets = new Map<number, TableBucket>();
  const bucket = (snapshotTableId: number): TableBucket => {
    let found = buckets.get(snapshotTableId);
    if (!found) {
      found = { seats: new Map(), tableItems: [] };
      buckets.set(snapshotTableId, found);
    }
    return found;
  };
  const unplaced = new Map<string, { kind: "guest" | "table"; name: string; items: T[] }>();
  const unplacedGroup = (kind: "guest" | "table", id: number, name: string) => {
    const key = `${kind}:${String(id)}`;
    let found = unplaced.get(key);
    if (!found) {
      found = { kind, name, items: [] };
      unplaced.set(key, found);
    }
    return found;
  };
  const unassigned: T[] = [];

  for (const item of [...items].sort((a, b) => a.id - b.id)) {
    if (item.guestId !== null) {
      const seat = seatByGuest.get(item.guestId);
      if (seat && tablesBySnapshotId.has(seat.snapshotTableId)) {
        const seats = bucket(seat.snapshotTableId).seats;
        const entry = seats.get(seat.seat) ?? { guestName: seat.guestName, items: [] };
        entry.items.push(item);
        seats.set(seat.seat, entry);
      } else {
        unplacedGroup("guest", item.guestId, source.guests.get(item.guestId) ?? "?").items.push(item);
      }
    } else if (item.tableId !== null) {
      const snapshotTableId = snapshotTableByTableId.get(item.tableId);
      if (snapshotTableId === undefined) {
        const live = source.tables.get(item.tableId);
        unplacedGroup("table", item.tableId, live ? `${live.name} (${live.room})` : "?").items.push(item);
      } else {
        bucket(snapshotTableId).tableItems.push(item);
      }
    } else {
      unassigned.push(item);
    }
  }

  const tables: PlacedTableDto<R>[] = [...buckets]
    .map(([snapshotTableId, found]) => {
      const table = tablesBySnapshotId.get(snapshotTableId);
      return {
        name: table?.name ?? "?",
        room: table?.roomName ?? "",
        seats: [...found.seats]
          .sort(([a], [b]) => a - b)
          .map(([seat, entry]) => ({ seat, guestName: entry.guestName, items: entry.items.map(view) })),
        tableItems: found.tableItems.map(view),
      };
    })
    .sort((a, b) => compareTableNames(a.room, b.room) || compareTableNames(a.name, b.name));

  const unplacedGroups: UnplacedGroupDto<R>[] = [...unplaced.values()]
    .sort((a, b) => (a.kind === b.kind ? nameCollator.compare(a.name, b.name) : a.kind === "guest" ? -1 : 1))
    .map((group) => ({ kind: group.kind, name: group.name, items: group.items.map(view) }));

  return { tables, unplaced: unplacedGroups, unassigned: unassigned.map(view) };
}
