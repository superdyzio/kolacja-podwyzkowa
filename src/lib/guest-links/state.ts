import type { Locale } from "@/lib/i18n/locale";
import { oppositeSeat, sideNeighbours } from "@/lib/venue/seats";
import type { GuestDrawingDto, GuestGuessDto, GuestSeatDto, GuestStateDto, TableShape, TablemateDto } from "@/types";
import { guestPhoneMessages } from "./messages";

// What a guest's phone shows (S-05), pure: the polling token and the mapping of "latest snapshot + the guest's own
// seat row in it" to the three states. The seat comes from the PUBLISHED snapshot (same truth as the TV); the name is
// the guest's current display name.

// The Polish texts of the two seatless states (the islands use guestPhoneMessages(locale)).
export const GUEST_UNPUBLISHED_MESSAGE = guestPhoneMessages("pl").unpublished;
export const GUEST_UNSEATED_MESSAGE = guestPhoneMessages("pl").unseated;

// FNV-1a (32 bit) of the name in base36: short, stable, cheap. Only used to notice a rename between polls.
function nameHash(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// The guest's polling token: the seating token ("<snapshot id>.<plan version>"), the name hash, then (S-06) the
// guess intake flag (1 open / 0 closed) and the guest's own guess in grosze ("n" = none), so a close, a reopen or an
// organizer's proxy entry reaches the phone through the same single poll; then (guess-place) the own place prediction
// ("n" = none) and the highest place allowed (a new guest raises it). Opaque to clients, compared for equality; at
// most ~58 characters (route limit 64). A later slice with more live guest state appends its own part here.
export function guestStateVersion(seatingVersion: string, name: string, guess: GuestGuessDto): string {
  const amount = guess.amountGrosze ?? "n";
  const place = guess.predictedPlace ?? "n";
  return `${seatingVersion}.${nameHash(name)}.${guess.intakeOpen ? "1" : "0"}.${amount}.${place}.${guess.maxPlace}`;
}

export interface GuestStateInput {
  // The seating token of what is published now (seatingVersion()).
  seatingVersion: string;
  // The latest snapshot id, or null before the first publish.
  snapshotId: number | null;
  planVersion: number | null;
  name: string;
  // The guest's seat in the latest snapshot, or null when they are not in it.
  seat: GuestSeatDto | null;
  // The intake flag and the guest's own guess (S-06).
  guess: GuestGuessDto;
  // The published drawing (venue-drawing), read only for a seated guest.
  drawing?: GuestDrawingDto | null;
}

export function toGuestState({
  seatingVersion,
  snapshotId,
  planVersion,
  name,
  seat,
  guess,
  drawing = null,
}: GuestStateInput): GuestStateDto {
  const version = guestStateVersion(seatingVersion, name, guess);
  const own: GuestGuessDto = {
    intakeOpen: guess.intakeOpen,
    amountGrosze: guess.amountGrosze,
    predictedPlace: guess.predictedPlace,
    maxPlace: guess.maxPlace,
  };
  if (snapshotId === null) {
    return { version, name, status: "unpublished", seat: null, planVersion, guess: own, drawing: null };
  }
  if (!seat) {
    return { version, name, status: "unseated", seat: null, planVersion, guess: own, drawing: null };
  }
  return { version, name, status: "seated", seat, planVersion, guess: own, drawing };
}

// Everyone else at the guest's table in the same snapshot (rows = that table's snapshot seats, names as published),
// in seat order, with the guest's neighbours marked by the seat contract: side neighbours, then the opposite seat of a
// rectangular table. The guest's own seat is left out by seat number (a deleted guest's row has no id but still shows
// on the TV, so it shows here too).
export function toTablemates(
  table: { shape: TableShape; seatCount: number },
  ownSeat: number,
  rows: readonly { seat: number; name: string }[],
): TablemateDto[] {
  const side = new Set(sideNeighbours(table.shape, table.seatCount, ownSeat));
  const opposite = oppositeSeat(table.shape, table.seatCount, ownSeat);
  return rows
    .filter((row) => row.seat !== ownSeat)
    .map((row) => ({
      seat: row.seat,
      name: row.name,
      relation: side.has(row.seat) ? ("side" as const) : row.seat === opposite ? ("opposite" as const) : null,
    }))
    .sort((a, b) => a.seat - b.seat);
}

// One sentence for screen readers (announced when the seat changes). The phone's store also compares it (in the
// default locale) to notice a new seat.
export function describeGuestSeat(state: GuestStateDto, locale: Locale = "pl"): string {
  const messages = guestPhoneMessages(locale);
  if (state.status === "seated" && state.seat) {
    return messages.seatSentence(state.seat.table, state.seat.room, state.seat.seat);
  }
  return state.status === "unpublished" ? messages.unpublished : messages.unseated;
}
