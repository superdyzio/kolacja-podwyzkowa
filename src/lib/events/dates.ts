import type { Locale } from "@/lib/i18n/locale";
import type { EventTiming } from "@/types";

// "Today" for a restaurant's events (restaurant-events, S-11). An event has a calendar date only (no time of day);
// the server and the database run in UTC, so every "today" goes through the platform's time zone here — never the
// process's local date. Pure: takes `now` as a parameter (tests pass fixed instants).
//
// The day window (FR-029, also used by S-21's waiter view): a party runs past midnight, so an event dated YESTERDAY
// still counts as "today" until DAY_ROLLOVER_HOUR (12:00) local time.

export const PLATFORM_TIME_ZONE = "Europe/Warsaw";
export const DAY_ROLLOVER_HOUR = 12;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

// The local calendar date ("YYYY-MM-DD") and hour (0–23) of an instant in a time zone.
export function localDateTime(now: Date, timeZone: string = PLATFORM_TIME_ZONE): { date: string; hour: number } {
  const parts = formatterFor(timeZone).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) % 24 };
}

// Today's date in the platform's time zone.
export function platformToday(now: Date): string {
  return localDateTime(now).date;
}

// A calendar date moved by whole days ("YYYY-MM-DD" in and out; no time zone involved).
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// Where an event dated `eventDate` stands at `now`: today (incl. yesterday's event before noon), upcoming or past.
export function eventTiming(eventDate: string, now: Date): EventTiming {
  const { date: today, hour } = localDateTime(now);
  if (eventDate === today) {
    return "today";
  }
  if (eventDate > today) {
    return "upcoming";
  }
  return hour < DAY_ROLLOVER_HOUR && eventDate === addDays(today, -1) ? "today" : "past";
}

export interface PartitionableEvent {
  id: number;
  date: string;
  archived: boolean;
}

export interface EventPartition<T> {
  upcoming: T[];
  past: T[];
  archived: T[];
}

// The panel's three lists: archived events (any date) on their own, latest first; the rest split by eventTiming —
// upcoming = today and later, nearest first; past = latest first. Equal dates keep creation order (id).
export function partitionEvents<T extends PartitionableEvent>(events: readonly T[], now: Date): EventPartition<T> {
  const ascending = (a: T, b: T) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1);
  const descending = (a: T, b: T) => ascending(b, a);
  const upcoming: T[] = [];
  const past: T[] = [];
  const archived: T[] = [];
  for (const event of events) {
    if (event.archived) {
      archived.push(event);
    } else if (eventTiming(event.date, now) === "past") {
      past.push(event);
    } else {
      upcoming.push(event);
    }
  }
  return { upcoming: upcoming.sort(ascending), past: past.sort(descending), archived: archived.sort(descending) };
}

const WEEKDAYS: Record<Locale, readonly string[]> = {
  pl: ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// „sob., 12.12.2026” / „Sat, 12 Dec 2026”. Hand-rolled from the calendar date (not Intl), so the server's render and
// every browser agree whatever their time zone.
export function formatEventDate(date: string, locale: Locale = "pl"): string {
  const [year, month, day] = date.split("-");
  const weekday = WEEKDAYS[locale][new Date(`${date}T00:00:00Z`).getUTCDay()];
  if (locale === "en") {
    return `${weekday}, ${String(Number(day))} ${MONTHS_EN[Number(month) - 1]} ${year}`;
  }
  return `${weekday}, ${day}.${month}.${year}`;
}

// guest-rsvp-menu (S-25): a date-time typed in the platform's time zone (an <input type="datetime-local">,
// "YYYY-MM-DDTHH:MM") and the instant it means. The offset comes from Intl (DST-correct, no library): a local time
// inside the spring-forward gap resolves to the instant after the gap, a repeated autumn hour to its later occurrence.

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const minuteFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockOf(instantMs: number, timeZone: string): { date: string; time: string; wallMs: number } {
  let formatter = minuteFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    minuteFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instantMs));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(part("hour")) % 24).padStart(2, "0");
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${hour}:${part("minute")}`;
  return { date, time, wallMs: Date.parse(`${date}T${time}:00Z`) };
}

// The ISO instant of a wall-clock time in a time zone, or null for an impossible date or time. No year range: internal
// computations may cross it (the floor window of an event on EVENT_DATE_MAX ends on 2101-01-01).
function wallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): string | null {
  if (hour > 23 || minute > 59) {
    return null;
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  const offsetAt = (instant: number) => wallClockOf(instant, timeZone).wallMs - Math.floor(instant / 60_000) * 60_000;
  const first = wall - offsetAt(wall);
  const second = wall - offsetAt(first);
  return new Date(second).toISOString();
}

// The ISO instant of a local "YYYY-MM-DDTHH:MM" (years 2000–2100: what a person may type), or null for anything
// malformed or impossible.
export function localInputToInstant(local: string, timeZone: string = PLATFORM_TIME_ZONE): string | null {
  const match = LOCAL_INPUT.exec(local.trim());
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 2000 || year > 2100) {
    return null;
  }
  return wallTimeToInstant(year, month, day, hour, minute, timeZone);
}

// The ISO instant of a full hour on a "YYYY-MM-DD" day in the platform's time zone, without localInputToInstant's year
// range (for computed days, e.g. the day after an event), or null for a malformed or impossible date.
export function localHourToInstant(date: string, hour: number, timeZone: string = PLATFORM_TIME_ZONE): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !Number.isInteger(hour) || hour < 0) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  return wallTimeToInstant(year, month, day, hour, 0, timeZone);
}

// The local "YYYY-MM-DDTHH:MM" of an instant (the value of a datetime-local input).
export function instantToLocalInput(iso: string, timeZone: string = PLATFORM_TIME_ZONE): string {
  const { date, time } = wallClockOf(Date.parse(iso), timeZone);
  return `${date}T${time}`;
}

// „pt., 11.12.2026, 18:00” / „Fri, 11 Dec 2026, 18:00” — an instant in the platform's time zone.
export function formatDateTime(iso: string, locale: Locale = "pl"): string {
  const { date, time } = wallClockOf(Date.parse(iso), PLATFORM_TIME_ZONE);
  return `${formatEventDate(date, locale)}, ${time}`;
}
