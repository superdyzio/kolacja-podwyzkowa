import { normalizeQuestionText } from "@/lib/questions/text";
import type { TvSpotlightDto, TvSpotlightKind } from "@/types";

// What the organizer puts on the TV over the seating (tv-spotlight), pure: the kinds, the text rules, the TV polling
// token and the Polish texts. Shared by the server, the organizer's page and the TV.

export const TV_SPOTLIGHT_KINDS = ["question", "topic", "person"] as const satisfies readonly TvSpotlightKind[];

// The organizer may send these two with their own text; a person is always drawn by the server.
export const TV_SHOWABLE_KINDS = ["question", "topic"] as const satisfies readonly TvSpotlightKind[];

export const MAX_SPOTLIGHT_LENGTH = 300;

// The caption above the text on the TV.
export const TV_SPOTLIGHT_LABELS: Readonly<Record<TvSpotlightKind, string>> = {
  question: "Pytanie do rozmowy",
  topic: "Temat od AI",
  person: "Wylosowana osoba",
};

// The TV's caption while the drawn name is still spinning.
export const TV_PERSON_DRAWING_LABEL = "Losujemy…";

export const NO_PRESENT_GUESTS_MESSAGE = "Nie ma kogo losować — brak obecnych gości na liście.";
export const INVALID_SPOTLIGHT_MESSAGE = "Tekst musi mieć od 1 do 300 znaków.";

export function isTvSpotlightKind(value: unknown): value is TvSpotlightKind {
  return TV_SPOTLIGHT_KINDS.some((kind) => kind === value);
}

// The text as shown: trimmed, inner whitespace collapsed (like questions); null when empty or over 300 code points.
export function normalizeSpotlightText(raw: string): string | null {
  const text = normalizeQuestionText(raw);
  const length = Array.from(text).length;
  return length >= 1 && length <= MAX_SPOTLIGHT_LENGTH ? text : null;
}

// The TV polling token: the seating token ("<snapshot id>.<plan version>", seatingVersion()) plus the spotlight's
// row id (0 = nothing shown). The seating token itself is untouched, because the guests' token is built from it.
export function tvScreenVersion(seatingVersion: string, spotlightId: number | null): string {
  return `${seatingVersion}.${spotlightId ?? 0}`;
}

// Font size on the TV in vh: the longer the text, the smaller, so 300 characters still fit on a 16:9 screen.
export function spotlightFontSize(kind: TvSpotlightKind, text: string): number {
  const length = Array.from(text).length;
  if (kind === "person") {
    return length <= 16 ? 14 : length <= 28 ? 10 : 8;
  }
  if (length <= 60) {
    return 9;
  }
  if (length <= 120) {
    return 7.5;
  }
  return length <= 200 ? 6.5 : 5.5;
}

// The organizer's status line about the TV.
export function describeTvSpotlight(spotlight: TvSpotlightDto | null): string {
  if (!spotlight) {
    return "Na TV jest plan rozsadzenia.";
  }
  switch (spotlight.kind) {
    case "question":
      return `Na TV jest pytanie: „${spotlight.text}”`;
    case "topic":
      return `Na TV jest temat od AI: „${spotlight.text}”`;
    case "person":
      return `Na TV jest wylosowana osoba: ${spotlight.text}`;
  }
}
