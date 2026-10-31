import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import type { GuessBoardDto, GuessEnteredBy, GuestGuessDto } from "@/types";
import { toGuessBoard } from "./board";

// Guesses of the raise amount (S-06, PRD FR-017..FR-020) for the singleton event. Functions take the client as a
// parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw; expected outcomes
// come back as status unions.
//
// Two sides, never mixed: the organizer reads everything (getGuessBoard: all guesses + the ranking) and may write
// any guest's guess at any time; a guest writes only their own guess, only while intake is open (submitGuestGuess →
// save_guest_guess(), atomic against a concurrent close), and reads only their own guess + the intake flag
// (getGuestGuess, folded into the guest's live state).

export const GUESS_INTAKE_CLOSED_MESSAGE = "Przyjmowanie strzałów jest zamknięte.";
export const GUESS_GUEST_NOT_FOUND_MESSAGE = "Nie znaleziono gościa.";

const FOREIGN_KEY_VIOLATION = "23503";

export type SaveGuessResult = { status: "saved" } | { status: "not-found" };
export type DeleteGuessResult = { status: "deleted" } | { status: "not-found" };
export type SubmitGuestGuessResult = { status: "saved" } | { status: "closed" } | { status: "not-found" };

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
    db.from("guess").select("guest_id, amount_grosze, entered_by"),
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

// The organizer types in or corrects a guest's guess (FR-018) — also after intake is closed.
export async function saveGuessByOrganizer(db: DbClient, guestId: number, grosze: number): Promise<SaveGuessResult> {
  const { error } = await db
    .from("guess")
    .upsert(
      { guest_id: guestId, amount_grosze: grosze, entered_by: "organizer", updated_at: new Date().toISOString() },
      { onConflict: "guest_id" },
    );
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

// The guest's own save from the phone (FR-017): refused once intake is closed.
export async function submitGuestGuess(db: DbClient, guestId: number, grosze: number): Promise<SubmitGuestGuessResult> {
  const { error } = await db.rpc("save_guest_guess", { p_guest_id: guestId, p_amount_grosze: grosze });
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

// What the guest's phone may know: the intake flag and their OWN guess (one query: the guest row with the event flag
// and the guess embedded). A guest deleted meanwhile reads as "closed, no guess".
export async function getGuestGuess(db: DbClient, guestId: number): Promise<GuestGuessDto> {
  const { data, error } = await db
    .from("guest")
    .select("event(guess_intake_open), guess(amount_grosze)")
    .eq("id", guestId)
    .maybeSingle();
  if (error) {
    fail("odczytać strzału", error.message);
  }
  if (!data) {
    return { intakeOpen: false, amountGrosze: null };
  }
  return { intakeOpen: data.event.guess_intake_open, amountGrosze: data.guess?.amount_grosze ?? null };
}
