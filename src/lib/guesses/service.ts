import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import type { GuessBoardDto, GuessEnteredBy, GuestGuessDto } from "@/types";
import { toGuessBoard } from "./board";
import { guessMessages } from "./messages";
import { placeLimit } from "./place";

// Guesses of the raise amount (S-06, PRD FR-017..FR-020) for the singleton event. Functions take the client as a
// parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw; expected outcomes
// come back as status unions.
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
export async function getGuessBoard(db: DbClient): Promise<GuessBoardDto> {
  const [event, guests, guesses] = await Promise.all([
    db.from("event").select("guess_intake_open, correct_amount_grosze").eq("id", EVENT_ID).maybeSingle(),
    db.from("guest").select("id, display_name, is_absent"),
    db.from("guess").select("guest_id, amount_grosze, predicted_place, entered_by"),
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
export async function setGuessIntakeOpen(db: DbClient, open: boolean): Promise<void> {
  const { error } = await db.from("event").update({ guess_intake_open: open }).eq("id", EVENT_ID);
  if (error) {
    fail(open ? "otworzyć przyjmowania strzałów" : "zamknąć przyjmowania strzałów", error.message);
  }
}

// Sets (or clears, with null) the correct amount the ranking is measured from (FR-020).
export async function setCorrectAmount(db: DbClient, grosze: number | null): Promise<void> {
  const { error } = await db.from("event").update({ correct_amount_grosze: grosze }).eq("id", EVENT_ID);
  if (error) {
    fail("zapisać prawidłowej kwoty", error.message);
  }
}

// How many guests the event has: the highest place anybody can predict (guess-place).
export async function countGuests(db: DbClient): Promise<number> {
  const { count, error } = await db.from("guest").select("id", { count: "exact", head: true });
  if (error) {
    fail("policzyć gości", error.message);
  }
  return count ?? 0;
}

// A prediction above the number of guests, or null when it fits (undefined and null always fit).
async function placeOutOfRange(db: DbClient, place: number | null | undefined): Promise<number | null> {
  if (place === undefined || place === null) {
    return null;
  }
  const maxPlace = placeLimit(await countGuests(db));
  return place > maxPlace ? maxPlace : null;
}

// The organizer types in or corrects a guest's guess (FR-018) — also after intake is closed — and, when `place` is
// given, their place prediction (null clears it; undefined keeps the stored one: the upsert names only its columns).
export async function saveGuessByOrganizer(
  db: DbClient,
  guestId: number,
  grosze: number,
  place?: number | null,
): Promise<SaveGuessResult> {
  const maxPlace = await placeOutOfRange(db, place);
  if (maxPlace !== null) {
    return { status: "place-out-of-range", maxPlace };
  }
  const row = {
    guest_id: guestId,
    amount_grosze: grosze,
    entered_by: "organizer",
    updated_at: new Date().toISOString(),
    ...(place === undefined ? {} : { predicted_place: place }),
  };
  const { error } = await db.from("guess").upsert(row, { onConflict: "guest_id" });
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "not-found" };
    }
    fail("zapisać strzału", error.message);
  }
  return { status: "saved" };
}

// Removes a guest's guess (undoing a mistaken proxy entry). A guest without a guess is a no-op.
export async function deleteGuess(db: DbClient, guestId: number): Promise<DeleteGuessResult> {
  const guest = await db.from("guest").select("id").eq("id", guestId).maybeSingle();
  if (guest.error) {
    fail("odczytać gościa", guest.error.message);
  }
  if (!guest.data) {
    return { status: "not-found" };
  }
  const { error } = await db.from("guess").delete().eq("guest_id", guestId);
  if (error) {
    fail("usunąć strzału", error.message);
  }
  return { status: "deleted" };
}

// The guest's own save from the phone (FR-017): refused once intake is closed. With `place` (guess-place) the amount
// and the prediction are saved together (null clears it); without it the stored prediction stays.
export async function submitGuestGuess(
  db: DbClient,
  guestId: number,
  grosze: number,
  place?: number | null,
): Promise<SubmitGuestGuessResult> {
  const maxPlace = await placeOutOfRange(db, place);
  if (maxPlace !== null) {
    return { status: "place-out-of-range", maxPlace };
  }
  const { error } =
    place === undefined
      ? await db.rpc("save_guest_guess", { p_guest_id: guestId, p_amount_grosze: grosze })
      : await db.rpc("save_guest_guess_with_place", {
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
export async function getGuestGuess(db: DbClient, guestId: number): Promise<GuestGuessDto> {
  const [{ data, error }, guestCount] = await Promise.all([
    db
      .from("guest")
      .select("event(guess_intake_open), guess(amount_grosze, predicted_place)")
      .eq("id", guestId)
      .maybeSingle(),
    countGuests(db),
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
