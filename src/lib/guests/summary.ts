import type { Locale } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import type { GuestListDto } from "@/types";
import { guestsMessages } from "./messages";

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
// (1 grupa, 2 grupy, 5 grup, 12 grup, 22 grupy). Lives in src/lib/i18n/plural.ts; re-exported for older imports.
export { pluralPl };

// "40 gości · 3 grupy · nieobecni: 2" / "40 guests · 3 groups · absent: 2"
export function formatGuestSummary(summary: GuestListSummary, locale: Locale = "pl"): string {
  const parts =
    locale === "en"
      ? [
          `${summary.guests} ${pluralEn(summary.guests, "guest", "guests")}`,
          `${summary.groups} ${pluralEn(summary.groups, "group", "groups")}`,
        ]
      : [
          `${summary.guests} ${pluralPl(summary.guests, "gość", "gości", "gości")}`,
          `${summary.groups} ${pluralPl(summary.groups, "grupa", "grupy", "grup")}`,
        ];
  if (summary.absent > 0) {
    parts.push(guestsMessages(locale).absentCount(summary.absent));
  }
  return parts.join(" · ");
}
