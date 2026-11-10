import { getEventBranding } from "@/lib/branding/service";
import { dietBoard } from "@/lib/diets/board";
import { getGuestList } from "@/lib/guests/service";
import { isUpToDate, toPublishedSeating } from "@/lib/seating/published";
import { getAssignments, getLatestSnapshot } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { getVenue } from "@/lib/venue/service";
import type { RoomPrintSourceDto } from "@/types";

// What a room print reads (room-prints, S-24; FR-038) — ONE loader for every print page (client, panel, floors),
// called after the page's guard opened the event: its name, date and whether the guests' data was deleted (S-26), the
// brand, the latest PUBLISHED seating (id-free), whether the working arrangement still matches it (the same reads as
// the seating board) and — only with `diets` (the staff list) — the diets at the published seats (S-23's diet board).
// Null for an unknown id or a venue template.

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

export async function getRoomPrintSource(
  db: DbClient,
  eventId: number,
  { diets }: { diets: boolean },
): Promise<RoomPrintSourceDto | null> {
  const [eventRow, branding, guestList, venue, assignments, latest] = await Promise.all([
    db
      .from("event")
      .select("name, event_date, guest_data_purged_at")
      .eq("id", eventId)
      .eq("is_template", false)
      .maybeSingle(),
    getEventBranding(db, eventId),
    getGuestList(db, eventId),
    getVenue(db, eventId),
    getAssignments(db, eventId),
    getLatestSnapshot(db, eventId),
  ]);
  if (eventRow.error) {
    fail("odczytać wydarzenia do wydruku", eventRow.error.message);
  }
  if (!eventRow.data) {
    return null;
  }
  return {
    event: {
      name: eventRow.data.name,
      date: eventRow.data.event_date,
      purgedAt: eventRow.data.guest_data_purged_at,
    },
    branding,
    published: toPublishedSeating(latest),
    upToDate: isUpToDate(latest, { guestList, venue, assignments }),
    diets: diets ? dietBoard(latest, guestList.guests) : null,
  };
}
