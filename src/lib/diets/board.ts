import { compareTableNames } from "@/lib/venue/rules";
import type { DietBoardDto, DietSeatDto, SeatingSnapshot } from "@/types";
import { DIET_TAGS, hasDiet, type DietTag } from "./rules";

// Where the diets are served (guest-import-diets, S-23), pure: the LATEST published snapshot's seats (where the
// guests really sit, the names as the TV shows them) joined with the LIVE guest rows by id at read time — a snapshot
// never carries a diet. Only present guests count (the kitchen cooks for who is here). Used by the order board (client,
// panel preview, floors) and the tablet; S-24's per-table service list reuses it. No ids in the answer.

export interface DietGuestSource {
  id: number;
  displayName: string;
  isAbsent: boolean;
  diets: readonly DietTag[];
  dietNote: string | null;
}

export const EMPTY_DIET_BOARD: DietBoardDto = { tables: [], unplaced: [], counts: [], guests: 0 };

const nameCollator = new Intl.Collator("pl");

export function dietBoard(snapshot: SeatingSnapshot | null, guests: readonly DietGuestSource[]): DietBoardDto {
  const present = guests.filter((guest) => !guest.isAbsent && hasDiet(guest));
  if (present.length === 0) {
    return EMPTY_DIET_BOARD;
  }
  const byId = new Map(present.map((guest) => [guest.id, guest]));
  const tablesById = new Map(snapshot?.tables.map((table) => [table.snapshotTableId, table]) ?? []);
  const seatsByTable = new Map<number, DietSeatDto[]>();
  const seated = new Set<number>();

  for (const seat of snapshot?.seats ?? []) {
    const guest = seat.guestId === null ? undefined : byId.get(seat.guestId);
    if (!guest || !tablesById.has(seat.snapshotTableId)) {
      continue;
    }
    seated.add(guest.id);
    const seats = seatsByTable.get(seat.snapshotTableId) ?? [];
    seats.push({ seat: seat.seat, guestName: seat.guestName, diets: [...guest.diets], note: guest.dietNote });
    seatsByTable.set(seat.snapshotTableId, seats);
  }

  const tables = [...seatsByTable]
    .map(([snapshotTableId, seats]) => {
      const table = tablesById.get(snapshotTableId);
      return {
        name: table?.name ?? "?",
        room: table?.roomName ?? "",
        seats: seats.sort((a, b) => a.seat - b.seat),
      };
    })
    .sort((a, b) => compareTableNames(a.room, b.room) || compareTableNames(a.name, b.name));

  const unplaced = present
    .filter((guest) => !seated.has(guest.id))
    .sort((a, b) => nameCollator.compare(a.displayName, b.displayName) || a.id - b.id)
    .map((guest) => ({ guestName: guest.displayName, diets: [...guest.diets], note: guest.dietNote }));

  const counts = DIET_TAGS.map((tag) => ({
    tag,
    count: present.filter((guest) => guest.diets.includes(tag)).length,
  })).filter((entry) => entry.count > 0);

  return { tables, unplaced, counts, guests: present.length };
}

// The diet of whoever sits at a published seat (the serving lists, the map search), or undefined.
export function dietSeatLookup(board: DietBoardDto): (table: string, seat: number) => DietSeatDto | undefined {
  const bySeat = new Map<string, DietSeatDto>();
  for (const table of board.tables) {
    for (const seat of table.seats) {
      bySeat.set(`${table.name}\u0000${String(seat.seat)}`, seat);
    }
  }
  return (table, seat) => bySeat.get(`${table}\u0000${String(seat)}`);
}
