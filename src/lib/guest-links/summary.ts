import { pluralPl } from "@/lib/guests/summary";

// The organizer shell card line for guest links (S-05), e.g. „Dostęp gości: włączony · 38 linków”.

export interface GuestLinksSummary {
  enabled: boolean;
  guestCount: number;
}

export function formatGuestAccess(enabled: boolean): string {
  return `Dostęp gości: ${enabled ? "włączony" : "wyłączony"}`;
}

export function formatGuestLinksSummary({ enabled, guestCount }: GuestLinksSummary): string {
  const links = guestCount === 0 ? "brak gości" : `${guestCount} ${pluralPl(guestCount, "link", "linki", "linków")}`;
  return `${formatGuestAccess(enabled)} · ${links}`;
}
