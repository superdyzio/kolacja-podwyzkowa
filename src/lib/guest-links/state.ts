import type { Locale } from "@/lib/i18n/locale";
import { ALL_GUEST_MODULES, guestModulesKey, type GuestModules } from "@/lib/modules/rules";
import { guestOrdersKey } from "@/lib/orders/pieces";
import { oppositeSeat, sideNeighbours } from "@/lib/venue/seats";
import type {
  GuestDrawingDto,
  GuestGuessDto,
  GuestOrderLineDto,
  GuestSeatDto,
  GuestStateDto,
  TableShape,
  TablemateDto,
} from "@/types";
import { guestPhoneMessages } from "./messages";

// What a guest's phone shows (S-05), pure: the polling token and the mapping of "latest snapshot + the guest's own
// seat row in it" to the three states. The seat comes from the PUBLISHED snapshot (same truth as the TV); the name is
// the guest's current display name.

// The Polish texts of the two seatless states (the islands use guestPhoneMessages(locale)).
export const GUEST_UNPUBLISHED_MESSAGE = guestPhoneMessages("pl").unpublished;
export const GUEST_UNSEATED_MESSAGE = guestPhoneMessages("pl").unseated;

// FNV-1a (32 bit) in base36: short, stable, cheap. Only used to notice a change between polls.
function shortHash(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// The guest's polling token: the seating token ("<snapshot id>.<plan version>"), a hash of the name and (guest-delivered)
// of the order lines the phone shows with their marked pieces, then (S-06) the guess intake flag (1 open / 0 closed)
// and the guest's own guess in grosze ("n" = none), so a close, a reopen or an organizer's proxy entry reaches the
// phone through the same single poll; then (guess-place) the own place prediction ("n" = none) and the highest place
// allowed (a new guest raises it). Opaque to clients, compared for equality; at most 62 characters (route limit 64):
// a later slice with more live guest state adds it to the hashed part instead of a new part.
export function guestStateVersion(
  seatingVersion: string,
  name: string,
  guess: GuestGuessDto,
  orders: readonly GuestOrderLineDto[],
  modules: GuestModules = ALL_GUEST_MODULES,
): string {
  const amount = guess.amountGrosze ?? "n";
  const place = guess.predictedPlace ?? "n";
  // event-modules: the phone's module flags go into the hashed part (no new part: the token has 2 chars of headroom).
  const live = shortHash(`${name}\u0000${guestOrdersKey(orders)}\u0000${guestModulesKey(modules)}`);
  return `${seatingVersion}.${live}.${guess.intakeOpen ? "1" : "0"}.${amount}.${place}.${guess.maxPlace}`;
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
  // guest-delivered: the guest's own order lines and their table's (getGuestOrders).
  orders: GuestOrderLineDto[];
  // event-modules: the phone's sections that are on (from the guest access); all on when omitted.
  modules?: GuestModules;
}

export function toGuestState({
  seatingVersion,
  snapshotId,
  planVersion,
  name,
  seat,
  guess,
  drawing = null,
  orders,
  modules = ALL_GUEST_MODULES,
}: GuestStateInput): GuestStateDto {
  const version = guestStateVersion(seatingVersion, name, guess, orders, modules);
  const own: GuestGuessDto = {
    intakeOpen: guess.intakeOpen,
    amountGrosze: guess.amountGrosze,
    predictedPlace: guess.predictedPlace,
    maxPlace: guess.maxPlace,
  };
  if (snapshotId === null) {
    return {
      version,
      name,
      status: "unpublished",
      seat: null,
      planVersion,
      guess: own,
      drawing: null,
      orders,
      modules,
    };
  }
  if (!seat) {
    return { version, name, status: "unseated", seat: null, planVersion, guess: own, drawing: null, orders, modules };
  }
  return { version, name, status: "seated", seat, planVersion, guess: own, drawing, orders, modules };
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
