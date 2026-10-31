import { MAX_EVENT_TOPICS, MAX_GUEST_TOPICS } from "@/lib/ai-topics/limits";
import { pluralPl } from "@/lib/guests/summary";
import type { ResetPart } from "@/types";

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
  "questions",
  "guestLinks",
] as const satisfies readonly ResetPart[];

export function isResetPart(value: unknown): value is ResetPart {
  return typeof value === "string" && (RESET_PARTS as readonly string[]).includes(value);
}

export const RESET_PART_LABELS: Readonly<Record<ResetPart, string>> = {
  guesses: "Strzały",
  aiUsage: "Licznik tematów AI",
  seating: "Rozsadzenie i historia",
  guests: "Goście i grupy",
  venue: "Plan, sale i stoliki",
  questions: "Pytania",
  guestLinks: "Linki gości",
};

function topics(count: number): string {
  return `${count} ${pluralPl(count, "temat", "tematy", "tematów")}`;
}

// One line per part under its label in the modal.
export const RESET_PART_DESCRIPTIONS: Readonly<Record<ResetPart, string>> = {
  guesses: "Usuwa wszystkie strzały i prawidłową kwotę, otwiera przyjmowanie strzałów.",
  aiUsage: `Zeruje licznik: każdy gość znów ma ${topics(MAX_GUEST_TOPICS)}, cały wieczór ${MAX_EVENT_TOPICS}. Szacunek kosztu AI też liczy się od nowa.`,
  seating:
    "Usuwa rozsadzenie (z przypięciami) i wszystkie publikacje: TV nic nie pokazuje, historia sąsiadów zaczyna się od zera.",
  guests: "Usuwa wszystkich gości i grupy, a razem z nimi strzały, licznik tematów AI i rozsadzenie.",
  venue: "Usuwa plan lokalu, sale i stoliki, a razem z nimi rozsadzenie.",
  questions: "Usuwa wszystkie pytania i wczytuje od nowa bazę startową.",
  guestLinks:
    "Nowy link dla każdego gościa i wyłączony dostęp gości: wydrukowane karteczki i wysłane linki przestają działać.",
};

// What a part takes with it: without guests there are no guesses, AI attempts or seats; without tables no seats.
export const RESET_IMPLIES: Readonly<Record<ResetPart, readonly ResetPart[]>> = {
  guesses: [],
  aiUsage: [],
  seating: [],
  guests: ["guesses", "aiUsage", "seating"],
  venue: ["seating"],
  questions: [],
  guestLinks: [],
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

export function selectAllResetParts(): ResetPart[] {
  return [...RESET_PARTS];
}

export function isEveryResetPartSelected(explicit: readonly ResetPart[]): boolean {
  return expandResetParts(explicit).length === RESET_PARTS.length;
}
