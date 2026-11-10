import type { DbClient } from "@/lib/supabase-client";
import type { PriceKind, PriceListDto } from "@/types";
import { getDrinkItems } from "./drinks-service";
import { newestPriceFor, priceAfterRename, priceList } from "./prices";
import { dishKey } from "./rules";

// Prices of one event (client-restaurant-split, FR-027), DB side; every read and write limited to `eventId`. The
// client's and the dispatcher's order routes ask for the price of a new (or renamed) line; „Cennik wydarzenia” in the
// panel sets the price of every line of one name. Supabase errors always throw.

const TABLES = { dish: "order_item", drink: "drink_item" } as const;

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

async function pricedLines(db: DbClient, eventId: number, kind: PriceKind) {
  if (kind === "drink") {
    return getDrinkItems(db, eventId);
  }
  const { data, error } = await db
    .from("order_item")
    .select("id, name, unit_price_grosze")
    .eq("event_id", eventId)
    .order("id");
  if (error) {
    fail("odczytać cen", error.message);
  }
  return data.map((row) => ({ id: row.id, name: row.name, unitPriceGrosze: row.unit_price_grosze }));
}

// The price of a new line of that name: the newest line's of the same name in this event, else the fallback (0, or
// the catalog price of a menu item — menu-catalog-courses).
export async function priceForNewLine(
  db: DbClient,
  eventId: number,
  kind: PriceKind,
  name: string,
  fallback = 0,
): Promise<number> {
  return newestPriceFor(await pricedLines(db, eventId, kind), name, null, fallback);
}

// The price of a line renamed to `name`, or null to keep its own (same name in another spelling, or no such line).
export async function priceForRenamedLine(
  db: DbClient,
  eventId: number,
  kind: PriceKind,
  id: number,
  name: string,
  fallback = 0,
): Promise<number | null> {
  return priceAfterRename(await pricedLines(db, eventId, kind), id, name, fallback);
}

export async function getPriceList(db: DbClient, eventId: number): Promise<PriceListDto> {
  const [items, drinks] = await Promise.all([pricedLines(db, eventId, "dish"), getDrinkItems(db, eventId)]);
  return { rows: priceList(items, drinks) };
}

export type SetPriceResult = { status: "updated" } | { status: "not-found" };

// „Cennik wydarzenia”: every line of that name (any letter case) gets the price; not-found when the event has none.
export async function setEventPrice(
  db: DbClient,
  eventId: number,
  kind: PriceKind,
  name: string,
  grosze: number,
): Promise<SetPriceResult> {
  const key = dishKey(name);
  const ids = (await pricedLines(db, eventId, kind))
    .filter((line) => key !== "" && dishKey(line.name) === key)
    .map((line) => line.id);
  if (ids.length === 0) {
    return { status: "not-found" };
  }
  const { error } = await db
    .from(TABLES[kind])
    .update({ unit_price_grosze: grosze, updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .in("id", ids);
  if (error) {
    fail("zmienić ceny", error.message);
  }
  return { status: "updated" };
}
