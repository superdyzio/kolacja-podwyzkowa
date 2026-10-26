import type { GuestListDto } from "@/types";

// Counts for the organizer views (pure; used by the organizer shell and the guest page island).

export interface GuestListSummary {
  guests: number;
  present: number;
  absent: number;
  groups: number;
}

export function summarizeGuestList(list: GuestListDto): GuestListSummary {
  const absent = list.guests.filter((guest) => guest.isAbsent).length;
  return { guests: list.guests.length, present: list.guests.length - absent, absent, groups: list.groups.length };
}

// Polish plural form: `one` for 1, `few` for 2–4, 22–24, 32–34… (not 12–14), `many` otherwise
// (1 grupa, 2 grupy, 5 grup, 12 grup, 22 grupy).
export function pluralPl(count: number, one: string, few: string, many: string): string {
  if (count === 1) {
    return one;
  }
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return few;
  }
  return many;
}

// "40 gości · 3 grupy · nieobecni: 2"
export function formatGuestSummary(summary: GuestListSummary): string {
  const parts = [
    `${summary.guests} ${pluralPl(summary.guests, "gość", "gości", "gości")}`,
    `${summary.groups} ${pluralPl(summary.groups, "grupa", "grupy", "grup")}`,
  ];
  if (summary.absent > 0) {
    parts.push(`nieobecni: ${summary.absent}`);
  }
  return parts.join(" · ");
}
