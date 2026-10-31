import { pluralPl } from "@/lib/guests/summary";
import type { VenueDto } from "@/types";

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

// "Plan wgrany · 3 sale · 7 stolików · 52 miejsca"
export function formatVenueSummary(summary: VenueSummary): string {
  return [
    summary.hasPlan ? "Plan wgrany" : "Brak planu",
    `${summary.rooms} ${pluralPl(summary.rooms, "sala", "sale", "sal")}`,
    `${summary.tables} ${pluralPl(summary.tables, "stolik", "stoliki", "stolików")}`,
    `${summary.seats} ${pluralPl(summary.seats, "miejsce", "miejsca", "miejsc")}`,
  ].join(" · ");
}
