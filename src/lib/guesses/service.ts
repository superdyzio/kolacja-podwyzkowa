import type { DbClient } from "@/lib/supabase-client";
import type { GuessBoardDto, GuessEnteredBy, GuestGuessDto } from "@/types";
import { toGuessBoard } from "./board";
import { guessMessages } from "./messages";
import { placeLimit } from "./place";

// Guesses of the raise amount (S-06, PRD FR-017..FR-020) of one event. Functions take the client and the event id as
// parameters (no `astro:*`), so they are tested against the local DB; every read and write is limited to that event
// (multi-tenant-events: guess.guest_id has no event-scoped foreign key, so every write checks the guest's event
// first). Supabase errors always throw; expected outcomes come back as status unions.
//
// Two sides, never mixed: the organizer reads everything (getGuessBoard: all guesses + the ranking) and may write
// any guest's guess at any time; a guest writes only their own guess, only while intake is open (submitGuestGuess →
// save_guest_guess(), atomic against a concurrent close), and reads only their own guess + the intake flag
// (getGuestGuess, folded into the guest's live state).
//
// guess-place: next to the amount a guess may carry the guest's prediction of their own final place (1 … number of
// guests). Saves take it as `place`: undefined = keep the stored prediction (phones still on the old page send only
// the amount), null = clear it, a number = set it (checked against the current number of guests).

// The Polish answers (older callers); routes use guessMessages(locals.locale).intakeClosed / .guestNotFound.
export const GUESS_INTAKE_CLOSED_MESSAGE = guessMessages("pl").intakeClosed;
export const GUESS_GUEST_NOT_FOUND_MESSAGE = guessMessages("pl").guestNotFound;

const FOREIGN_KEY_VIOLATION = "23503";

// place-out-of-range: the prediction is above the number of guests (maxPlace = the highest allowed now).
export type SaveGuessResult =
  { status: "saved" } | { status: "not-found" } | { status: "place-out-of-range"; maxPlace: number };
export type DeleteGuessResult = { status: "deleted" } | { status: "not-found" };
export type SubmitGuestGuessResult =
  | { status: "saved" }
  | { status: "closed" }
  | { status: "not-found" }
  | { status: "place-out-of-range"; maxPlace: number };

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function toEnteredBy(value: string): GuessEnteredBy {
  return value === "organizer" ? "organizer" : "guest";
}

// The organizer's guesses page: every guest with their guess, who is missing, and the ranking once the correct
// amount is set (three small reads in parallel).
export async function getGuessBoard(db: DbClient, eventId: number): Promise<GuessBoardDto> {
  const [event, guests, guesses] = await Promise.all([
    db.from("event").select("guess_intake_open, correct_amount_grosze").eq("id", eventId).maybeSingle(),
    db.from("guest").select("id, display_name, is_absent").eq("event_id", eventId),
    db.from("guess").select("guest_id, amount_grosze, predicted_place, entered_by").eq("event_id", eventId),
  ]);
  if (event.error) {
    fail("odczytać ustawień strzałów", event.error.message);
  }
  if (guests.error) {
    fail("odczytać listy gości", guests.error.message);
  }
  if (guesses.error) {
    fail("odczytać strzałów", guesses.error.message);
  }
  return toGuessBoard({
    intakeOpen: event.data?.guess_intake_open ?? true,
    correctAmountGrosze: event.data?.correct_amount_grosze ?? null,
    guests: guests.data.map((row) => ({ id: row.id, displayName: row.display_name, isAbsent: row.is_absent })),
    guesses: guesses.data.map((row) => ({
      guestId: row.guest_id,
      amountGrosze: row.amount_grosze,
      predictedPlace: row.predicted_place,
      enteredBy: toEnteredBy(row.entered_by),
    })),
  });
}

// Opens or closes guess intake (FR-019). Closing waits for in-flight guest saves (they hold the event row FOR SHARE).
export async function setGuessIntakeOpen(db: DbClient, eventId: number, open: boolean): Promise<void> {
  const { error } = await db.from("event").update({ guess_intake_open: open }).eq("id", eventId);
  if (error) {
    fail(open ? "otworzyć przyjmowania strzałów" : "zamknąć przyjmowania strzałów", error.message);
  }
}

// Sets (or clears, with null) the correct amount the ranking is measured from (FR-020).
export async function setCorrectAmount(db: DbClient, eventId: number, grosze: number | null): Promise<void> {
  const { error } = await db.from("event").update({ correct_amount_grosze: grosze }).eq("id", eventId);
  if (error) {
    fail("zapisać prawidłowej kwoty", error.message);
  }
}

// How many guests the event has: the highest place anybody can predict (guess-place).
export async function countGuests(db: DbClient, eventId: number): Promise<number> {
  const { count, error } = await db.from("guest").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (error) {
    fail("policzyć gości", error.message);
  }
  return count ?? 0;
}

// A prediction above the number of guests, or null when it fits (undefined and null always fit).
async function placeOutOfRange(
  db: DbClient,
  eventId: number,
  place: number | null | undefined,
): Promise<number | null> {
  if (place === undefined || place === null) {
    return null;
  }
  const maxPlace = placeLimit(await countGuests(db, eventId));
  return place > maxPlace ? maxPlace : null;
}

// Whether the guest belongs to the event (a guest of another event reads as unknown).
async function guestInEvent(db: DbClient, eventId: number, guestId: number): Promise<boolean> {
  const { data, error } = await db.from("guest").select("id").eq("id", guestId).eq("event_id", eventId).maybeSingle();
  if (error) {
    fail("odczytać gościa", error.message);
  }
  return data !== null;
}

// The organizer types in or corrects a guest's guess (FR-018) — also after intake is closed — and, when `place` is
// given, their place prediction (null clears it; undefined keeps the stored one: the upsert names only its columns).
export async function saveGuessByOrganizer(
  db: DbClient,
  eventId: number,
  guestId: number,
  grosze: number,
  place?: number | null,
): Promise<SaveGuessResult> {
  if (!(await guestInEvent(db, eventId, guestId))) {
    return { status: "not-found" };
  }
  const maxPlace = await placeOutOfRange(db, eventId, place);
  if (maxPlace !== null) {
    return { status: "place-out-of-range", maxPlace };
  }
  const row = {
    guest_id: guestId,
    event_id: eventId,
    amount_grosze: grosze,
    entered_by: "organizer",
    updated_at: new Date().toISOString(),
    ...(place === undefined ? {} : { predicted_place: place }),
  };
  const { error } = await db.from("guess").upsert(row, { onConflict: "guest_id" });
  if (error) {
    // The guest deleted between the check and the write.
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "not-found" };
    }
    fail("zapisać strzału", error.message);
  }
  return { status: "saved" };
}

// Removes a guest's guess (undoing a mistaken proxy entry). A guest without a guess is a no-op.
export async function deleteGuess(db: DbClient, eventId: number, guestId: number): Promise<DeleteGuessResult> {
  if (!(await guestInEvent(db, eventId, guestId))) {
    return { status: "not-found" };
  }
  const { error } = await db.from("guess").delete().eq("guest_id", guestId).eq("event_id", eventId);
  if (error) {
    fail("usunąć strzału", error.message);
  }
  return { status: "deleted" };
}

// The guest's own save from the phone (FR-017): refused once intake is closed. With `place` (guess-place) the amount
// and the prediction are saved together (null clears it); without it the stored prediction stays.
export async function submitGuestGuess(
  db: DbClient,
  eventId: number,
  guestId: number,
  grosze: number,
  place?: number | null,
): Promise<SubmitGuestGuessResult> {
  const maxPlace = await placeOutOfRange(db, eventId, place);
  if (maxPlace !== null) {
    return { status: "place-out-of-range", maxPlace };
  }
  const { error } =
    place === undefined
      ? await db.rpc("save_guest_guess", { p_event_id: eventId, p_guest_id: guestId, p_amount_grosze: grosze })
      : await db.rpc("save_guest_guess_with_place", {
          p_event_id: eventId,
          p_guest_id: guestId,
          p_amount_grosze: grosze,
          p_predicted_place: place,
        });
  if (error) {
    if (error.message === "INTAKE_CLOSED") {
      return { status: "closed" };
    }
    if (error.message === "GUEST_NOT_FOUND") {
      return { status: "not-found" };
    }
    fail("zapisać strzału", error.message);
  }
  return { status: "saved" };
}

// What the guest's phone may know: the intake flag, their OWN guess with their own place prediction (one query: the
// guest row with the event flag and the guess embedded) and the highest place they may predict (the number of guests,
// a head-only count in parallel). A guest deleted meanwhile reads as "closed, no guess".
export async function getGuestGuess(db: DbClient, eventId: number, guestId: number): Promise<GuestGuessDto> {
  const [{ data, error }, guestCount] = await Promise.all([
    db
      .from("guest")
      .select("event(guess_intake_open), guess(amount_grosze, predicted_place)")
      .eq("id", guestId)
      .eq("event_id", eventId)
      .maybeSingle(),
    countGuests(db, eventId),
  ]);
  if (error) {
    fail("odczytać strzału", error.message);
  }
  const maxPlace = placeLimit(guestCount);
  if (!data) {
    return { intakeOpen: false, amountGrosze: null, predictedPlace: null, maxPlace };
  }
  return {
    intakeOpen: data.event.guess_intake_open,
    amountGrosze: data.guess?.amount_grosze ?? null,
    predictedPlace: data.guess?.predicted_place ?? null,
    maxPlace,
  };
}
