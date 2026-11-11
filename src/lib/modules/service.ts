import type { DbClient } from "@/lib/supabase-client";
import type { EventModulesDto } from "@/types";
import {
  enableProblem,
  isModuleActive,
  isPaidModule,
  MODULE_KEYS,
  withModule,
  type ModuleKey,
  type ModuleSets,
} from "./rules";

// Event modules in the database (event-modules, S-17). Every read and write is filtered by the event (and, for the
// venue, by the restaurant the panel guard opened); a template (is_template) is never a module-carrying event.

const COLUMNS = "modules_available, modules_enabled, modules_unlocked";

interface ModuleRow {
  modules_available: string[];
  modules_enabled: string[];
  modules_unlocked: string[];
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`Moduły wydarzenia (${what}): ${error.message}`);
}

export function moduleSetsOf(row: ModuleRow): ModuleSets {
  return { available: row.modules_available, enabled: row.modules_enabled, unlocked: row.modules_unlocked };
}

export function toEventModulesDto(sets: ModuleSets): EventModulesDto {
  return {
    modules: MODULE_KEYS.map((key) => ({
      key,
      available: sets.available.includes(key),
      enabled: sets.enabled.includes(key),
      paid: isPaidModule(key),
      unlocked: sets.unlocked.includes(key),
      active: isModuleActive(sets, key),
    })),
  };
}

async function readSets(db: DbClient, eventId: number, restaurantId?: number): Promise<ModuleSets | null> {
  let query = db.from("event").select(COLUMNS).eq("id", eventId).eq("is_template", false);
  if (restaurantId !== undefined) {
    query = query.eq("restaurant_id", restaurantId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    fail("odczyt", error);
  }
  return data ? moduleSetsOf(data) : null;
}

export async function getEventModules(db: DbClient, eventId: number): Promise<EventModulesDto | null> {
  const sets = await readSets(db, eventId);
  return sets ? toEventModulesDto(sets) : null;
}

export type SetModuleResult =
  { status: "updated"; modules: EventModulesDto } | { status: "unavailable" | "locked" | "not-found" };

// The client's switch (organizer route; staff through the dispatcher while „Lokal prowadzi” is on): only an available,
// free-or-unlocked module goes on; switching off always works and deletes nothing.
export async function setModuleEnabled(
  db: DbClient,
  eventId: number,
  key: ModuleKey,
  enabled: boolean,
): Promise<SetModuleResult> {
  const sets = await readSets(db, eventId);
  if (!sets) {
    return { status: "not-found" };
  }
  if (enabled) {
    const problem = enableProblem(sets, key);
    if (problem) {
      return { status: problem };
    }
  }
  const next = { ...sets, enabled: withModule(sets.enabled, key, enabled) };
  const { error } = await db
    .from("event")
    .update({ modules_enabled: next.enabled })
    .eq("id", eventId)
    .eq("is_template", false);
  if (error) {
    fail("włączenie", error);
  }
  return { status: "updated", modules: toEventModulesDto(next) };
}

// The venue's offer (owners and managers; never gated by the lead switch). Withdrawing keeps the client's choice, so
// offering the module again brings it back as the client left it.
export async function setModuleAvailable(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  key: ModuleKey,
  available: boolean,
): Promise<SetModuleResult> {
  const sets = await readSets(db, eventId, restaurantId);
  if (!sets) {
    return { status: "not-found" };
  }
  const next = { ...sets, available: withModule(sets.available, key, available) };
  const { error } = await db
    .from("event")
    .update({ modules_available: next.available })
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false);
  if (error) {
    fail("dostępność", error);
  }
  return { status: "updated", modules: toEventModulesDto(next) };
}

export type UnlockResult = { status: "changed" | "unchanged"; modules: EventModulesDto } | { status: "not-found" };

// The platform administrator's unlock (or lock again) of a paid module: the DB function accepts it only inside a live
// support visit of this login session to the event's restaurant and logs it for the owner.
export async function unlockEventModule(
  db: DbClient,
  sessionId: number,
  eventId: number,
  key: ModuleKey,
  unlocked: boolean,
): Promise<UnlockResult> {
  const { data, error } = await db.rpc("set_event_module_unlock", {
    p_session_id: sessionId,
    p_event_id: eventId,
    p_module: key,
    p_unlocked: unlocked,
  });
  if (error) {
    fail("odblokowanie", error);
  }
  if (data !== "changed" && data !== "unchanged") {
    return { status: "not-found" };
  }
  const modules = await getEventModules(db, eventId);
  return modules ? { status: data, modules } : { status: "not-found" };
}
