import type {
  SeatOccupantDto,
  TemplateLostSeatDto,
  TemplateUpdatePreviewDto,
  VenueDto,
  VenueTemplateSummaryDto,
} from "@/types";
import { venueNameKey } from "./rules";

// What „Zaktualizuj z szablonu” would do to an event's venue (venue-templates, S-15), computed with the SAME rule as
// the database function apply_venue_template: rooms and tables are matched by name, case-insensitively. A matched
// table keeps its seats up to the template's seat count; an event table missing from the template loses all of them.
// Pure.

function byName(a: string, b: string): number {
  return a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" });
}

export function templateUpdatePreview(
  event: Pick<VenueDto, "plan" | "rooms" | "tables">,
  occupancy: readonly SeatOccupantDto[],
  template: Pick<VenueDto, "plan" | "rooms" | "tables">,
  summary: Pick<VenueTemplateSummaryDto, "id" | "name">,
): TemplateUpdatePreviewDto {
  const templateTables = new Map(template.tables.map((table) => [venueNameKey(table.name), table]));
  const eventTables = new Map(event.tables.map((table) => [venueNameKey(table.name), table]));
  const templateRooms = new Set(template.rooms.map((room) => venueNameKey(room.name)));
  const eventRooms = new Set(event.rooms.map((room) => venueNameKey(room.name)));

  const tablesRemoved: string[] = [];
  const tablesResized: string[] = [];
  const seatsKept = new Map<number, number>();
  for (const table of event.tables) {
    const match = templateTables.get(venueNameKey(table.name));
    if (!match) {
      tablesRemoved.push(table.name);
      seatsKept.set(table.id, 0);
      continue;
    }
    if (match.seatCount < table.seatCount) {
      tablesResized.push(table.name);
    }
    seatsKept.set(table.id, match.seatCount);
  }
  const tableNames = new Map(event.tables.map((table) => [table.id, table.name]));
  const lost: TemplateLostSeatDto[] = occupancy
    .filter((occupant) => occupant.seat > (seatsKept.get(occupant.tableId) ?? 0))
    .map((occupant) => ({
      guestName: occupant.guestName,
      table: tableNames.get(occupant.tableId) ?? "?",
      seat: occupant.seat,
    }))
    .sort((a, b) => byName(a.table, b.table) || a.seat - b.seat);

  return {
    templateId: summary.id,
    templateName: summary.name,
    lost,
    tablesAdded: template.tables
      .filter((table) => !eventTables.has(venueNameKey(table.name)))
      .map((table) => table.name)
      .sort(byName),
    tablesRemoved: tablesRemoved.sort(byName),
    tablesResized: tablesResized.sort(byName),
    roomsAdded: template.rooms
      .filter((room) => !eventRooms.has(venueNameKey(room.name)))
      .map((room) => room.name)
      .sort(byName),
    roomsRemoved: event.rooms
      .filter((room) => !templateRooms.has(venueNameKey(room.name)))
      .map((room) => room.name)
      .sort(byName),
    planChange: template.plan ? "replaced" : event.plan ? "removed" : "none",
  };
}
