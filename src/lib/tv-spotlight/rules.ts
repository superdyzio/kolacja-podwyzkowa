import type { Locale } from "@/lib/i18n/locale";
import { normalizeQuestionText } from "@/lib/questions/text";
import type { TvSpotlightDto, TvSpotlightKind } from "@/types";
import { tvSpotlightMessages } from "./messages";

// What the organizer puts on the TV over the seating (tv-spotlight), pure: the kinds, the text rules, the TV polling
// token and the texts (messages.ts). Shared by the server, the organizer's page and the TV.

export const TV_SPOTLIGHT_KINDS = ["question", "topic", "person"] as const satisfies readonly TvSpotlightKind[];

// The organizer may send these two with their own text; a person is always drawn by the server.
export const TV_SHOWABLE_KINDS = ["question", "topic"] as const satisfies readonly TvSpotlightKind[];

export const MAX_SPOTLIGHT_LENGTH = 300;

// The caption above the text on the TV (Polish; the TV uses tvSpotlightMessages(locale).labels).
export const TV_SPOTLIGHT_LABELS: Readonly<Record<TvSpotlightKind, string>> = tvSpotlightMessages("pl").labels;

// The TV's caption while the drawn name is still spinning (Polish; see tvSpotlightMessages(locale).drawing).
export const TV_PERSON_DRAWING_LABEL = tvSpotlightMessages("pl").drawing;

// Polish answers (tests); routes use tvSpotlightMessages(locals.locale).noPresentGuests / .invalid.
export const NO_PRESENT_GUESTS_MESSAGE = tvSpotlightMessages("pl").noPresentGuests;
export const INVALID_SPOTLIGHT_MESSAGE = tvSpotlightMessages("pl").invalid;

export function isTvSpotlightKind(value: unknown): value is TvSpotlightKind {
  return TV_SPOTLIGHT_KINDS.some((kind) => kind === value);
}

// The text as shown: trimmed, inner whitespace collapsed (like questions); null when empty or over 300 code points.
export function normalizeSpotlightText(raw: string): string | null {
  const text = normalizeQuestionText(raw);
  const length = Array.from(text).length;
  return length >= 1 && length <= MAX_SPOTLIGHT_LENGTH ? text : null;
}

// The TV polling token: the seating token ("<snapshot id>.<plan version>", seatingVersion(); "<snapshot id>-<erased>…"
// once a published guest was deleted — guest-erasure) plus the spotlight's row id (0 = nothing shown). The guests'
// token starts with the two-part seating token, never with this one.
// pub-quiz (S-28): while a quiz runs with the module on, a 4th part: the quiz's own token ("<revision>-<answers>",
// the revision never reused); left out (undefined) otherwise, so every other TV keeps its 3-part token.
export function tvScreenVersion(seatingVersion: string, spotlightId: number | null, quiz?: string | null): string {
  const base = `${seatingVersion}.${spotlightId ?? 0}`;
  return quiz === undefined ? base : `${base}.${quiz ?? 0}`;
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
export function describeTvSpotlight(spotlight: TvSpotlightDto | null, locale: Locale = "pl"): string {
  const t = tvSpotlightMessages(locale);
  if (!spotlight) {
    return t.showsPlan;
  }
  switch (spotlight.kind) {
    case "question":
      return t.showsQuestion(spotlight.text);
    case "topic":
      return t.showsTopic(spotlight.text);
    case "person":
      return t.showsPerson(spotlight.text);
  }
}
