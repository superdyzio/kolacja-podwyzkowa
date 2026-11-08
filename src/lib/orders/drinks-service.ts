import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import type { DrinkItemDto } from "@/types";
import { MAX_DRINK_ITEMS } from "./drinks";

// The drinks on the restaurant's bill (bill-drinks) for the singleton event: the organizer's own list for checking the
// bill. Only the organizer's order board reads it — never the guest, TV or restaurant paths. Supabase errors always
// throw; expected outcomes come back as status unions. Inputs are already normalized and validated (drinks.ts).

const DRINK_COLUMNS = "id, name, quantity, unit_price_grosze";
// PostgREST's "no such table" (and Postgres' own code). Only while the code runs before its migration (deploy order
// mistake on the evening): the order page and „Wydane” keep working with an empty drinks list; adding one still fails.
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

interface DrinkRow {
  id: number;
  name: string;
  quantity: number;
  unit_price_grosze: number;
}

function toDrinkDto(row: DrinkRow): DrinkItemDto {
  return { id: row.id, name: row.name, quantity: row.quantity, unitPriceGrosze: row.unit_price_grosze };
}

// In the order they were entered.
export async function getDrinkItems(db: DbClient): Promise<DrinkItemDto[]> {
  const { data, error } = await db.from("drink_item").select(DRINK_COLUMNS).eq("event_id", EVENT_ID).order("id");
  if (error) {
    if (MISSING_TABLE_CODES.has(error.code)) {
      // eslint-disable-next-line no-console -- the only trace of the deploy-order mistake (Lambda logs)
      console.error(`drink_item is missing (${error.code}): run the migration 20261108120000_bill_drinks.sql`);
      return [];
    }
    fail("odczytać napojów", error.message);
  }
  return data.map(toDrinkDto);
}

export interface DrinkInput {
  name: string;
  quantity: number;
  unitPriceGrosze: number;
}

export type DrinkPatch = Partial<DrinkInput>;

export type AddDrinkResult = { status: "added" } | { status: "too-many" };

export async function addDrinkItem(db: DbClient, input: DrinkInput): Promise<AddDrinkResult> {
  const counted = await db.from("drink_item").select("id", { count: "exact", head: true }).eq("event_id", EVENT_ID);
  if (counted.error) {
    fail("dodać napoju", counted.error.message);
  }
  if ((counted.count ?? 0) >= MAX_DRINK_ITEMS) {
    return { status: "too-many" };
  }
  const { error } = await db.from("drink_item").insert({
    event_id: EVENT_ID,
    name: input.name,
    quantity: input.quantity,
    unit_price_grosze: input.unitPriceGrosze,
  });
  if (error) {
    fail("dodać napoju", error.message);
  }
  return { status: "added" };
}

export type UpdateDrinkResult = { status: "updated" } | { status: "not-found" };

export async function updateDrinkItem(db: DbClient, id: number, patch: DrinkPatch): Promise<UpdateDrinkResult> {
  const { data, error } = await db
    .from("drink_item")
    .update({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.quantity === undefined ? {} : { quantity: patch.quantity }),
      ...(patch.unitPriceGrosze === undefined ? {} : { unit_price_grosze: patch.unitPriceGrosze }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("event_id", EVENT_ID)
    .select("id");
  if (error) {
    fail("zmienić napoju", error.message);
  }
  return data.length > 0 ? { status: "updated" } : { status: "not-found" };
}

export type DeleteDrinkResult = { status: "deleted" } | { status: "not-found" };

export async function deleteDrinkItem(db: DbClient, id: number): Promise<DeleteDrinkResult> {
  const { data, error } = await db.from("drink_item").delete().eq("id", id).eq("event_id", EVENT_ID).select("id");
  if (error) {
    fail("usunąć napoju", error.message);
  }
  return data.length > 0 ? { status: "deleted" } : { status: "not-found" };
}
