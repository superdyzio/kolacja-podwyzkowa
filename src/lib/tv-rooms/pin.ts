import { displayNameKey, displayNameLength, normalizeDisplayName } from "@/lib/guests/names";

// Pinning a TV to one room (tv-room-rotation, S-20; FR-034): `/tv/<key>?sala=<room name>`. No new secret: the TV key
// still decides everything; the parameter only chooses which of THAT event's rooms the TV shows. Several TVs = one
// link each. An unknown or malformed room gives the whole venue (or the rotation), never an error.

export const ROOM_PIN_PARAM = "sala";
// Room names are 1–40 code points (S-02).
const MAX_ROOM_PIN_LENGTH = 40;

// The query value cleaned like a room name, or null when it cannot be one.
export function parseRoomPin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const name = normalizeDisplayName(raw);
  return name === "" || displayNameLength(name) > MAX_ROOM_PIN_LENGTH ? null : name;
}

// The room's own name (as published) for a pin, case-insensitively, or null when the event has no such room.
export function resolveRoomPin(pin: string | null, rooms: readonly string[]): string | null {
  if (pin === null) {
    return null;
  }
  const key = displayNameKey(pin);
  return rooms.find((room) => displayNameKey(room) === key) ?? null;
}

// The TV link pinned to one room: "/tv/<key>?sala=<encoded room name>" (or an absolute URL when given one).
export function tvRoomPath(tvPath: string, room: string): string {
  return `${tvPath}?${ROOM_PIN_PARAM}=${encodeURIComponent(room)}`;
}
