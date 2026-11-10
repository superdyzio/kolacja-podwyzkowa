import { MAX_EVENT_TOPICS, MAX_GUEST_TOPICS } from "@/lib/ai-topics/limits";
import type { Locale } from "@/lib/i18n/locale";
import type { ResetCountsDto, ResetPart } from "@/types";
import { resetMessages } from "./messages";
import { resetPartLabels } from "./parts";

// Texts of the organizer reset, pure, in both languages (i18n): the count line under each part in the modal (what
// would go away) and the summary after a reset (what went away). The words live in messages.ts.

export const NOTHING_TO_RESET = resetMessages("pl").nothingToReset;

// Shown on „Linki gości” while „Goście i grupy” is chosen too (Polish; the modal uses resetMessages(locale)).
export const GUEST_LINKS_WITH_GUESTS_NOTE = resetMessages("pl").guestLinksWithGuestsNote;

// "a", "a and b", "a, b and c" in the chosen language.
export function joinList(items: readonly string[], locale: Locale = "pl"): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} ${resetMessages(locale).and} ${items.at(-1) ?? ""}`;
}

// "a", "a i b", "a, b i c".
export function joinPl(items: readonly string[]): string {
  return joinList(items, "pl");
}

function nonEmpty(items: (string | false)[]): string[] {
  return items.filter((item): item is string => item !== false);
}

// What the part would remove or change, e.g. „40 gości · 3 grupy”; NOTHING_TO_RESET when there is nothing.
export function describeResetCount(
  part: ResetPart,
  counts: ResetCountsDto,
  starterQuestions: number,
  locale: Locale = "pl",
): string {
  const t = resetMessages(locale);
  let items: string[];
  switch (part) {
    case "guesses":
      items = nonEmpty([
        counts.guesses > 0 && t.guesses(counts.guesses),
        counts.correctAmountSet && t.correctAmountSet,
        !counts.intakeOpen && t.intakeClosed,
      ]);
      break;
    case "aiUsage": {
      const failed = Math.max(counts.aiAttempts - counts.aiUsed, 0);
      items =
        counts.aiAttempts > 0
          ? nonEmpty([t.aiUsed(counts.aiUsed, MAX_EVENT_TOPICS), failed > 0 && t.aiFailed(failed)])
          : [];
      break;
    }
    case "seating":
      items = nonEmpty([
        counts.seats > 0 &&
          (counts.pinned > 0 ? t.seatsPinned(t.seats(counts.seats), counts.pinned) : t.seats(counts.seats)),
        counts.snapshots > 0 && t.snapshots(counts.snapshots),
      ]);
      break;
    case "guests":
      items = nonEmpty([counts.guests > 0 && t.guests(counts.guests), counts.groups > 0 && t.groups(counts.groups)]);
      break;
    case "venue":
      items = nonEmpty([
        counts.plan && t.plan,
        counts.rooms > 0 && t.rooms(counts.rooms),
        counts.tables > 0 && t.tables(counts.tables),
      ]);
      break;
    case "orders":
      items = nonEmpty([counts.orders > 0 && t.orderLines(counts.orders)]);
      break;
    case "questions":
      // Always does something: the starter base comes back.
      return t.questionsComeBack(
        counts.questions > 0 ? t.questions(counts.questions) : t.noQuestions,
        starterQuestions,
      );
    case "guestLinks":
      items = nonEmpty([counts.guests > 0 && t.links(counts.guests), counts.guestAccessEnabled && t.guestAccessOn]);
      break;
    case "quiz":
      items = nonEmpty([
        counts.quizAnswers > 0 && t.quizAnswers(counts.quizAnswers),
        counts.quizAsked > 0 && t.quizAsked(counts.quizAsked),
      ]);
      break;
  }
  return items.length > 0 ? items.join(" · ") : t.nothingToReset;
}

export interface ResetOutcome {
  parts: readonly ResetPart[];
  before: ResetCountsDto;
  questionsAdded: number;
  guestKeysReplaced: number;
}

function removedLine(part: ResetPart, locale: Locale, items: (string | false)[], tail?: string): string {
  const t = resetMessages(locale);
  const removed = nonEmpty(items);
  const head = removed.length > 0 ? t.removed(joinList(removed, locale)) : t.nothingRemoved;
  return `${resetPartLabels(locale)[part]}: ${head}${tail ? `; ${tail}` : ""}.`;
}

function resultLine(part: ResetPart, outcome: ResetOutcome, locale: Locale): string {
  const t = resetMessages(locale);
  const label = resetPartLabels(locale)[part];
  const { before } = outcome;
  switch (part) {
    case "guesses":
      return removedLine(
        part,
        locale,
        [before.guesses > 0 && t.guesses(before.guesses), before.correctAmountSet && t.correctAmountAcc],
        t.intakeOpened,
      );
    case "aiUsage":
      return t.aiReset(label, MAX_EVENT_TOPICS, MAX_GUEST_TOPICS);
    case "seating":
      return removedLine(
        part,
        locale,
        [before.seats > 0 && t.seats(before.seats), before.snapshots > 0 && t.snapshotsAcc(before.snapshots)],
        t.seatingTail,
      );
    case "guests":
      return removedLine(part, locale, [
        before.guests > 0 && t.guestsAcc(before.guests),
        before.groups > 0 && t.groupsAcc(before.groups),
      ]);
    case "venue":
      return removedLine(part, locale, [
        before.plan && t.plan,
        before.rooms > 0 && t.roomsAcc(before.rooms),
        before.tables > 0 && t.tables(before.tables),
      ]);
    case "orders":
      return removedLine(part, locale, [before.orders > 0 && t.orderLinesAcc(before.orders)]);
    case "questions":
      return t.questionsReset(
        label,
        before.questions > 0 ? t.questions(before.questions) : null,
        t.starter(outcome.questionsAdded),
      );
    case "guestLinks":
      return outcome.guestKeysReplaced > 0
        ? t.newGuestLinks(label, t.guestsAcc(outcome.guestKeysReplaced))
        : t.guestAccessOff(label);
    case "quiz":
      return removedLine(
        part,
        locale,
        [before.quizAnswers > 0 && t.quizAnswers(before.quizAnswers)],
        before.quizAsked > 0 ? t.quizTail : undefined,
      );
  }
}

// One line per part really reset (implied ones included), in canonical order.
export function describeResetResult(outcome: ResetOutcome, locale: Locale = "pl"): string[] {
  return outcome.parts.map((part) => resultLine(part, outcome, locale));
}
