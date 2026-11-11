import type { Locale } from "@/lib/i18n/locale";
import type { ResetPart } from "@/types";
import { resetMessages } from "./messages";

// The organizer reset („Reset danych”), pure: which parts exist, what they are called, what they imply and how the
// modal's selection behaves. The DB function reset_event (migration 20261030120000_reset_event.sql) uses the same
// ids and expands the same implications again, so the server never trusts the browser's closure.

// Canonical order (the modal lists them like this; results come back like this). A tuple, so `z.enum` works.
export const RESET_PARTS = [
  "guesses",
  "aiUsage",
  "seating",
  "guests",
  "venue",
  "orders",
  "questions",
  "guestLinks",
  "quiz",
  "rsvp",
] as const satisfies readonly ResetPart[];

// „Reset prób” on the client link (client-restaurant-split, FR-028): what the client clears between rehearsals —
// guests, the venue, orders, questions and links stay; pub-quiz (S-28): the quiz's answers and run (its questions
// stay). The full reset is the venue's.
export const TRIAL_RESET_PARTS = ["guesses", "seating", "quiz"] as const satisfies readonly ResetPart[];

export type TrialResetPart = (typeof TRIAL_RESET_PARTS)[number];

export function isResetPart(value: unknown): value is ResetPart {
  return typeof value === "string" && (RESET_PARTS as readonly string[]).includes(value);
}

// Labels and one-line descriptions (under each label in the modal) in the chosen language; the constants are the
// Polish ones.
export function resetPartLabels(locale: Locale = "pl"): Readonly<Record<ResetPart, string>> {
  return resetMessages(locale).partLabels;
}

export function resetPartDescriptions(locale: Locale = "pl"): Readonly<Record<ResetPart, string>> {
  return resetMessages(locale).partDescriptions;
}

export const RESET_PART_LABELS = resetPartLabels("pl");
export const RESET_PART_DESCRIPTIONS = resetPartDescriptions("pl");

// What a part takes with it: without guests there are no guesses, AI attempts, seats, quiz answers or RSVP answers
// (rsvp-reset: `rsvp` also clears the dish options and the deadline); without tables no seats.
export const RESET_IMPLIES: Readonly<Record<ResetPart, readonly ResetPart[]>> = {
  guesses: [],
  aiUsage: [],
  seating: [],
  guests: ["guesses", "aiUsage", "seating", "quiz", "rsvp"],
  venue: ["seating"],
  orders: [],
  questions: [],
  guestLinks: [],
  quiz: [],
  rsvp: [],
};

// The chosen parts with everything they imply, deduplicated, in canonical order.
export function expandResetParts(parts: Iterable<ResetPart>): ResetPart[] {
  const chosen = new Set<ResetPart>();
  for (const part of parts) {
    chosen.add(part);
    for (const implied of RESET_IMPLIES[part]) {
      chosen.add(implied);
    }
  }
  return RESET_PARTS.filter((part) => chosen.has(part));
}

// The explicitly chosen parts (other than `part`) that pull `part` in: while any is chosen, `part` is ticked and
// locked in the modal.
export function requiredBy(part: ResetPart, explicit: readonly ResetPart[]): ResetPart[] {
  return RESET_PARTS.filter(
    (other) => other !== part && explicit.includes(other) && RESET_IMPLIES[other].includes(part),
  );
}

// Ticks or unticks one part of the explicit selection; a part locked by another chosen part stays as it is.
// Unticking a part releases what it implied unless those were chosen on their own.
export function toggleResetPart(explicit: readonly ResetPart[], part: ResetPart): ResetPart[] {
  if (explicit.includes(part)) {
    return explicit.filter((other) => other !== part);
  }
  if (requiredBy(part, explicit).length > 0) {
    return [...explicit];
  }
  return RESET_PARTS.filter((other) => other === part || explicit.includes(other));
}

// „Zaznacz wszystko” over the parts the modal offers (every part, or the trial parts).
export function selectAllResetParts(offered: readonly ResetPart[] = RESET_PARTS): ResetPart[] {
  return RESET_PARTS.filter((part) => offered.includes(part));
}

export function isEveryResetPartSelected(
  explicit: readonly ResetPart[],
  offered: readonly ResetPart[] = RESET_PARTS,
): boolean {
  const selected = expandResetParts(explicit);
  return offered.every((part) => selected.includes(part));
}
