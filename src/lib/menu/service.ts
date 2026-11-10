import type { DbClient } from "@/lib/supabase-client";
import type { EventMenuDto, EventMenuMode, MenuCatalogDto, MenuItemDto } from "@/types";
import {
  availableItems,
  compareMenuItems,
  isEventMenuMode,
  isMenuCourse,
  MAX_MENU_ITEMS,
  type MenuItemInput,
} from "./rules";

// The menu catalog of a restaurant and the menu of each event (menu-catalog-courses, S-16; FR-037), DB side. Every
// catalog query is filtered by the restaurant id the guard opened and every event query by the event id (and its
// restaurant), so another restaurant's item is exactly an unknown one. Supabase errors always throw; expected outcomes
// come back as status unions. Inputs are already validated (rules.ts).

const UNIQUE_VIOLATION = "23505";
const ITEM_COLUMNS = "id, name, course, price_grosze";

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

interface ItemRow {
  id: number;
  name: string;
  course: string;
  price_grosze: number;
}

function toItem(row: ItemRow): MenuItemDto {
  return {
    id: row.id,
    name: row.name,
    course: isMenuCourse(row.course) ? row.course : "main",
    priceGrosze: row.price_grosze,
  };
}

async function catalogItems(db: DbClient, restaurantId: number): Promise<MenuItemDto[]> {
  const { data, error } = await db.from("menu_item").select(ITEM_COLUMNS).eq("restaurant_id", restaurantId);
  if (error) {
    fail("odczytać menu lokalu", error.message);
  }
  return data.map(toItem).sort((a, b) => compareMenuItems(a, b) || a.id - b.id);
}

export async function getMenuCatalog(db: DbClient, restaurantId: number): Promise<MenuCatalogDto> {
  return { restaurantId, items: await catalogItems(db, restaurantId) };
}

export type AddMenuItemResult = { status: "added"; id: number } | { status: "duplicate" } | { status: "too-many" };

export async function addMenuItem(
  db: DbClient,
  restaurantId: number,
  input: MenuItemInput,
): Promise<AddMenuItemResult> {
  const counted = await db
    .from("menu_item")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  if (counted.error) {
    fail("dodać pozycji menu", counted.error.message);
  }
  if ((counted.count ?? 0) >= MAX_MENU_ITEMS) {
    return { status: "too-many" };
  }
  const { data, error } = await db
    .from("menu_item")
    .insert({ restaurant_id: restaurantId, name: input.name, course: input.course, price_grosze: input.priceGrosze })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("dodać pozycji menu", error.message);
  }
  return { status: "added", id: data.id };
}

export type UpdateMenuItemResult = { status: "updated" } | { status: "not-found" } | { status: "duplicate" };

// A catalog change never touches order lines (they keep their name, course and price).
export async function updateMenuItem(
  db: DbClient,
  restaurantId: number,
  id: number,
  patch: Partial<MenuItemInput>,
): Promise<UpdateMenuItemResult> {
  const { data, error } = await db
    .from("menu_item")
    .update({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.course === undefined ? {} : { course: patch.course }),
      ...(patch.priceGrosze === undefined ? {} : { price_grosze: patch.priceGrosze }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "duplicate" };
    }
    fail("zmienić pozycji menu", error.message);
  }
  return data.length === 0 ? { status: "not-found" } : { status: "updated" };
}

export type DeleteMenuItemResult = { status: "deleted" } | { status: "not-found" };

// The item leaves every event's menu (event_menu_item cascades); order lines keep it (menu_item_id set null).
export async function deleteMenuItem(db: DbClient, restaurantId: number, id: number): Promise<DeleteMenuItemResult> {
  const { data, error } = await db
    .from("menu_item")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select("id");
  if (error) {
    fail("usunąć pozycji menu", error.message);
  }
  return data.length === 0 ? { status: "not-found" } : { status: "deleted" };
}

interface EventMenuSource {
  restaurantId: number;
  mode: EventMenuMode;
  catalog: MenuItemDto[];
  chosen: Set<number>;
}

// The event's mode, its restaurant's catalog and the reduced menu's items; null for an unknown event or a template.
async function eventMenuSource(db: DbClient, eventId: number): Promise<EventMenuSource | null> {
  const { data: event, error } = await db
    .from("event")
    .select("restaurant_id, menu_mode")
    .eq("id", eventId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("odczytać menu wydarzenia", error.message);
  }
  if (!event) {
    return null;
  }
  const mode = isEventMenuMode(event.menu_mode) ? event.menu_mode : "off";
  if (mode === "off") {
    return { restaurantId: event.restaurant_id, mode, catalog: [], chosen: new Set() };
  }
  const [catalog, chosen] = await Promise.all([
    catalogItems(db, event.restaurant_id),
    mode === "reduced" ? chosenItems(db, eventId) : Promise.resolve(new Set<number>()),
  ]);
  return { restaurantId: event.restaurant_id, mode, catalog, chosen };
}

async function chosenItems(db: DbClient, eventId: number): Promise<Set<number>> {
  const { data, error } = await db.from("event_menu_item").select("menu_item_id").eq("event_id", eventId);
  if (error) {
    fail("odczytać menu wydarzenia", error.message);
  }
  return new Set(data.map((row) => row.menu_item_id));
}

// What the event offers right now (empty = free text): the order routes' gate and the order board's menu.
export async function getAvailableMenu(db: DbClient, eventId: number): Promise<MenuItemDto[]> {
  const source = await eventMenuSource(db, eventId);
  return source ? availableItems(source.mode, source.catalog, source.chosen) : [];
}

// „Menu wydarzenia” in the panel: the mode and every catalog item with whether the event offers it.
export async function getEventMenu(db: DbClient, restaurantId: number, eventId: number): Promise<EventMenuDto | null> {
  const { data: event, error } = await db
    .from("event")
    .select("menu_mode")
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("odczytać menu wydarzenia", error.message);
  }
  if (!event) {
    return null;
  }
  const mode = isEventMenuMode(event.menu_mode) ? event.menu_mode : "off";
  const [catalog, chosen] = await Promise.all([catalogItems(db, restaurantId), chosenItems(db, eventId)]);
  const available = new Set(availableItems(mode, catalog, chosen).map((item) => item.id));
  return {
    eventId,
    mode,
    items: catalog.map((item) => ({ ...item, available: available.has(item.id) })),
  };
}

export type SetEventMenuResult = { status: "updated" } | { status: "not-found" };

// One transaction (set_event_menu): the mode and, for reduced, exactly these items of the event's restaurant; an
// item of another restaurant, an unknown one or an unknown event (templates included) → not-found, nothing changed.
export async function setEventMenu(
  db: DbClient,
  eventId: number,
  mode: EventMenuMode,
  itemIds: readonly number[],
): Promise<SetEventMenuResult> {
  const { error } = await db.rpc("set_event_menu", { p_event_id: eventId, p_mode: mode, p_item_ids: [...itemIds] });
  if (error) {
    if (error.message.includes("ITEM_NOT_FOUND") || error.message.includes("EVENT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("zapisać menu wydarzenia", error.message);
  }
  return { status: "updated" };
}
