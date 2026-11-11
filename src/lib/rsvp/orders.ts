import { findMenuItem } from "@/lib/menu/rules";
import { newestPriceFor } from "@/lib/orders/prices";
import { compareDishNames, dishKey } from "@/lib/orders/rules";
import type { MenuCourse, RsvpGuestDto } from "@/types";

// „Przenieś wybory do zamówień” (the PR #4 review's RSVP extras), pure: which order lines the guests' RSVP choices
// become. Every guest who is coming and chose a dish gets ONE line { the dish, quantity 1, at that guest } — exactly
// what POST /api/o/<key>/orders would make of it: while the event's menu is active (≥ 1 available item) the dish must
// be on it (its spelling, course and catalog item), else free text (no course); the price is the venue's — the newest
// line of that name in the event, else the menu item's, else 0 (FR-027). A guest who already has a line of that dish
// — the same name in any letter case, or the same catalog item (a line keeps its spelling when the venue renames the
// item later; review2-fixes) — is skipped, so running it again adds nothing (idempotent). A dish no longer on the
// active menu blocks the whole move (`notOnMenu`, all or nothing): the client changes those guests' dish or the venue
// the menu.

export interface RsvpOrderLineSource {
  id: number;
  name: string;
  guestId: number | null;
  unitPriceGrosze: number;
  // The catalog item the line was made from (null = free text, or the item was deleted).
  menuItemId: number | null;
}

// A guest's row as the move reads it: the board's attendance and dish, plus the dish's catalog item (null = none).
export type RsvpOrderGuestSource = Pick<RsvpGuestDto, "id" | "attending" | "dish"> & { menuItemId?: number | null };

export interface RsvpOrderMenuItem {
  id: number;
  name: string;
  course: MenuCourse;
  priceGrosze: number;
}

export interface PlannedRsvpOrderLine {
  guestId: number;
  name: string;
  course: MenuCourse | null;
  menuItemId: number | null;
  unitPriceGrosze: number;
}

export interface RsvpOrdersPlan {
  // In the guests' order (Polish names), one per coming guest with a dish who has no line of it yet.
  lines: PlannedRsvpOrderLine[];
  // Coming guests with a dish who already have a line of that dish.
  skipped: number;
  // Chosen dishes the active menu does not offer (the menu's spelling is unknown: as answered), Polish order.
  notOnMenu: string[];
}

export function planRsvpOrders(
  guests: readonly RsvpOrderGuestSource[],
  lines: readonly RsvpOrderLineSource[],
  menu: readonly RsvpOrderMenuItem[],
): RsvpOrdersPlan {
  const have = new Set(
    lines.flatMap((line) => (line.guestId === null ? [] : [`${line.guestId}|${dishKey(line.name)}`])),
  );
  const haveItem = new Set(
    lines.flatMap((line) =>
      line.guestId === null || line.menuItemId === null ? [] : [`${line.guestId}#${String(line.menuItemId)}`],
    ),
  );
  const hasDish = (guest: RsvpOrderGuestSource, dish: string): boolean =>
    have.has(`${guest.id}|${dishKey(dish)}`) ||
    (guest.menuItemId !== undefined &&
      guest.menuItemId !== null &&
      haveItem.has(`${guest.id}#${String(guest.menuItemId)}`));
  const planned: PlannedRsvpOrderLine[] = [];
  const blocked = new Map<string, string>();
  let skipped = 0;
  for (const guest of guests) {
    if (guest.attending !== true || guest.dish === null || dishKey(guest.dish) === "") {
      continue;
    }
    if (hasDish(guest, guest.dish)) {
      skipped += 1;
      continue;
    }
    const item = findMenuItem(menu, guest.dish);
    if (menu.length > 0 && !item) {
      if (!blocked.has(dishKey(guest.dish))) {
        blocked.set(dishKey(guest.dish), guest.dish);
      }
      continue;
    }
    const name = item?.name ?? guest.dish;
    planned.push({
      guestId: guest.id,
      name,
      course: item?.course ?? null,
      menuItemId: item?.id ?? null,
      unitPriceGrosze: newestPriceFor(lines, name, null, item?.priceGrosze ?? 0),
    });
  }
  return { lines: planned, skipped, notOnMenu: [...blocked.values()].sort(compareDishNames) };
}
