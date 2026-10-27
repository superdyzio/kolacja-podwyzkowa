import type { GuestGuessDto, GuestSeatDto, GuestStateDto } from "@/types";

// What a guest's phone shows (S-05), pure: the polling token and the mapping of "latest snapshot + the guest's own
// seat row in it" to the three states. The seat comes from the PUBLISHED snapshot (same truth as the TV); the name is
// the guest's current display name.

export const GUEST_UNPUBLISHED_MESSAGE =
  "Organizator jeszcze nie opublikował rozsadzenia. Twoje miejsce pojawi się tutaj samo.";
export const GUEST_UNSEATED_MESSAGE = "Nie masz miejsca w aktualnym rozsadzeniu. Zapytaj organizatora.";

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
// organizer's proxy entry reaches the phone through the same single poll. Opaque to clients, compared for equality;
// at most ~50 characters (route limit 64). A later slice with more live guest state appends its own part here.
export function guestStateVersion(seatingVersion: string, name: string, guess: GuestGuessDto): string {
  return `${seatingVersion}.${nameHash(name)}.${guess.intakeOpen ? "1" : "0"}.${guess.amountGrosze ?? "n"}`;
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
}

export function toGuestState({
  seatingVersion,
  snapshotId,
  planVersion,
  name,
  seat,
  guess,
}: GuestStateInput): GuestStateDto {
  const version = guestStateVersion(seatingVersion, name, guess);
  const own = { intakeOpen: guess.intakeOpen, amountGrosze: guess.amountGrosze };
  if (snapshotId === null) {
    return { version, name, status: "unpublished", seat: null, planVersion, guess: own };
  }
  if (!seat) {
    return { version, name, status: "unseated", seat: null, planVersion, guess: own };
  }
  return { version, name, status: "seated", seat, planVersion, guess: own };
}

// One sentence for screen readers (announced when the seat changes).
export function describeGuestSeat(state: GuestStateDto): string {
  if (state.status === "seated" && state.seat) {
    return `Twoje miejsce: stolik ${state.seat.table}, sala ${state.seat.room}, miejsce ${state.seat.seat}.`;
  }
  return state.status === "unpublished" ? GUEST_UNPUBLISHED_MESSAGE : GUEST_UNSEATED_MESSAGE;
}
