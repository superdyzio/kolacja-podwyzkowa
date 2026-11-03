import type { Locale } from "@/lib/i18n/locale";
import type { VenueDto } from "@/types";
import { venueMessages } from "./messages";

// Counts for the organizer views (pure; used by the organizer shell and the rooms-and-tables island).

export interface VenueSummary {
  hasPlan: boolean;
  rooms: number;
  tables: number;
  seats: number;
}

export function summarizeVenue(venue: VenueDto): VenueSummary {
  return {
    hasPlan: venue.plan !== null,
    rooms: venue.rooms.length,
    tables: venue.tables.length,
    seats: venue.tables.reduce((sum, table) => sum + table.seatCount, 0),
  };
}

// "Plan wgrany · 3 sale · 7 stolików · 52 miejsca" / "Plan uploaded · 3 rooms · 7 tables · 52 seats"
export function formatVenueSummary(summary: VenueSummary, locale: Locale = "pl"): string {
  const messages = venueMessages(locale);
  return [
    summary.hasPlan ? messages.planUploaded : messages.planNotUploaded,
    messages.rooms(summary.rooms),
    messages.tables(summary.tables),
    messages.seats(summary.seats),
  ].join(" · ");
}
