import type { VenuePromptInput } from "./provider";

// The request for a layout read (venue-drawing), pure. Only the venue goes in: room names, table names, shapes, seat
// counts and current positions. Never guest names or any other guest data.

export const VENUE_LAYOUT_SYSTEM_PROMPT =
  "You read floor plans of restaurants and event venues and describe their dining tables as structured data. " +
  "Coordinates are fractions of the image: x from the left edge (0) to the right edge (1), y from the top edge (0) " +
  "to the bottom edge (1). Report only what the image shows.";

function fraction(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function buildLayoutPrompt(venue: VenuePromptInput): string {
  const rooms = venue.rooms.length === 0 ? "(none)" : venue.rooms.map((room) => `- ${room.name}`).join("\n");
  const tables =
    venue.tables.length === 0
      ? "(none)"
      : venue.tables
          .map(
            (table) =>
              `- ${table.name}: ${table.shape}, ${String(table.seatCount)} seats, now at x=${fraction(table.x)} ` +
              `y=${fraction(table.y)}, rotation ${String(table.rotation)}°`,
          )
          .join("\n");
  return [
    "The image is the floor plan of the venue (a photo, a scan or a screenshot). Find every dining table on it.",
    "",
    "For each table return:",
    "- name: the exact name of the matching table from the list below; for a table that is not on the list, a short new name (at most 24 characters).",
    "- room: the exact name of the room from the list below that the table stands in.",
    '- shape: "round" or "rectangular" (square tables count as rectangular).',
    "- seatCount: the chairs at the table, 2 to 20. For a table from the list keep its seat count unless the image clearly shows otherwise.",
    "- x, y: the centre of the table.",
    "- rotation: degrees clockwise. A rectangular table at 0° has its long sides horizontal; at 90° they are vertical. Round tables: 0.",
    "",
    "For each room from the list that you can see as an area of the plan, return its bounding rectangle: x and y of the top-left corner, width and height. Use the exact room name; skip rooms you cannot find.",
    "",
    "chairPitch: the usual distance between the centres of two neighbouring chairs at a table, as a fraction of the image width (often 0.01 to 0.06).",
    "",
    "Rooms:",
    rooms,
    "",
    "Tables (their current positions may be rough or wrong):",
    tables,
  ].join("\n");
}
