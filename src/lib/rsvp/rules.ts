import { formatDateTime } from "@/lib/events/dates";
import { displayNameKey, normalizeDisplayName } from "@/lib/guests/names";
import type { Locale } from "@/lib/i18n/locale";
import { compareMenuItems, isMenuCourse } from "@/lib/menu/rules";
import type { GuestRsvpDto, MenuCourse, RsvpBoardDto, RsvpCountsDto, RsvpGuestDto, RsvpOptionDto } from "@/types";
import { rsvpMessages } from "./messages";

// The guests' RSVP (guest-rsvp-menu, S-25; FR-039, US-07), pure.
//
// Attendance has ONE source of truth: guest.is_absent (the v1 flag the draw and the publish honour). An answer row
// only says THAT someone answered, the dish, by whom and when. Derived everywhere:
//   absent                → not coming (whoever marked it);
//   present and answered  → coming;
//   present, no answer    → no answer.
// The guest's phone shows exactly what the client counts.

export const MAX_RSVP_OPTIONS = 12;

export const RSVP_CODES = { closed: "rsvp-closed", notOffered: "dish-not-offered" } as const;

export interface AttendanceSource {
  absent: boolean;
  answered: boolean;
}

export function attendanceOf({ absent, answered }: AttendanceSource): boolean | null {
  return absent ? false : answered ? true : null;
}

// Who decided the shown attendance: the answer's author, or — an absence marked without any answer — the organizer.
export function byOrganizerOf(source: AttendanceSource & { answeredBy: string | null }): boolean {
  return source.answered ? source.answeredBy === "organizer" : source.absent;
}

function sortOptions<T extends RsvpOptionDto>(options: readonly T[]): T[] {
  return [...options].sort(compareMenuItems);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The guest_rsvp_state JSON → the phone's DTO (null when RSVP is off, the guest is unknown, or the shape is odd).
export function toGuestRsvp(raw: unknown): GuestRsvpDto | null {
  if (!isRecord(raw)) {
    return null;
  }
  const { deadline, open, absent, answered, answeredBy, dish, options } = raw;
  if (
    typeof deadline !== "string" ||
    Number.isNaN(Date.parse(deadline)) ||
    typeof open !== "boolean" ||
    typeof absent !== "boolean" ||
    typeof answered !== "boolean" ||
    !(answeredBy === null || answeredBy === undefined || typeof answeredBy === "string") ||
    !(dish === null || dish === undefined || typeof dish === "string") ||
    !Array.isArray(options)
  ) {
    return null;
  }
  const parsed: RsvpOptionDto[] = [];
  for (const option of options) {
    if (!isRecord(option) || typeof option.name !== "string" || !isMenuCourse(option.course)) {
      return null;
    }
    parsed.push({ name: option.name, course: option.course });
  }
  const attending = attendanceOf({ absent, answered });
  return {
    open,
    deadline: new Date(deadline).toISOString(),
    attending,
    // A dish belongs to a „yes” only (an absence marked later keeps the row's dish, which no longer counts).
    dish: attending === true ? (dish ?? null) : null,
    byOrganizer: byOrganizerOf({ absent, answered, answeredBy: answeredBy ?? null }),
    options: sortOptions(parsed),
  };
}

// The phone's RSVP as one stable string for the token's hashed part (guestStateVersion).
export function rsvpKey(rsvp: GuestRsvpDto): string {
  const options = rsvp.options.map((option) => `${option.course}:${option.name}`).join("\u0001");
  return [
    rsvp.open ? "1" : "0",
    rsvp.deadline,
    rsvp.attending === null ? "n" : rsvp.attending ? "y" : "x",
    rsvp.dish ?? "",
    rsvp.byOrganizer ? "o" : "g",
    options,
  ].join("\u0002");
}

export interface RsvpGuestSource {
  id: number;
  displayName: string;
  absent: boolean;
  // The answer row, or null when the guest never answered.
  answer: {
    answeredBy: string;
    answeredAt: string;
    dish: { name: string; course: MenuCourse } | null;
  } | null;
}

const polishCollator = new Intl.Collator("pl");

// Every guest's row on the board, in Polish name order (then id) like the guest list.
export function rsvpGuests(sources: readonly RsvpGuestSource[]): RsvpGuestDto[] {
  return [...sources]
    .sort((a, b) => polishCollator.compare(a.displayName, b.displayName) || a.id - b.id)
    .map((source) => {
      const answered = source.answer !== null;
      const attending = attendanceOf({ absent: source.absent, answered });
      return {
        id: source.id,
        displayName: source.displayName,
        attending,
        dish: attending === true ? (source.answer?.dish?.name ?? null) : null,
        byOrganizer: byOrganizerOf({ absent: source.absent, answered, answeredBy: source.answer?.answeredBy ?? null }),
        answeredAt: source.answer?.answeredAt ?? null,
      };
    });
}

// The counts: every guest in exactly one of coming / not coming / no answer; dishes over the coming guests only.
export function rsvpCounts(sources: readonly RsvpGuestSource[], offered: readonly RsvpOptionDto[]): RsvpCountsDto {
  const offeredKeys = new Set(offered.map((option) => displayNameKey(option.name)));
  const dishes = new Map<string, { name: string; course: MenuCourse; count: number; offered: boolean }>();
  let coming = 0;
  let notComing = 0;
  let noAnswer = 0;
  let noDish = 0;
  for (const source of sources) {
    const attending = attendanceOf({ absent: source.absent, answered: source.answer !== null });
    if (attending === false) {
      notComing += 1;
    } else if (attending === null) {
      noAnswer += 1;
    } else {
      coming += 1;
      const dish = source.answer?.dish ?? null;
      if (dish === null) {
        noDish += 1;
      } else {
        const key = displayNameKey(dish.name);
        const entry = dishes.get(key) ?? {
          name: dish.name,
          course: dish.course,
          count: 0,
          offered: offeredKeys.has(key),
        };
        entry.count += 1;
        dishes.set(key, entry);
      }
    }
  }
  return {
    total: sources.length,
    coming,
    notComing,
    noAnswer,
    noDish,
    dishes: [...dishes.values()].sort((a, b) => b.count - a.count || compareMenuItems(a, b)),
  };
}

export interface RsvpBoardInput {
  deadline: string | null;
  eventDate: string;
  guestLinksOn: boolean;
  // The client's options (menu items of the restaurant) and what the event's menu offers now.
  options: readonly RsvpOptionDto[];
  available: readonly RsvpOptionDto[];
  guests: readonly RsvpGuestSource[];
}

export function rsvpBoard(input: RsvpBoardInput, now: Date): RsvpBoardDto {
  const availableKeys = new Set(input.available.map((item) => displayNameKey(item.name)));
  const options = sortOptions(input.options).map((option) => ({
    ...option,
    available: availableKeys.has(displayNameKey(option.name)),
  }));
  const offered = options.filter((option) => option.available);
  const deadline = input.deadline === null ? null : new Date(input.deadline).toISOString();
  return {
    deadline,
    open: deadline !== null && now.getTime() < Date.parse(deadline),
    eventDate: input.eventDate,
    guestLinksOn: input.guestLinksOn,
    options,
    menu: sortOptions(input.available.map((item) => ({ name: item.name, course: item.course }))),
    counts: rsvpCounts(input.guests, offered),
    guests: rsvpGuests(input.guests),
  };
}

// The deadline field's suggestion while none is set: the evening before the event, 20:00 (Warsaw time, as typed).
export function defaultDeadlineInput(eventDate: string): string {
  const [year, month, day] = eventDate.split("-").map(Number);
  const before = new Date(Date.UTC(year, month - 1, day - 1));
  return `${before.toISOString().slice(0, 10)}T20:00`;
}

export type OptionNamesResult = { ok: true; names: string[] } | { ok: false; message: string };

// The client's option names: normalised, none empty, no repeats (any letter case), at most MAX_RSVP_OPTIONS.
export function parseOptionNames(raw: readonly string[], locale: Locale = "pl"): OptionNamesResult {
  const t = rsvpMessages(locale);
  if (raw.length > MAX_RSVP_OPTIONS) {
    return { ok: false, message: t.tooManyOptions(MAX_RSVP_OPTIONS) };
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const name = normalizeDisplayName(value);
    if (name === "") {
      return { ok: false, message: t.emptyOption };
    }
    const key = displayNameKey(name);
    if (seen.has(key)) {
      return { ok: false, message: t.duplicateOption(name) };
    }
    seen.add(key);
    names.push(name);
  }
  return { ok: true, names };
}

// The shell's and the panel card's line: the state, the three counts and up to four dishes („Schab ×5”).
export function formatRsvpSummary(board: RsvpBoardDto, locale: Locale = "pl"): string {
  const t = rsvpMessages(locale);
  const state =
    board.deadline === null
      ? t.summaryOff
      : board.open
        ? t.summaryOpen(formatDateTime(board.deadline, locale))
        : t.summaryClosed;
  const answered = board.guests.some((guest) => guest.answeredAt !== null);
  if (board.deadline === null && !answered) {
    return state;
  }
  const parts = [state, t.summaryCounts(board.counts.coming, board.counts.notComing, board.counts.noAnswer)];
  for (const dish of board.counts.dishes.slice(0, 4)) {
    parts.push(`${dish.name} ×${String(dish.count)}`);
  }
  return parts.join(" · ");
}
