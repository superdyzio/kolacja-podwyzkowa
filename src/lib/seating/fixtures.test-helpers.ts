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

// The demo evening from the overnight brief: 40 guests, 3 rooms, 7 tables (4 × round 6, 2 × rectangular 6,
// 1 × rectangular 4 = 40 seats), groups of 2, 2 and 4, one pinned guest (Gość 9 at Stół 1, seat 1) and one absent
// guest (Gość 40) → 39 present. The working arrangement is a manual seating of everyone present, groups together.
export function demoEvening(): SeatingInput {
  const groups: GuestGroupDto[] = [
    { id: 101, memberIds: [1, 2] },
    { id: 102, memberIds: [3, 4] },
    { id: 103, memberIds: [5, 6, 7, 8] },
  ];
  const groupOf = new Map(groups.flatMap((group) => group.memberIds.map((id) => [id, group.id] as const)));
  const guests = Array.from({ length: 40 }, (_, index) =>
    guest(index + 1, `Gość ${index + 1}`, { groupId: groupOf.get(index + 1) ?? null, isAbsent: index + 1 === 40 }),
  );
  const tables: TableDto[] = [
    table(1, "Stół 1", 6, "round", 1),
    table(2, "Stół 2", 6, "round", 1),
    table(3, "Stół 3", 6, "round", 2),
    table(4, "Stół 4", 6, "round", 2),
    table(5, "Stół 5", 6, "rectangular", 3),
    table(6, "Stół 6", 6, "rectangular", 3),
    table(7, "Stół 7", 4, "rectangular", 3),
  ];
  // Manual seating: the quartet at Stół 2 (1–4), the pairs at Stół 3 (1–2) and Stół 4 (1–2), Gość 9 pinned at
  // Stół 1 seat 1, everyone else on the remaining seats in order.
  const assignments: SeatAssignmentDto[] = [
    seat(9, 1, 1, true),
    seat(5, 2, 1),
    seat(6, 2, 2),
    seat(7, 2, 3),
    seat(8, 2, 4),
    seat(1, 3, 1),
    seat(2, 3, 2),
    seat(3, 4, 1),
    seat(4, 4, 2),
  ];
  const taken = new Set(assignments.map((a) => `${a.tableId}:${a.seat}`));
  let next = 10;
  for (const t of tables) {
    for (let s = 1; s <= t.seatCount && next <= 39; s++) {
      if (!taken.has(`${t.id}:${s}`)) {
        assignments.push(seat(next, t.id, s));
        next++;
      }
    }
  }
  return {
    guestList: { guests, groups },
    venue: {
      plan: null,
      rooms: [
        { id: 1, name: "Sala Główna" },
        { id: 2, name: "Ogród zimowy" },
        { id: 3, name: "Biblioteka" },
      ],
      tables,
    },
    assignments,
  };
}

// The working arrangement after a draft: the pinned rows as they were plus the drafted seats.
export function withDraft(data: SeatingInput, seats: readonly { guestId: number; tableId: number; seat: number }[]) {
  return {
    ...data,
    assignments: [
      ...data.assignments.filter((a) => a.pinned),
      ...seats.map((s) => ({ guestId: s.guestId, tableId: s.tableId, seat: s.seat, pinned: false })),
    ],
  };
}
