import { PLATFORM_TIME_ZONE } from "@/lib/events/dates";
import type { Locale } from "@/lib/i18n/locale";
import { modulesMessages } from "@/lib/modules/messages";
import type { SupportLogEntryDto } from "@/types";
import { supportMessages } from "./messages";
import { isApiPath, supportArea } from "./rules";

// Formats of the support log and the banner (admin-support-log, S-13). Times are shown in the platform's time zone
// (Europe/Warsaw — the server and the database run in UTC), assembled by hand from formatToParts so the output never
// depends on the runtime's locale data. Pure.

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let formatter: Intl.DateTimeFormat | null = null;

function partsOf(iso: string): { year: string; month: string; day: string; hour: string; minute: string } {
  formatter ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: String(Number(part("hour")) % 24).padStart(2, "0"),
    minute: part("minute"),
  };
}

// „01:45” — the clock time of an instant in the platform's time zone.
export function formatSupportClock(iso: string): string {
  const { hour, minute } = partsOf(iso);
  return `${hour}:${minute}`;
}

// „10.11.2026, 01:45” / „10 Nov 2026, 01:45”.
export function formatSupportTime(iso: string, locale: Locale = "pl"): string {
  const { year, month, day, hour, minute } = partsOf(iso);
  if (locale === "en") {
    return `${String(Number(day))} ${EN_MONTHS[Number(month) - 1] ?? month} ${year}, ${hour}:${minute}`;
  }
  return `${day}.${month}.${year}, ${hour}:${minute}`;
}

// What a log row says happened: the entry with its end time, the part of the panel an access opened (the event's
// name when an event was opened; „(API)” for an API read), the exit.
export function describeSupportEntry(entry: SupportLogEntryDto, locale: Locale = "pl"): string {
  const t = supportMessages(locale);
  switch (entry.kind) {
    case "enter":
      return t.entryEnter(entry.expiresAt ? formatSupportClock(entry.expiresAt) : "—");
    case "exit":
      return t.entryExit;
    case "access": {
      const path = entry.path ?? "";
      const what = entry.event ? t.eventArea(entry.event.name) : t.areaLabels[supportArea(path)];
      return t.entryAccess(`${what}${isApiPath(path) ? t.apiSuffix : ""}`);
    }
    case "unlock":
    case "lock": {
      const module = entry.module ? modulesMessages(locale).names[entry.module] : "—";
      const event = entry.event?.name ?? "—";
      return entry.kind === "unlock" ? t.entryUnlock(module, event) : t.entryLock(module, event);
    }
  }
}
