import { getGuessBoard } from "@/lib/guesses/service";
import { getGuestList } from "@/lib/guests/service";
import { getDrinkItems } from "@/lib/orders/drinks-service";
import { billTotalGrosze, drinkTotals } from "@/lib/orders/drinks";
import { orderTotals } from "@/lib/orders/rules";
import { getOrderItems } from "@/lib/orders/service";
import { getRsvpBoard } from "@/lib/rsvp/service";
import { toPublishedSeating } from "@/lib/seating/published";
import { getLatestSnapshot } from "@/lib/seating/service";
import type { DbClient } from "@/lib/supabase-client";
import { getVenue } from "@/lib/venue/service";
import type { EventExportDto, EventExportGuestDto, EventExportOrderLineDto } from "@/types";
import { guestDataDeleteAfter } from "./rules";

// The event export (privacy-retention, S-26; FR-040): everything an owner or a manager may want to keep before the
// guests' data is deleted, composed from the services the client's pages read. Reached only through the members-only
// guard (panelMemberEventApi), which applies the retention first — an expired event exports without guests. Never
// an id, a link key, a token or a hash: guests, tables and rooms by name.

function fail(message: string): never {
  throw new Error(`Nie udało się przygotować eksportu: ${message}`);
}

// null = no such event in this restaurant (or a venue template).
export async function getEventExport(
  db: DbClient,
  restaurantId: number,
  eventId: number,
  now: Date,
): Promise<EventExportDto | null> {
  const { data: event, error } = await db
    .from("event")
    .select("name, event_date, archived_at, guest_data_purged_at, restaurant(name, guest_retention_days)")
    .eq("id", eventId)
    .eq("restaurant_id", restaurantId)
    .eq("is_template", false)
    .maybeSingle();
  if (error) {
    fail(error.message);
  }
  if (!event) {
    return null;
  }
  const [guestList, rsvp, venue, snapshot, orderItems, drinks, guesses] = await Promise.all([
    getGuestList(db, eventId),
    getRsvpBoard(db, eventId, now),
    getVenue(db, eventId),
    getLatestSnapshot(db, eventId),
    getOrderItems(db, eventId),
    getDrinkItems(db, eventId),
    getGuessBoard(db, eventId),
  ]);

  const names = new Map(guestList.guests.map((guest) => [guest.id, guest.displayName]));
  const groupOf = new Map<number, number>();
  const groups = guestList.groups.map((group, index) => {
    for (const id of group.memberIds) {
      groupOf.set(id, index + 1);
    }
    return group.memberIds.map((id) => names.get(id) ?? "");
  });
  const rsvpOn = rsvp?.deadline != null;
  const rsvpOf = new Map((rsvp?.guests ?? []).map((row) => [row.id, row]));
  const guessOf = new Map(guesses.guests.map((row) => [row.id, row]));
  const snapshotTables = new Map((snapshot?.tables ?? []).map((table) => [table.snapshotTableId, table]));
  const seatOf = new Map<number, EventExportGuestDto["seat"]>();
  for (const seat of snapshot?.seats ?? []) {
    const table = snapshotTables.get(seat.snapshotTableId);
    if (seat.guestId !== null && table) {
      seatOf.set(seat.guestId, { room: table.roomName, table: table.name, seat: seat.seat });
    }
  }

  const guests = guestList.guests.map((guest): EventExportGuestDto => {
    const answer = rsvpOf.get(guest.id);
    const guess = guessOf.get(guest.id);
    return {
      name: guest.displayName,
      absent: guest.isAbsent,
      group: groupOf.get(guest.id) ?? null,
      diets: guest.diets,
      dietNote: guest.dietNote,
      rsvp:
        rsvpOn && answer
          ? {
              attending: answer.attending,
              dish: answer.dish,
              byOrganizer: answer.byOrganizer,
              answeredAt: answer.answeredAt,
            }
          : null,
      seat: seatOf.get(guest.id) ?? null,
      guess:
        guess?.amountGrosze != null ? { amountGrosze: guess.amountGrosze, predictedPlace: guess.predictedPlace } : null,
    };
  });

  const tableNames = new Map(venue.tables.map((table) => [table.id, table.name]));
  const lines = orderItems.map((item): EventExportOrderLineDto => {
    const guest = item.guestId !== null ? names.get(item.guestId) : undefined;
    const table = item.tableId !== null ? tableNames.get(item.tableId) : undefined;
    return {
      name: item.name,
      course: item.course,
      note: item.note,
      quantity: item.quantity,
      unitPriceGrosze: item.unitPriceGrosze,
      totalGrosze: item.quantity * item.unitPriceGrosze,
      deliveredPieces: item.deliveredPieces.length,
      place: guest !== undefined ? { guest } : table !== undefined ? { table } : null,
    };
  });
  const dishes = orderTotals(orderItems);
  const drinkSum = drinkTotals(drinks);
  const published = toPublishedSeating(snapshot);

  return {
    version: 1,
    exportedAt: now.toISOString(),
    event: {
      name: event.name,
      date: event.event_date,
      restaurant: event.restaurant.name,
      archived: event.archived_at !== null,
      guestData: {
        retentionDays: event.restaurant.guest_retention_days,
        deleteAfter: guestDataDeleteAfter(event.event_date, event.restaurant.guest_retention_days),
        purgedAt: event.guest_data_purged_at,
      },
    },
    guests,
    groups,
    rsvp:
      rsvp?.deadline != null
        ? {
            deadline: rsvp.deadline,
            open: rsvp.open,
            options: rsvp.options.map(({ name, course }) => ({ name, course })),
          }
        : null,
    venue: {
      rooms: venue.rooms.map((room) => ({
        name: room.name,
        tables: venue.tables
          .filter((table) => table.roomId === room.id)
          .map((table) => ({ name: table.name, shape: table.shape, seatCount: table.seatCount })),
      })),
    },
    seating: published ? { publishedAt: published.publishedAt, tables: published.tables } : null,
    orders: {
      lines,
      drinks: drinks.map((drink) => ({
        name: drink.name,
        quantity: drink.quantity,
        unitPriceGrosze: drink.unitPriceGrosze,
        totalGrosze: drink.quantity * drink.unitPriceGrosze,
      })),
      dishesGrosze: dishes.totalGrosze,
      drinksGrosze: drinkSum.totalGrosze,
      billGrosze: billTotalGrosze(dishes, drinkSum),
    },
    guesses: { intakeOpen: guesses.intakeOpen, correctAmountGrosze: guesses.correctAmountGrosze },
  };
}
