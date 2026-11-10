import type { DbClient } from "@/lib/supabase-client";
import { base64ToBytes, bytesToBase64, isPlanImageType, sniffImageType } from "@/lib/venue/image";
import type { BrandingDto, LogoDto, PlanImageType, RestaurantBrandingDto } from "@/types";
import { brandTextColor, MAX_LOGO_BYTES, type LogoKind } from "./rules";

// The restaurant's and the client's brand (event-branding, S-18, FR-032). Every function takes the client and the
// event or restaurant id its guard opened (NFR-012) and filters every read and write by it: a key resolves to one
// event, an event to one restaurant, so no route can name another tenant's logo. Venue templates (is_template) have
// no brand. Logos live in their own singleton tables; only the image readers touch the base64 column.

const LOGO_METADATA_COLUMNS = "mime_type, byte_size, updated_at";

interface LogoMetadataRow {
  mime_type: string;
  byte_size: number;
  updated_at: string;
}

export interface LogoImage {
  mimeType: PlanImageType;
  bytes: Uint8Array<ArrayBuffer>;
}

export type SaveLogoResult = { status: "saved" } | { status: "too-large" } | { status: "unsupported-type" };

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function toLogoDto(row: LogoMetadataRow | null): LogoDto | null {
  if (!row || !isPlanImageType(row.mime_type)) {
    return null;
  }
  return { mimeType: row.mime_type, byteSize: row.byte_size, version: Date.parse(row.updated_at) };
}

function toImage(row: { mime_type: string; image_base64: string } | null): LogoImage | null {
  if (!row) {
    return null;
  }
  if (!isPlanImageType(row.mime_type)) {
    fail("odczytać logo", `nieznany typ obrazu ${row.mime_type}`);
  }
  return { mimeType: row.mime_type, bytes: base64ToBytes(row.image_base64) };
}

function textColorOf(color: string | null): "#000000" | "#ffffff" | null {
  return color ? brandTextColor(color) : null;
}

// The event's restaurant id (a template or an unknown event → null).
async function restaurantIdOfEvent(db: DbClient, eventId: number): Promise<number | null> {
  const { data, error } = await db
    .from("event")
    .select("restaurant_id")
    .eq("id", eventId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("odczytać wydarzenia", error.message);
  }
  return data?.restaurant_id ?? null;
}

// The brand every page of an event's links shows (guest, TV, tablet, client shell, cards). Metadata only.
export async function getEventBranding(db: DbClient, eventId: number): Promise<BrandingDto | null> {
  const { data: event, error } = await db
    .from("event")
    .select("brand_name, restaurant_id")
    .eq("id", eventId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail("odczytać marki wydarzenia", error.message);
  }
  if (!event) {
    return null;
  }
  const [restaurant, eventLogo, restaurantLogo] = await Promise.all([
    db.from("restaurant").select("name, brand_color").eq("id", event.restaurant_id).maybeSingle(),
    db.from("event_logo").select(LOGO_METADATA_COLUMNS).eq("event_id", eventId).maybeSingle(),
    db.from("restaurant_logo").select(LOGO_METADATA_COLUMNS).eq("restaurant_id", event.restaurant_id).maybeSingle(),
  ]);
  for (const result of [restaurant, eventLogo, restaurantLogo]) {
    if (result.error) {
      fail("odczytać marki wydarzenia", result.error.message);
    }
  }
  if (!restaurant.data) {
    return null;
  }
  return {
    restaurant: {
      name: restaurant.data.name,
      color: restaurant.data.brand_color,
      textColor: textColorOf(restaurant.data.brand_color),
      logo: toLogoDto(restaurantLogo.data),
    },
    client: { name: event.brand_name, logo: toLogoDto(eventLogo.data) },
  };
}

export async function setEventBrandName(db: DbClient, eventId: number, name: string | null): Promise<void> {
  const { error } = await db.from("event").update({ brand_name: name }).eq("id", eventId).eq("is_template", false);
  if (error) {
    fail("zapisać nazwy marki", error.message);
  }
}

function logoRow(
  bytes: Uint8Array,
):
  | { ok: true; row: { mime_type: string; byte_size: number; image_base64: string; updated_at: string } }
  | { ok: false; result: SaveLogoResult } {
  if (bytes.length > MAX_LOGO_BYTES) {
    return { ok: false, result: { status: "too-large" } };
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    return { ok: false, result: { status: "unsupported-type" } };
  }
  return {
    ok: true,
    row: {
      mime_type: mimeType,
      byte_size: bytes.length,
      image_base64: bytesToBase64(bytes),
      updated_at: new Date().toISOString(),
    },
  };
}

export async function saveEventLogo(db: DbClient, eventId: number, bytes: Uint8Array): Promise<SaveLogoResult> {
  const prepared = logoRow(bytes);
  if (!prepared.ok) {
    return prepared.result;
  }
  const { error } = await db
    .from("event_logo")
    .upsert({ event_id: eventId, ...prepared.row }, { onConflict: "event_id" });
  if (error) {
    fail("zapisać logo wydarzenia", error.message);
  }
  return { status: "saved" };
}

export async function deleteEventLogo(db: DbClient, eventId: number): Promise<void> {
  const { error } = await db.from("event_logo").delete().eq("event_id", eventId);
  if (error) {
    fail("usunąć logo wydarzenia", error.message);
  }
}

export async function getEventLogo(db: DbClient, eventId: number): Promise<LogoImage | null> {
  const { data, error } = await db
    .from("event_logo")
    .select("mime_type, image_base64")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    fail("odczytać logo wydarzenia", error.message);
  }
  return toImage(data);
}

export async function getRestaurantLogo(db: DbClient, restaurantId: number): Promise<LogoImage | null> {
  const { data, error } = await db
    .from("restaurant_logo")
    .select("mime_type, image_base64")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) {
    fail("odczytać logo lokalu", error.message);
  }
  return toImage(data);
}

// The logo an event's links show: its own (the client's) or its restaurant's — never any other.
export async function getLogoOfEvent(db: DbClient, eventId: number, kind: LogoKind): Promise<LogoImage | null> {
  if (kind === "event") {
    return getEventLogo(db, eventId);
  }
  const restaurantId = await restaurantIdOfEvent(db, eventId);
  return restaurantId === null ? null : getRestaurantLogo(db, restaurantId);
}

export async function getRestaurantBranding(db: DbClient, restaurantId: number): Promise<RestaurantBrandingDto | null> {
  const [restaurant, logo] = await Promise.all([
    db.from("restaurant").select("id, name, brand_color").eq("id", restaurantId).maybeSingle(),
    db.from("restaurant_logo").select(LOGO_METADATA_COLUMNS).eq("restaurant_id", restaurantId).maybeSingle(),
  ]);
  if (restaurant.error) {
    fail("odczytać marki lokalu", restaurant.error.message);
  }
  if (logo.error) {
    fail("odczytać marki lokalu", logo.error.message);
  }
  if (!restaurant.data) {
    return null;
  }
  return {
    restaurantId: restaurant.data.id,
    name: restaurant.data.name,
    color: restaurant.data.brand_color,
    textColor: textColorOf(restaurant.data.brand_color),
    logo: toLogoDto(logo.data),
  };
}

// Name and/or colour (already validated by the rules); undefined = unchanged.
export async function updateRestaurantBranding(
  db: DbClient,
  restaurantId: number,
  change: { name?: string; color?: string | null },
): Promise<void> {
  const update: { name?: string; brand_color?: string | null } = {};
  if (change.name !== undefined) {
    update.name = change.name;
  }
  if (change.color !== undefined) {
    update.brand_color = change.color;
  }
  const { error } = await db.from("restaurant").update(update).eq("id", restaurantId);
  if (error) {
    fail("zapisać marki lokalu", error.message);
  }
}

export async function saveRestaurantLogo(
  db: DbClient,
  restaurantId: number,
  bytes: Uint8Array,
): Promise<SaveLogoResult> {
  const prepared = logoRow(bytes);
  if (!prepared.ok) {
    return prepared.result;
  }
  const { error } = await db
    .from("restaurant_logo")
    .upsert({ restaurant_id: restaurantId, ...prepared.row }, { onConflict: "restaurant_id" });
  if (error) {
    fail("zapisać logo lokalu", error.message);
  }
  return { status: "saved" };
}

export async function deleteRestaurantLogo(db: DbClient, restaurantId: number): Promise<void> {
  const { error } = await db.from("restaurant_logo").delete().eq("restaurant_id", restaurantId);
  if (error) {
    fail("usunąć logo lokalu", error.message);
  }
}
