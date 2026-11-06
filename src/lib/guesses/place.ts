import type { Locale } from "@/lib/i18n/locale";
import { MAX_GUESTS } from "@/lib/guests/names";
import { placeMessages } from "./messages";

// The optional prediction of one's own final place in the ranking (guess-place), pure. The ranking is still measured
// from the amount only; the prediction decides the consolation prize. A prediction is a whole place from 1 to the
// number of guests (absent guests included: the organizer may enter their guesses, which are ranked); the DB allows
// at most MAX_GUESTS.

export const MAX_PREDICTED_PLACE = MAX_GUESTS;

export type ParsePlaceResult = { ok: true; place: number | null } | { ok: false; message: string };

// The highest place a guest may predict now: the number of guests, within 1 … MAX_PREDICTED_PLACE.
export function placeLimit(guestCount: number): number {
  return Math.min(Math.max(guestCount, 1), MAX_PREDICTED_PLACE);
}

// The format alone: "5", " 5 ", "5." → 5; empty → null (no prediction, or clear it); anything else (letters,
// fractions, 0, more than three digits) → "invalid". The upper bound is the caller's (it needs the guest count).
export function readPlaceText(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const match = /^(\d{1,3})\.?$/.exec(trimmed);
  const place = match ? Number(match[1]) : 0;
  return place >= 1 ? place : "invalid";
}

// An API body's `place` field: missing → undefined (keep the stored prediction), null or "" → null (clear it),
// else readPlaceText.
export function readPlaceField(value: string | null | undefined): number | null | undefined | "invalid" {
  return value === undefined || value === null ? value : readPlaceText(value);
}

// The place as typed, checked against the number of guests: a prediction from 1 to that number, or null (none).
// Anything else → the message naming the allowed range.
export function parsePredictedPlace(text: string, guestCount: number, locale: Locale = "pl"): ParsePlaceResult {
  const limit = placeLimit(guestCount);
  const place = readPlaceText(text);
  if (place === "invalid" || (place !== null && place > limit)) {
    return { ok: false, message: placeMessages(locale).range(limit) };
  }
  return { ok: true, place };
}

// What a form sends back: the place as text ("" = none), so the server parses it again.
export function formatPlaceInput(place: number | null): string {
  return place === null ? "" : String(place);
}

// The hit rule (tie rule A): a group sharing the displayed place `place` with `sharing` members spans the places
// place … place + sharing − 1 (1, 2, 2, 4: the two at „2” span 2–3), and every member whose prediction falls within
// that span hit their place. With competition ranking the next group starts right after the span, so spans never
// overlap.
export function isPlaceHit(predictedPlace: number | null, place: number, sharing: number): boolean {
  return predictedPlace !== null && predictedPlace >= place && predictedPlace <= place + Math.max(sharing, 1) - 1;
}

export type PodiumMedal = "gold" | "silver" | "bronze";

// The podium by the displayed place (the sports convention: 1, 2, 2, 4 gives two silvers and no bronze).
export function podiumMedal(place: number): PodiumMedal | null {
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : null;
}
