import { toTvSeating } from "@/lib/seating/published";
import type { OrderItemDto, RestaurantItemDto, RestaurantViewDto } from "@/types";
import { placeOrders, type PlacementSource } from "./placement";
import { prepList } from "./prep";

// The restaurant's view (restaurant-orders), pure: the prep list, the placement for serving and the published drawing
// — never prices, ids, keys or absences. The polling token is a fingerprint of everything else, so any change (a
// line, a tick, a publish, a new plan) is a new version and an unchanged poll answers 204.

export function toRestaurantItem(item: OrderItemDto): RestaurantItemDto {
  return { name: item.name, note: item.note, quantity: item.quantity, delivered: item.delivered };
}

// FNV-1a (32 bit) over the UTF-16 code units, 8 lowercase hex chars, plus the length: cheap and stable, not secret.
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}.${text.length.toString(36)}`;
}

export function toRestaurantView(
  items: readonly OrderItemDto[],
  source: PlacementSource,
  planVersion: number | null,
): RestaurantViewDto {
  let quantity = 0;
  let toServe = 0;
  for (const item of items) {
    quantity += item.quantity;
    if (!item.delivered) {
      toServe += item.quantity;
    }
  }
  const content: Omit<RestaurantViewDto, "version"> = {
    seating: toTvSeating(source.snapshot, planVersion),
    prep: prepList(items),
    placement: placeOrders(items, source, toRestaurantItem),
    totals: { quantity, toServe },
  };
  return { version: fingerprint(JSON.stringify(content)), ...content };
}
