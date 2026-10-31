import { sideALength } from "@/lib/venue/seats";
import type { SeatAssignmentDto, TableShape } from "@/types";
import { guestPinnedMessage, seatPinnedMessage } from "./rules";

// The organizer seating page's interaction rules (pure): what a click on a seat does, the hint line, the layout of
// a table card and who lost their seat after a move. The server enforces the same locks; these only give a quicker,
// clearer answer.

export const PICK_GUEST_FIRST_MESSAGE = "Najpierw wybierz osobę z listy „Bez miejsca” albo kliknij zajęte miejsce.";

// The guest chosen on the page (pinned: locked to their current seat).
export interface SelectedGuest {
  guestId: number;
  name: string;
  seated: boolean;
  pinned: boolean;
}

export interface SeatOccupant {
  guestId: number;
  name: string;
  pinned: boolean;
}

export type SeatClick =
  { kind: "select"; guestId: number } | { kind: "deselect" } | { kind: "seat" } | { kind: "refuse"; reason: string };

// Nothing selected: a taken seat selects its occupant. The selected guest's own seat clears the selection. A pinned
// selected guest cannot move, so another taken seat switches the selection instead. Otherwise the click seats the
// selected guest there (empty → move, taken → swap or replace) — unless the occupant is pinned.
export function seatClick(selected: SelectedGuest | null, occupant: SeatOccupant | null): SeatClick {
  if (!selected) {
    return occupant
      ? { kind: "select", guestId: occupant.guestId }
      : { kind: "refuse", reason: PICK_GUEST_FIRST_MESSAGE };
  }
  if (occupant?.guestId === selected.guestId) {
    return { kind: "deselect" };
  }
  if (selected.pinned) {
    return occupant
      ? { kind: "select", guestId: occupant.guestId }
      : { kind: "refuse", reason: guestPinnedMessage(selected.name) };
  }
  if (occupant?.pinned) {
    return { kind: "refuse", reason: seatPinnedMessage(occupant.name) };
  }
  return { kind: "seat" };
}

// The line above the tables that says what a click does now.
export function seatingHint(selected: SelectedGuest | null): string {
  if (!selected) {
    return "Wybierz osobę z listy „Bez miejsca” albo kliknij zajęte miejsce, a potem kliknij miejsce, na którym ma siedzieć.";
  }
  if (selected.pinned) {
    return `„${selected.name}” ma przypięte miejsce — odepnij je, żeby przesadzić tę osobę.`;
  }
  return selected.seated
    ? `Kliknij miejsce dla „${selected.name}”. Zajęte miejsce — zamiana.`
    : `Kliknij miejsce dla „${selected.name}”. Osoba z zajętego miejsca zostanie bez miejsca.`;
}

// The seats of a table card, row by row: a rectangular table shows side A and side B next to each other (row p =
// seat p and seat a+p; null where side B is shorter), a round table one seat per row in seat order.
export function seatRows(shape: TableShape, seatCount: number): (number | null)[][] {
  if (shape === "round") {
    return Array.from({ length: seatCount }, (_, index) => [index + 1]);
  }
  const a = sideALength(seatCount);
  return Array.from({ length: a }, (_, index) => [index + 1, a + index + 1 <= seatCount ? a + index + 1 : null]);
}

// The guest who lost their seat when `guestId` was seated on (tableId, seat): the previous occupant, when they have
// no seat afterwards (a swap gives them the mover's old seat instead). null when nobody lost a seat.
export function displacedGuest(
  before: readonly SeatAssignmentDto[],
  after: readonly SeatAssignmentDto[],
  move: { guestId: number; tableId: number; seat: number },
): number | null {
  const occupant = before.find(
    (assignment) =>
      assignment.tableId === move.tableId && assignment.seat === move.seat && assignment.guestId !== move.guestId,
  );
  if (!occupant || after.some((assignment) => assignment.guestId === occupant.guestId)) {
    return null;
  }
  return occupant.guestId;
}

export function lostSeatMessage(name: string): string {
  return `„${name}” nie ma teraz miejsca.`;
}
