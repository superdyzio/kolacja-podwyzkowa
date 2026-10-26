import type { Database } from "@/db/database.types";
import type { DbClient } from "@/lib/supabase-client";
import type { GuestDto, GuestGroupDto, GuestListDto, GuestRow } from "@/types";
import {
  displayNameKey,
  MAX_GUESTS,
  normalizeDisplayName,
  validateDisplayName,
  type DisplayNameProblem,
} from "./names";

// Guest list, inseparable groups and absences (PRD FR-001..FR-003) for the singleton event. Functions take the
// client as a parameter (no `astro:*`), so they are tested against the local DB. Supabase errors always throw;
// expected outcomes (not found, duplicate name, group rules) come back as status unions.
//
// Group rules live in the database: create_guest_group() creates a group of 2–5 ungrouped guests atomically, and a
// trigger dissolves any group that drops below 2 members (e.g. when a member is deleted).

const UNIQUE_VIOLATION = "23505";
const GUEST_COLUMNS = "id, display_name, is_absent, group_id";

type GuestColumns = Pick<GuestRow, "id" | "display_name" | "is_absent" | "group_id">;
type GuestUpdate = Database["public"]["Tables"]["guest"]["Update"];

const polishCollator = new Intl.Collator("pl");

export type AddGuestsResult =
  | { status: "added"; added: GuestDto[] }
  | { status: "duplicates"; names: string[] }
  | { status: "too-many"; limit: number; existing: number };

export type UpdateGuestResult =
  | { status: "updated"; guest: GuestDto }
  | { status: "not-found" }
  | { status: "duplicate" }
  | { status: "invalid"; reason: DisplayNameProblem };

export type DeleteGuestResult = { status: "deleted" } | { status: "not-found" };

export type CreateGroupResult =
  | { status: "created"; groupId: number }
  | { status: "invalid-size" }
  | { status: "not-found" }
  | { status: "already-grouped" };

export type DissolveGroupResult = { status: "dissolved" } | { status: "not-found" };

export interface GuestPatch {
  displayName?: string;
  isAbsent?: boolean;
}

function toGuestDto(row: GuestColumns): GuestDto {
  return { id: row.id, displayName: row.display_name, isAbsent: row.is_absent, groupId: row.group_id };
}

function compareGuests(a: GuestDto, b: GuestDto): number {
  return polishCollator.compare(a.displayName, b.displayName) || a.id - b.id;
}

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

// Guests in Polish alphabetical order; groups derived from the members' group_id, ordered by their first member.
export async function getGuestList(db: DbClient): Promise<GuestListDto> {
  const { data, error } = await db.from("guest").select(GUEST_COLUMNS);
  if (error) {
    fail("odczytać listy gości", error.message);
  }
  const guests = data.map(toGuestDto).sort(compareGuests);

  const membersByGroup = new Map<number, number[]>();
  for (const guest of guests) {
    if (guest.groupId === null) {
      continue;
    }
    const members = membersByGroup.get(guest.groupId) ?? [];
    members.push(guest.id);
    membersByGroup.set(guest.groupId, members);
  }
  const groups: GuestGroupDto[] = [...membersByGroup].map(([id, memberIds]) => ({ id, memberIds }));

  return { guests, groups };
}

// Names that are already on the list or repeated within `names` (compared like the unique index).
function findDuplicates(names: readonly string[], existingNames: readonly string[]): string[] {
  const taken = new Set(existingNames.map(displayNameKey));
  const duplicates: string[] = [];
  for (const name of names) {
    const key = displayNameKey(name);
    if (taken.has(key)) {
      duplicates.push(name);
    }
    taken.add(key);
  }
  return duplicates;
}

async function readAllNames(db: DbClient): Promise<string[]> {
  const { data, error } = await db.from("guest").select("display_name");
  if (error) {
    fail("odczytać listy gości", error.message);
  }
  return data.map((row) => row.display_name);
}

// Adds guests all-or-nothing. Expects names already parsed (parseGuestList); an invalid name is a caller bug.
export async function addGuests(db: DbClient, names: readonly string[]): Promise<AddGuestsResult> {
  const normalized = names.map(normalizeDisplayName);
  const invalid = normalized.find((name) => validateDisplayName(name) !== null);
  if (invalid !== undefined) {
    throw new TypeError(`Nieprawidłowa nazwa gościa: „${invalid}”`);
  }
  if (normalized.length === 0) {
    return { status: "added", added: [] };
  }

  const existingNames = await readAllNames(db);
  const duplicates = findDuplicates(normalized, existingNames);
  if (duplicates.length > 0) {
    return { status: "duplicates", names: duplicates };
  }
  if (existingNames.length + normalized.length > MAX_GUESTS) {
    return { status: "too-many", limit: MAX_GUESTS, existing: existingNames.length };
  }

  const { data, error } = await db
    .from("guest")
    .insert(normalized.map((display_name) => ({ display_name })))
    .select(GUEST_COLUMNS);
  if (error) {
    // Someone added the same name in the meantime: the unique index is the backstop.
    if (error.code === UNIQUE_VIOLATION) {
      const raced = findDuplicates(normalized, await readAllNames(db));
      return { status: "duplicates", names: raced.length > 0 ? raced : normalized };
    }
    fail("dodać gości", error.message);
  }
  return { status: "added", added: data.map(toGuestDto).sort(compareGuests) };
}

// Renames and/or marks a guest absent/present. Group membership is never changed here.
export async function updateGuest(db: DbClient, id: number, patch: GuestPatch): Promise<UpdateGuestResult> {
  const update: GuestUpdate = {};
  if (patch.displayName !== undefined) {
    const name = normalizeDisplayName(patch.displayName);
    const problem = validateDisplayName(name);
    if (problem) {
      return { status: "invalid", reason: problem };
    }
    update.display_name = name;
  }
  if (patch.isAbsent !== undefined) {
    update.is_absent = patch.isAbsent;
  }

  const query =
    Object.keys(update).length > 0
      ? db.from("guest").update(update).eq("id", id).select(GUEST_COLUMNS).maybeSingle()
      : db.from("guest").select(GUEST_COLUMNS).eq("id", id).maybeSingle();
  const { data, error } = await query;
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("zmienić gościa", error.message);
  }
  return data ? { status: "updated", guest: toGuestDto(data) } : { status: "not-found" };
}

// Deletes a guest. If that leaves their group with fewer than 2 members, the DB dissolves the group.
export async function deleteGuest(db: DbClient, id: number): Promise<DeleteGuestResult> {
  const { data, error } = await db.from("guest").delete().eq("id", id).select("id");
  if (error) {
    fail("usunąć gościa", error.message);
  }
  return data.length > 0 ? { status: "deleted" } : { status: "not-found" };
}

const GROUP_ERRORS: Record<string, CreateGroupResult> = {
  GROUP_SIZE: { status: "invalid-size" },
  GUEST_NOT_FOUND: { status: "not-found" },
  GUEST_ALREADY_GROUPED: { status: "already-grouped" },
};

// Creates an inseparable group of 2–5 existing guests who are not in a group yet (repeated ids count once).
export async function createGroup(db: DbClient, guestIds: readonly number[]): Promise<CreateGroupResult> {
  const { data, error } = await db.rpc("create_guest_group", { p_guest_ids: [...guestIds] });
  if (error) {
    const known = Object.hasOwn(GROUP_ERRORS, error.message) ? GROUP_ERRORS[error.message] : undefined;
    if (known) {
      return known;
    }
    fail("utworzyć grupy", error.message);
  }
  return { status: "created", groupId: data };
}

// Dissolves a group: its members stay on the list without a group.
export async function dissolveGroup(db: DbClient, groupId: number): Promise<DissolveGroupResult> {
  const { data, error } = await db.from("guest_group").delete().eq("id", groupId).select("id");
  if (error) {
    fail("rozwiązać grupy", error.message);
  }
  return data.length > 0 ? { status: "dissolved" } : { status: "not-found" };
}
