import type { Locale } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import { guestLinksMessages } from "./messages";

// The organizer shell card line for guest links (S-05), e.g. „Dostęp gości: włączony · 38 linków” /
// "Guest access: on · 38 links".

export interface GuestLinksSummary {
  enabled: boolean;
  guestCount: number;
}

export function formatGuestAccess(enabled: boolean, locale: Locale = "pl"): string {
  return guestLinksMessages(locale).access(enabled);
}

export function formatGuestLinksSummary({ enabled, guestCount }: GuestLinksSummary, locale: Locale = "pl"): string {
  const noun =
    locale === "en" ? pluralEn(guestCount, "link", "links") : pluralPl(guestCount, "link", "linki", "linków");
  const links = guestCount === 0 ? guestLinksMessages(locale).noGuests : `${guestCount} ${noun}`;
  return `${formatGuestAccess(enabled, locale)} · ${links}`;
}
