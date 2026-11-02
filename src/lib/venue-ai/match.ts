import { MAX_TABLES, nextTableName, venueNameKey } from "@/lib/venue/rules";
import type {
  LayoutNewTableDto,
  LayoutRoomOutlineDto,
  LayoutTableUpdateDto,
  RoomOutline,
  VenueDto,
  VenueLayoutProposalDto,
} from "@/types";
import type { RawLayout, RawLayoutTable } from "./schema";

// Pairs what the AI saw with the venue (venue-drawing), pure. A proposed table is the existing table of the same name
// (case-insensitive, normalized); the rest pair with the nearest unpaired existing pin within MATCH_RADIUS, closest
// pairs first; each existing table pairs at most once. Unpaired proposals become new tables; unpaired existing tables
// stay where they are (nothing is ever deleted).

// A fraction of the plan: about a table's width on a typical plan.
export const MATCH_RADIUS = 0.08;
// Smaller moves than this (fraction of the plan) are not worth a line.
const MOVE_EPSILON = 0.002;

interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inside(outline: RoomOutline, point: Point): boolean {
  return (
    point.x >= outline.x &&
    point.x <= outline.x + outline.width &&
    point.y >= outline.y &&
    point.y <= outline.y + outline.height
  );
}

export function matchLayout(raw: RawLayout, venue: VenueDto): VenueLayoutProposalDto {
  const paired = new Map<number, RawLayoutTable>();
  const unpaired: RawLayoutTable[] = [];
  const byName = new Map(venue.tables.map((table) => [venueNameKey(table.name), table]));

  for (const proposed of raw.tables) {
    const table = byName.get(venueNameKey(proposed.name));
    if (table && !paired.has(table.id)) {
      paired.set(table.id, proposed);
    } else {
      unpaired.push(proposed);
    }
  }

  const candidates = unpaired
    .flatMap((proposed) =>
      venue.tables
        .filter((table) => !paired.has(table.id))
        .map((table) => ({ proposed, table, distance: distance(proposed, table) })),
    )
    .filter((pair) => pair.distance <= MATCH_RADIUS)
    .sort((a, b) => a.distance - b.distance);
  const used = new Set<RawLayoutTable>();
  for (const pair of candidates) {
    if (!paired.has(pair.table.id) && !used.has(pair.proposed)) {
      paired.set(pair.table.id, pair.proposed);
      used.add(pair.proposed);
    }
  }

  const updates: LayoutTableUpdateDto[] = [];
  for (const table of venue.tables) {
    const proposed = paired.get(table.id);
    if (!proposed) {
      continue;
    }
    const moved = distance(proposed, table) > MOVE_EPSILON;
    if (moved || proposed.rotation !== table.rotation) {
      updates.push({
        tableId: table.id,
        name: table.name,
        x: proposed.x,
        y: proposed.y,
        rotation: proposed.rotation,
        previous: { x: table.x, y: table.y, rotation: table.rotation },
      });
    }
  }

  const roomByName = new Map(venue.rooms.map((room) => [venueNameKey(room.name), room]));
  const rooms: LayoutRoomOutlineDto[] = [];
  const outlined = new Set<number>();
  for (const proposed of raw.rooms) {
    const room = roomByName.get(venueNameKey(proposed.name));
    if (room && !outlined.has(room.id)) {
      outlined.add(room.id);
      rooms.push({ roomId: room.id, name: room.name, outline: proposed.outline, previous: room.outline });
    }
  }

  // A new table's room: the one it names, else the room whose (proposed or current) outline holds it, else the first.
  const outlines = venue.rooms.map((room) => ({
    id: room.id,
    outline: rooms.find((proposed) => proposed.roomId === room.id)?.outline ?? room.outline,
  }));
  function roomFor(proposed: RawLayoutTable): number | null {
    const named = roomByName.get(venueNameKey(proposed.room));
    if (named) {
      return named.id;
    }
    const holding = outlines.find((room) => room.outline !== null && inside(room.outline, proposed));
    return holding ? holding.id : venue.rooms.length > 0 ? venue.rooms[0].id : null;
  }

  const names = venue.tables.map((table) => table.name);
  const taken = new Set(names.map(venueNameKey));
  const room = MAX_TABLES - venue.tables.length;
  const newTables: LayoutNewTableDto[] = [];
  let skipped = 0;
  for (const proposed of unpaired) {
    if (used.has(proposed)) {
      continue;
    }
    const roomId = roomFor(proposed);
    if (roomId === null || newTables.length >= room) {
      skipped += 1;
      continue;
    }
    const name = taken.has(venueNameKey(proposed.name)) ? nextTableName(names) : proposed.name;
    names.push(name);
    taken.add(venueNameKey(name));
    newTables.push({
      roomId,
      name,
      shape: proposed.shape,
      seatCount: proposed.seatCount,
      x: proposed.x,
      y: proposed.y,
      rotation: proposed.rotation,
    });
  }

  return { chairPitch: raw.chairPitch, previousChairPitch: venue.chairPitch, updates, newTables, rooms, skipped };
}
