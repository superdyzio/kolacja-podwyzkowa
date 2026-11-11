import type { Locale } from "@/lib/i18n/locale";

// „Wydarzenia: 3 · Zespół: 2” — the counters of a restaurant in the platform list (platform-restaurants, S-10). Pure.
export function formatRestaurantCounters(
  counts: { eventCount: number; memberCount: number },
  locale: Locale = "pl",
): string {
  return locale === "en"
    ? `Events: ${String(counts.eventCount)} · Team: ${String(counts.memberCount)}`
    : `Wydarzenia: ${String(counts.eventCount)} · Zespół: ${String(counts.memberCount)}`;
}
