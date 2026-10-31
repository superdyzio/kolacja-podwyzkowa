import { MAX_EVENT_TOPICS, MAX_GUEST_TOPICS } from "@/lib/ai-topics/limits";
import { pluralPl } from "@/lib/guests/summary";
import type { ResetCountsDto, ResetPart } from "@/types";
import { RESET_PART_LABELS } from "./parts";

// Polish texts of the organizer reset, pure: the count line under each part in the modal (what would go away) and
// the summary after a reset (what went away).

export const NOTHING_TO_RESET = "nic do usunięcia";

// Shown on „Linki gości” while „Goście i grupy” is chosen too.
export const GUEST_LINKS_WITH_GUESTS_NOTE = "Goście zostaną usunięci, więc zostanie tylko wyłączenie dostępu gości.";

const count = (n: number, one: string, few: string, many: string) => `${n} ${pluralPl(n, one, few, many)}`;
const guesses = (n: number) => count(n, "strzał", "strzały", "strzałów");
const seats = (n: number) => count(n, "miejsce", "miejsca", "miejsc");
const snapshots = (n: number) => count(n, "publikacja", "publikacje", "publikacji");
const guests = (n: number) => count(n, "gość", "gości", "gości");
const groups = (n: number) => count(n, "grupa", "grupy", "grup");
const rooms = (n: number) => count(n, "sala", "sale", "sal");
const tables = (n: number) => count(n, "stolik", "stoliki", "stolików");
const questions = (n: number) => count(n, "pytanie", "pytania", "pytań");
const links = (n: number) => count(n, "link", "linki", "linków");
// Accusative forms for „usunięto …” where they differ (gościa is also the genitive after „dla”).
const snapshotsAcc = (n: number) => count(n, "publikację", "publikacje", "publikacji");
const guestsAcc = (n: number) => count(n, "gościa", "gości", "gości");
const groupsAcc = (n: number) => count(n, "grupę", "grupy", "grup");
const roomsAcc = (n: number) => count(n, "salę", "sale", "sal");
const starter = (n: number) => `${n} ${pluralPl(n, "startowe", "startowe", "startowych")}`;

// "a", "a i b", "a, b i c".
export function joinPl(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} i ${items.at(-1) ?? ""}`;
}

function nonEmpty(items: (string | false)[]): string[] {
  return items.filter((item): item is string => item !== false);
}

// What the part would remove or change, e.g. „40 gości · 3 grupy”; NOTHING_TO_RESET when there is nothing.
export function describeResetCount(part: ResetPart, counts: ResetCountsDto, starterQuestions: number): string {
  let items: string[];
  switch (part) {
    case "guesses":
      items = nonEmpty([
        counts.guesses > 0 && guesses(counts.guesses),
        counts.correctAmountSet && "prawidłowa kwota",
        !counts.intakeOpen && "przyjmowanie zamknięte",
      ]);
      break;
    case "aiUsage": {
      const failed = Math.max(counts.aiAttempts - counts.aiUsed, 0);
      items =
        counts.aiAttempts > 0
          ? nonEmpty([`wykorzystano ${counts.aiUsed} z ${MAX_EVENT_TOPICS}`, failed > 0 && `nieudane: ${failed}`])
          : [];
      break;
    }
    case "seating":
      items = nonEmpty([
        counts.seats > 0 &&
          (counts.pinned > 0 ? `${seats(counts.seats)} (przypięte: ${counts.pinned})` : seats(counts.seats)),
        counts.snapshots > 0 && snapshots(counts.snapshots),
      ]);
      break;
    case "guests":
      items = nonEmpty([counts.guests > 0 && guests(counts.guests), counts.groups > 0 && groups(counts.groups)]);
      break;
    case "venue":
      items = nonEmpty([
        counts.plan && "plan",
        counts.rooms > 0 && rooms(counts.rooms),
        counts.tables > 0 && tables(counts.tables),
      ]);
      break;
    case "questions":
      // Always does something: the starter base comes back.
      return `${counts.questions > 0 ? questions(counts.questions) : "brak pytań"} → ${pluralPl(starterQuestions, "zostanie", "zostaną", "zostanie")} ${starter(starterQuestions)}`;
    case "guestLinks":
      items = nonEmpty([
        counts.guests > 0 && links(counts.guests),
        counts.guestAccessEnabled && "dostęp gości włączony",
      ]);
      break;
  }
  return items.length > 0 ? items.join(" · ") : NOTHING_TO_RESET;
}

export interface ResetOutcome {
  parts: readonly ResetPart[];
  before: ResetCountsDto;
  questionsAdded: number;
  guestKeysReplaced: number;
}

function removedLine(part: ResetPart, items: (string | false)[], tail?: string): string {
  const removed = nonEmpty(items);
  const head = removed.length > 0 ? `usunięto ${joinPl(removed)}` : "nie było nic do usunięcia";
  return `${RESET_PART_LABELS[part]}: ${head}${tail ? `; ${tail}` : ""}.`;
}

function resultLine(part: ResetPart, outcome: ResetOutcome): string {
  const { before } = outcome;
  switch (part) {
    case "guesses":
      return removedLine(
        part,
        [before.guesses > 0 && guesses(before.guesses), before.correctAmountSet && "prawidłową kwotę"],
        "przyjmowanie strzałów otwarte",
      );
    case "aiUsage":
      return `${RESET_PART_LABELS[part]}: wyzerowany (0 z ${MAX_EVENT_TOPICS}), każdy gość znów ma ${MAX_GUEST_TOPICS}.`;
    case "seating":
      return removedLine(
        part,
        [before.seats > 0 && seats(before.seats), before.snapshots > 0 && snapshotsAcc(before.snapshots)],
        "TV nie pokazuje rozsadzenia do następnej publikacji",
      );
    case "guests":
      return removedLine(part, [
        before.guests > 0 && guestsAcc(before.guests),
        before.groups > 0 && groupsAcc(before.groups),
      ]);
    case "venue":
      return removedLine(part, [
        before.plan && "plan",
        before.rooms > 0 && roomsAcc(before.rooms),
        before.tables > 0 && tables(before.tables),
      ]);
    case "questions":
      return `${RESET_PART_LABELS[part]}: ${
        before.questions > 0 ? `usunięto ${questions(before.questions)}, ` : ""
      }wczytano ${starter(outcome.questionsAdded)}.`;
    case "guestLinks":
      return outcome.guestKeysReplaced > 0
        ? `${RESET_PART_LABELS[part]}: nowe linki dla ${guestsAcc(outcome.guestKeysReplaced)}, dostęp gości wyłączony — wydrukuj nowe karteczki.`
        : `${RESET_PART_LABELS[part]}: dostęp gości wyłączony.`;
  }
}

// One line per part really reset (implied ones included), in canonical order.
export function describeResetResult(outcome: ResetOutcome): string[] {
  return outcome.parts.map((part) => resultLine(part, outcome));
}
