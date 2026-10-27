import type {
  GuestDto,
  GuestGroupDto,
  SeatAssignmentDto,
  SeatingSnapshot,
  TableDto,
  TableShape,
  VenueDto,
} from "@/types";
import type { SeatingInput } from "./rules";

// Small builders for the pure seating tests (not a test file itself).

export function guest(id: number, displayName: string, extra: Partial<GuestDto> = {}): GuestDto {
  return { id, displayName, isAbsent: false, groupId: null, ...extra };
}

export function table(id: number, name: string, seatCount: number, shape: TableShape = "round", roomId = 1): TableDto {
  return { id, roomId, name, seatCount, shape, x: id / 10, y: id / 20 };
}

export function seat(guestId: number, tableId: number, seatNumber: number, pinned = false): SeatAssignmentDto {
  return { guestId, tableId, seat: seatNumber, pinned };
}

export function venue(tables: TableDto[]): VenueDto {
  return { plan: null, rooms: [{ id: 1, name: "Sala" }], tables };
}

export function input(
  guests: GuestDto[],
  tables: TableDto[],
  assignments: SeatAssignmentDto[],
  groups: GuestGroupDto[] = [],
): SeatingInput {
  return { guestList: { guests, groups }, venue: venue(tables), assignments };
}

// The snapshot publish_seating() would write for `data` (present guests only), with fresh snapshot table ids.
export function snapshotOf(data: SeatingInput, id = 1): SeatingSnapshot {
  const roomName = new Map(data.venue.rooms.map((room) => [room.id, room.name]));
  const guests = new Map(data.guestList.guests.map((g) => [g.id, g]));
  const tables = data.venue.tables.map((t, index) => ({
    snapshotTableId: 100 + index,
    tableId: t.id,
    roomName: roomName.get(t.roomId) ?? "",
    name: t.name,
    seatCount: t.seatCount,
    shape: t.shape,
    x: t.x,
    y: t.y,
  }));
  const snapshotTableId = new Map(tables.map((t) => [t.tableId, t.snapshotTableId]));
  const seats = data.assignments.flatMap((a) => {
    const g = guests.get(a.guestId);
    return g && !g.isAbsent
      ? [
          {
            snapshotTableId: snapshotTableId.get(a.tableId) ?? 0,
            seat: a.seat,
            guestId: g.id,
            guestName: g.displayName,
          },
        ]
      : [];
  });
  return { id, publishedAt: "2026-10-27T18:42:00.000Z", tables, seats };
}
