import { normalizeDisplayName } from "@/lib/guests/names";
import { getAvailableMenu } from "@/lib/menu/service";
import { findMenuItem, isMenuCourse } from "@/lib/menu/rules";
import type { DbClient } from "@/lib/supabase-client";
import type { GuestRsvpDto, MenuCourse, RsvpBoardDto, RsvpOptionDto } from "@/types";
import { rsvpBoard, toGuestRsvp, type KitchenRsvpRows, type RsvpGuestSource } from "./rules";

// The guests' RSVP of one event (guest-rsvp-menu, S-25; FR-039, US-07). Every function takes the client and the
// event id (NFR-012); a guest of another event is an unknown guest. Supabase errors always throw; expected outcomes
// come back as status unions. Answers are written only by the DB function save_guest_rsvp (attendance =
// guest.is_absent, written first; the dish among the options the event's menu offers; the deadline for guests).

function fail(action: string, message: string): never {
  throw new Error(`Nie udało się ${action}: ${message}`);
}

function dishOf(item: { name: string; course: string } | null): { name: string; course: MenuCourse } | null {
  return item && isMenuCourse(item.course) ? { name: item.name, course: item.course } : null;
}

// The guest's own RSVP for the phone (null while RSVP is off): one RPC, on both poll paths.
export async function getGuestRsvp(db: DbClient, eventId: number, guestId: number): Promise<GuestRsvpDto | null> {
  const { data, error } = await db.rpc("guest_rsvp_state", { p_event_id: eventId, p_guest_id: guestId });
  if (error) {
    fail("odczytać potwierdzenia", error.message);
  }
  return toGuestRsvp(data);
}

export type SaveRsvpResult =
  { status: "saved" } | { status: "closed" } | { status: "not-offered" } | { status: "not-found" };

async function saveRsvp(
  db: DbClient,
  eventId: number,
  guestId: number,
  attending: boolean | null,
  dish: string | null,
  by: "guest" | "organizer",
): Promise<SaveRsvpResult> {
  // A dish belongs to a „yes” only; a blank one is none.
  const name = attending === true && dish !== null ? normalizeDisplayName(dish) : "";
  const { error } = await db.rpc("save_guest_rsvp", {
    p_event_id: eventId,
    p_guest_id: guestId,
    p_attending: attending,
    p_dish: name === "" ? null : name,
    p_by: by,
  });
  if (error) {
    if (error.message.includes("RSVP_CLOSED")) {
      return { status: "closed" };
    }
    if (error.message.includes("DISH_NOT_OFFERED")) {
      return { status: "not-offered" };
    }
    if (error.message.includes("GUEST_NOT_FOUND") || error.message.includes("EVENT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("zapisać potwierdzenia", error.message);
  }
  return { status: "saved" };
}

// The guest's own answer on their link: only while RSVP is on and before the deadline (checked in the DB, atomically).
export function submitGuestRsvp(
  db: DbClient,
  eventId: number,
  guestId: number,
  attending: boolean,
  dish: string | null,
): Promise<SaveRsvpResult> {
  return saveRsvp(db, eventId, guestId, attending, dish, "guest");
}

// The client's (or the staff's) answer for a guest, at any time; null = „no answer” (the answer removed, present).
export async function saveRsvpByOrganizer(
  db: DbClient,
  eventId: number,
  guestId: number,
  attending: boolean | null,
  dish: string | null,
): Promise<Exclude<SaveRsvpResult, { status: "closed" }>> {
  const result = await saveRsvp(db, eventId, guestId, attending, dish, "organizer");
  return result.status === "closed" ? { status: "not-found" } : result;
}

// Every guest of the event with their answer (two reads): what the board, its counts and the move to the orders work on.
export async function readRsvpGuestSources(db: DbClient, eventId: number): Promise<RsvpGuestSource[]> {
  const [guests, answers] = await Promise.all([
    db.from("guest").select("id, display_name, is_absent").eq("event_id", eventId),
    db
      .from("guest_rsvp")
      .select("guest_id, answered_by, answered_at, menu_item_id, menu_item(name, course)")
      .eq("event_id", eventId),
  ]);
  if (guests.error) {
    fail("odczytać gości", guests.error.message);
  }
  if (answers.error) {
    fail("odczytać odpowiedzi gości", answers.error.message);
  }
  const answerOf = new Map(answers.data.map((row) => [row.guest_id, row]));
  return guests.data.map((guest) => {
    const row = answerOf.get(guest.id);
    return {
      id: guest.id,
      displayName: guest.display_name,
      absent: guest.is_absent,
      answer: row
        ? {
            answeredBy: row.answered_by,
            answeredAt: row.answered_at,
            dish: dishOf(row.menu_item),
            menuItemId: row.menu_item_id,
          }
        : null,
    };
  });
}

// The client's (and the staff's) whole view: the deadline, the options (and whether the menu still offers them), what
// may be chosen, the counts and every guest's answer. Null for an unknown event or a template.
export async function getRsvpBoard(db: DbClient, eventId: number, now: Date): Promise<RsvpBoardDto | null> {
  const [event, options, sources, available] = await Promise.all([
    db
      .from("event")
      .select("rsvp_deadline, event_date, guest_access_enabled")
      .eq("id", eventId)
      .eq("is_template", false)
      .maybeSingle(),
    db.from("event_rsvp_option").select("menu_item(name, course)").eq("event_id", eventId),
    readRsvpGuestSources(db, eventId),
    getAvailableMenu(db, eventId),
  ]);
  if (event.error) {
    fail("odczytać potwierdzeń", event.error.message);
  }
  if (options.error) {
    fail("odczytać dań do wyboru", options.error.message);
  }
  if (!event.data) {
    return null;
  }
  return rsvpBoard(
    {
      deadline: event.data.rsvp_deadline,
      eventDate: event.data.event_date,
      guestLinksOn: event.data.guest_access_enabled,
      options: options.data.flatMap((row) => {
        const dish = dishOf(row.menu_item);
        return dish ? [dish] : [];
      }),
      available: available.map((item): RsvpOptionDto => ({ name: item.name, course: item.course })),
      guests: sources,
    },
    now,
  );
}

// What the kitchen tablet's RSVP summary needs besides the guest list (RestaurantViewDto.rsvp): whether the event has
// dish options, and every answer with its dish — two reads, run alongside the tablet's other reads; kitchenRsvpOf
// (rules.ts) puts them together with the guests.
export async function readKitchenRsvp(db: DbClient, eventId: number): Promise<KitchenRsvpRows> {
  const [options, answers] = await Promise.all([
    db.from("event_rsvp_option").select("menu_item_id", { count: "exact", head: true }).eq("event_id", eventId),
    db.from("guest_rsvp").select("guest_id, answered_by, answered_at, menu_item(name, course)").eq("event_id", eventId),
  ]);
  if (options.error) {
    fail("odczytać dań do wyboru", options.error.message);
  }
  if (answers.error) {
    fail("odczytać odpowiedzi gości", answers.error.message);
  }
  return {
    hasOptions: (options.count ?? 0) > 0,
    answers: new Map(
      answers.data.map((row) => [
        row.guest_id,
        { answeredBy: row.answered_by, answeredAt: row.answered_at, dish: dishOf(row.menu_item) },
      ]),
    ),
  };
}

export interface RsvpSettings {
  // An ISO instant, or null = RSVP off; undefined = unchanged.
  deadline?: string | null;
  // Close the answers now (the earlier of `now` and the database's clock).
  close?: boolean;
  // Normalised dish names (parseOptionNames); undefined = unchanged, [] = none.
  options?: string[];
}

export type UpdateRsvpSettingsResult =
  { status: "updated" } | { status: "not-on-menu"; name: string } | { status: "not-found" };

// The client's settings: the options first (every name must be on the event's available menu, resolved to its item),
// then the deadline. Unknown events and templates → not-found.
export async function updateRsvpSettings(
  db: DbClient,
  eventId: number,
  settings: RsvpSettings,
  now: Date,
): Promise<UpdateRsvpSettingsResult> {
  if (settings.options !== undefined) {
    const available = await getAvailableMenu(db, eventId);
    const ids: number[] = [];
    for (const name of settings.options) {
      const item = findMenuItem(available, name);
      if (!item) {
        return { status: "not-on-menu", name };
      }
      ids.push(item.id);
    }
    const { error } = await db.rpc("set_event_rsvp_options", { p_event_id: eventId, p_item_ids: ids });
    if (error) {
      if (error.message.includes("EVENT_NOT_FOUND")) {
        return { status: "not-found" };
      }
      if (error.message.includes("ITEM_NOT_FOUND")) {
        // A catalog item deleted between the read and the write.
        return { status: "not-on-menu", name: settings.options[0] ?? "" };
      }
      fail("zapisać dań do wyboru", error.message);
    }
  }
  if (settings.close) {
    const { data, error } = await db.rpc("close_event_rsvp", { p_event_id: eventId, p_now: now.toISOString() });
    if (error) {
      fail("zamknąć potwierdzeń", error.message);
    }
    if (!data) {
      return { status: "not-found" };
    }
  } else if (settings.deadline !== undefined) {
    const { data, error } = await db
      .from("event")
      .update({ rsvp_deadline: settings.deadline })
      .eq("id", eventId)
      .eq("is_template", false)
      .select("id");
    if (error) {
      fail("zapisać terminu potwierdzeń", error.message);
    }
    if (data.length === 0) {
      return { status: "not-found" };
    }
  }
  return { status: "updated" };
}
