import type { Database } from "@/db/database.types";

// Shared entity types (DB rows and DTOs).

type Tables = Database["public"]["Tables"];

export type EventRow = Tables["event"]["Row"];
export type GuestRow = Tables["guest"]["Row"];
export type GuestGroupRow = Tables["guest_group"]["Row"];

// A guest as the organizer UI and later slices see it.
export interface GuestDto {
  id: number;
  displayName: string;
  isAbsent: boolean;
  // The inseparable group this guest belongs to (at most one), or null.
  groupId: number | null;
}

// An inseparable group of 2–5 guests; memberIds in the same (Polish alphabetical) order as the guest list.
export interface GuestGroupDto {
  id: number;
  memberIds: number[];
}

// The whole guest list: guests in Polish alphabetical order, groups ordered by their first member.
export interface GuestListDto {
  guests: GuestDto[];
  groups: GuestGroupDto[];
}

export type VenuePlanRow = Tables["venue_plan"]["Row"];
export type VenueRoomRow = Tables["venue_room"]["Row"];
export type VenueTableRow = Tables["venue_table"]["Row"];

// Plan image types the app accepts (recognized by magic bytes, never by the client's header).
export type PlanImageType = "image/png" | "image/jpeg" | "image/webp";

// round: seats 1..n clockwise; rectangular: side A then side B (see src/lib/venue/seats.ts).
export type TableShape = "round" | "rectangular";

// Plan metadata (never the image itself). `version` (epoch ms of the last upload) goes into the image URL so a
// replaced plan gets a new URL.
export interface VenuePlanDto {
  mimeType: PlanImageType;
  byteSize: number;
  version: number;
}

export interface RoomDto {
  id: number;
  name: string;
}

// A table with its pin: x, y are fractions 0–1 of the rendered plan image from its top-left corner.
export interface TableDto {
  id: number;
  roomId: number;
  name: string;
  seatCount: number;
  shape: TableShape;
  x: number;
  y: number;
}

// The whole venue: plan metadata (null before the first upload), rooms in creation order, tables ordered by room
// and then by name (numeric-aware, Polish).
export interface VenueDto {
  plan: VenuePlanDto | null;
  rooms: RoomDto[];
  tables: TableDto[];
}
