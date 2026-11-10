import { getAvailableMenu } from "@/lib/menu/service";
import { MAX_ORDER_ITEMS } from "@/lib/orders/rules";
import type { DbClient } from "@/lib/supabase-client";
import type { RsvpOrdersSummaryDto } from "@/types";
import { planRsvpOrders, type RsvpOrdersPlan } from "./orders";
import { rsvpGuests } from "./rules";
import { readRsvpGuestSources } from "./service";

// „Przenieś wybory do zamówień” against the DB (the PR #4 review's RSVP extras): every read and write limited to
// `eventId` (NFR-012). The plan (orders.ts) follows POST /orders' rules — menu gate, the venue's price, course and
// catalog item; the write is ONE multi-row insert (one statement: all lines or none). Running it again adds nothing
// (guests who already have their dish are skipped). Supabase errors always throw; expected outcomes are status unions.

const FOREIGN_KEY_VIOLATION = "23503";

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

async function planFor(db: DbClient, eventId: number): Promise<{ plan: RsvpOrdersPlan; lineCount: number }> {
  const [sources, lines, menu] = await Promise.all([
    readRsvpGuestSources(db, eventId),
    db.from("order_item").select("id, name, guest_id, unit_price_grosze").eq("event_id", eventId).order("id"),
    getAvailableMenu(db, eventId),
  ]);
  if (lines.error) {
    fail("odczytać zamówienia", lines.error.message);
  }
  const plan = planRsvpOrders(
    rsvpGuests(sources),
    lines.data.map((row) => ({
      id: row.id,
      name: row.name,
      guestId: row.guest_id,
      unitPriceGrosze: row.unit_price_grosze,
    })),
    menu,
  );
  return { plan, lineCount: lines.data.length };
}

function summaryOf(plan: RsvpOrdersPlan): RsvpOrdersSummaryDto {
  return { added: plan.lines.length, skipped: plan.skipped, notOnMenu: plan.notOnMenu };
}

// What a move would do now (nothing is written).
export async function previewRsvpOrders(db: DbClient, eventId: number): Promise<RsvpOrdersSummaryDto> {
  return summaryOf((await planFor(db, eventId)).plan);
}

export type MoveRsvpOrdersResult =
  | { status: "moved"; summary: RsvpOrdersSummaryDto }
  | { status: "not-on-menu"; names: string[] }
  | { status: "too-many" }
  | { status: "place-gone" };

// The move: refused as a whole when a chosen dish is not on the active menu or the event would pass MAX_ORDER_ITEMS;
// a guest deleted meanwhile fails the composite foreign key → place-gone (nothing added).
export async function moveRsvpToOrders(db: DbClient, eventId: number): Promise<MoveRsvpOrdersResult> {
  const { plan, lineCount } = await planFor(db, eventId);
  if (plan.notOnMenu.length > 0) {
    return { status: "not-on-menu", names: plan.notOnMenu };
  }
  if (plan.lines.length === 0) {
    return { status: "moved", summary: summaryOf(plan) };
  }
  if (lineCount + plan.lines.length > MAX_ORDER_ITEMS) {
    return { status: "too-many" };
  }
  const { error } = await db.from("order_item").insert(
    plan.lines.map((line) => ({
      event_id: eventId,
      name: line.name,
      note: null,
      quantity: 1,
      unit_price_grosze: line.unitPriceGrosze,
      course: line.course,
      menu_item_id: line.menuItemId,
      guest_id: line.guestId,
      table_id: null,
    })),
  );
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return { status: "place-gone" };
    }
    fail("przenieść wyborów do zamówień", error.message);
  }
  return { status: "moved", summary: summaryOf(plan) };
}
