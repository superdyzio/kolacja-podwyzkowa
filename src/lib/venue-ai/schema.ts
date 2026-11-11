import { z } from "astro/zod";
import { displayNameLength } from "@/lib/guests/names";
import { MIN_OUTLINE_SIZE } from "@/lib/venue/editor";
import {
  MAX_CHAIR_PITCH,
  MAX_SEATS,
  MAX_TABLES,
  MAX_TABLE_NAME_LENGTH,
  MIN_CHAIR_PITCH,
  MIN_SEATS,
  isValidOutline,
  normalizeRotation,
  normalizeVenueName,
  roundChairPitch,
  roundFraction,
  roundOutline,
  type OutlineFields,
} from "@/lib/venue/rules";
import type { TableShape } from "@/types";

// What the model returns for a plan image (venue-drawing), pure: the JSON schema sent as output_config.format and the
// parse of its answer. The schema stays simple (no numeric bounds, which structured outputs may not enforce); every
// value is clamped here instead, so a slightly-off answer is still usable.

export const LAYOUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chairPitch", "rooms", "tables"],
  properties: {
    chairPitch: {
      type: "number",
      description: "Distance between the centres of two neighbouring chairs, as a fraction of the image width.",
    },
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "x", "y", "width", "height"],
        properties: {
          name: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
    },
    tables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "room", "shape", "seatCount", "x", "y", "rotation"],
        properties: {
          name: { type: "string" },
          room: { type: "string" },
          shape: { type: "string", enum: ["round", "rectangular"] },
          seatCount: { type: "integer" },
          x: { type: "number" },
          y: { type: "number" },
          rotation: { type: "number" },
        },
      },
    },
  },
} as const;

export interface RawLayoutTable {
  name: string;
  room: string;
  shape: TableShape;
  seatCount: number;
  x: number;
  y: number;
  rotation: number;
}

export interface RawLayoutRoom {
  name: string;
  outline: OutlineFields;
}

export interface RawLayout {
  // null: no usable scale in the answer (missing or out of range) — the venue keeps its own.
  chairPitch: number | null;
  rooms: RawLayoutRoom[];
  tables: RawLayoutTable[];
}

// More than any venue here needs (MAX_TABLES + 30); the rest of an over-long answer is ignored.
const MAX_PROPOSED_TABLES = MAX_TABLES + 30;
const MAX_PROPOSED_ROOMS = 20;

const finite = z.number().refine(Number.isFinite);

const RawSchema = z.object({
  chairPitch: z.unknown(),
  rooms: z.array(z.unknown()),
  tables: z.array(z.unknown()),
});

const RoomSchema = z.object({ name: z.string(), x: finite, y: finite, width: finite, height: finite });

const TableSchema = z.object({
  name: z.string(),
  room: z.string().catch(""),
  shape: z.enum(["round", "rectangular"]).catch("round"),
  seatCount: finite,
  x: finite,
  y: finite,
  rotation: finite.catch(0),
});

function clampName(raw: string): string {
  const name = normalizeVenueName(raw);
  return displayNameLength(name) <= MAX_TABLE_NAME_LENGTH
    ? name
    : Array.from(name).slice(0, MAX_TABLE_NAME_LENGTH).join("").trim();
}

// Smaller than the editor's smallest drawn room: not a room.
function clampOutline(room: z.infer<typeof RoomSchema>): OutlineFields | null {
  const x = roundFraction(room.x);
  const y = roundFraction(room.y);
  if (Math.min(1 - x, room.width) < MIN_OUTLINE_SIZE || Math.min(1 - y, room.height) < MIN_OUTLINE_SIZE) {
    return null;
  }
  const outline = roundOutline({
    x,
    y,
    width: Math.min(1 - x, Math.max(0, room.width)),
    height: Math.min(1 - y, Math.max(0, room.height)),
  });
  return isValidOutline(outline) ? outline : null;
}

// The model's answer → a clamped layout, or null when it is not the expected JSON at all. Entries that cannot be
// used (no name, an outline of zero size) are dropped one by one.
export function parseLayoutText(text: string): RawLayout | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = RawSchema.safeParse(json);
  if (!raw.success) {
    return null;
  }
  const pitch =
    typeof raw.data.chairPitch === "number" && Number.isFinite(raw.data.chairPitch) ? raw.data.chairPitch : 0;
  const chairPitch = pitch >= MIN_CHAIR_PITCH && pitch <= MAX_CHAIR_PITCH ? roundChairPitch(pitch) : null;

  const rooms: RawLayoutRoom[] = [];
  for (const entry of raw.data.rooms.slice(0, MAX_PROPOSED_ROOMS)) {
    const room = RoomSchema.safeParse(entry);
    const outline = room.success ? clampOutline(room.data) : null;
    const name = room.success ? normalizeVenueName(room.data.name) : "";
    if (room.success && outline && name !== "") {
      rooms.push({ name, outline });
    }
  }

  const tables: RawLayoutTable[] = [];
  for (const entry of raw.data.tables.slice(0, MAX_PROPOSED_TABLES)) {
    const table = TableSchema.safeParse(entry);
    if (!table.success) {
      continue;
    }
    const name = clampName(table.data.name);
    if (name === "") {
      continue;
    }
    tables.push({
      name,
      room: normalizeVenueName(table.data.room),
      shape: table.data.shape,
      seatCount: Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(table.data.seatCount))),
      x: roundFraction(table.data.x),
      y: roundFraction(table.data.y),
      // A round table has no direction worth keeping.
      rotation: table.data.shape === "round" ? 0 : normalizeRotation(table.data.rotation),
    });
  }
  return { chairPitch, rooms, tables };
}
