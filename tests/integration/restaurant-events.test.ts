import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access";
import { createRestaurant, type RestaurantDto } from "@/lib/event";
import {
  createRestaurantEvent,
  deleteEvent,
  getEventCard,
  listRestaurantEvents,
  platformToday,
  rotateEventKey,
  updateEvent,
} from "@/lib/events";
import { saveGuessByOrganizer } from "@/lib/guesses";
import { createGroup } from "@/lib/guests";
import { addDrinkItem, addOrderItem } from "@/lib/orders";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import type { EventCardDto } from "@/types";
import { createTestSeating, hasLocalDb, localDb, readEventKeys, testTag } from "./helpers";

// A restaurant's events (restaurant-events, S-11) against the local DB: create, list, card, edit, archive, rotate and
// delete, always scoped by the restaurant. The suite creates two restaurants of its own and deletes them with every
// event in them at the end; it never reads or touches other events.
const EVENT_TABLES = [
  "guest",
  "guest_group",
  "venue_room",
  "venue_table",
  "seat_assignment",
  "seating_snapshot",
  "guess",
  "question",
  "order_item",
  "drink_item",
] as const;

describe.skipIf(!hasLocalDb)("restaurant events", () => {
  let db: DbClient;
  let restaurant: RestaurantDto;
  let other: RestaurantDto;
  const tag = testTag();
  // 13:00 on 10 November 2026 in Warsaw.
  const now = new Date("2026-11-10T12:00:00Z");

  async function countRows(table: (typeof EVENT_TABLES)[number], eventId: number): Promise<number> {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("event_id", eventId);
    if (error) {
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  async function create(name: string, date: string, expectedGuests: number | null = null): Promise<EventCardDto> {
    const result = await createRestaurantEvent(
      db,
      restaurant.id,
      { name: `${name} ${tag}`, date, expectedGuests },
      now,
    );
    if (result.status !== "created") {
      throw new Error("Nie udało się utworzyć wydarzenia testowego.");
    }
    return result.event;
  }

  beforeAll(async () => {
    db = localDb();
    restaurant = await createRestaurant(db, `Restauracja wydarzeń ${tag}`);
    other = await createRestaurant(db, `Restauracja obca ${tag}`);
  });

  afterAll(async () => {
    const ids = [restaurant.id, other.id].filter((id) => typeof id === "number");
    await db.from("event").delete().in("restaurant_id", ids);
    await db.from("restaurant").delete().in("id", ids);
  });

  it("creates an event with its date and expected guests, the starter questions and three fresh links", async () => {
    const card = await create("Wigilia firmy", "2026-12-12", 80);
    expect(card).toMatchObject({
      name: `Wigilia firmy ${tag}`,
      date: "2026-12-12",
      expectedGuests: 80,
      archived: false,
      archivedAt: null,
      timing: "upcoming",
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      guestCount: 0,
    });
    const keys = await readEventKeys(db, card.id);
    expect(card.links).toEqual({
      organizer: `/o/${keys.organizerKey}`,
      tv: `/tv/${keys.tvKey}`,
      restaurant: `/r/${keys.restaurantKey}`,
    });
    expect(await countRows("question", card.id)).toBe(90);
  });

  it("refuses an unknown restaurant without creating anything", async () => {
    const result = await createRestaurantEvent(
      db,
      2_000_000_000,
      { name: `Nikt ${tag}`, date: "2026-12-12", expectedGuests: null },
      now,
    );
    expect(result).toEqual({ status: "restaurant-not-found" });
  });

  it("gives an event created without a date today's date in Warsaw (the column default)", async () => {
    const { data, error } = await db
      .from("event")
      .insert({ restaurant_id: restaurant.id, name: `Bez daty ${tag}` })
      .select("id, event_date, expected_guests, archived_at")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    expect(data.event_date).toBe(platformToday(new Date()));
    expect(data.expected_guests).toBeNull();
    expect(data.archived_at).toBeNull();
    await db.from("event").delete().eq("id", data.id);
  });

  it("lists upcoming (today first), past and archived events of the restaurant only", async () => {
    const today = await create("Dziś", "2026-11-10");
    const past = await create("Urodziny", "2026-10-01", 30);
    const archived = await create("Komunia", "2027-05-01");
    expect(await updateEvent(db, restaurant.id, archived.id, { archived: true })).toBe("updated");
    const foreign = await createRestaurantEvent(
      db,
      other.id,
      { name: `Obce ${tag}`, date: "2026-11-10", expectedGuests: null },
      now,
    );
    expect(foreign.status).toBe("created");

    const lists = await listRestaurantEvents(db, restaurant.id, now);
    expect(lists.today).toBe("2026-11-10");
    const upcomingIds = lists.upcoming.map((event) => event.id);
    expect(upcomingIds[0]).toBe(today.id);
    expect(lists.upcoming.find((event) => event.id === today.id)?.timing).toBe("today");
    expect(lists.past.map((event) => event.id)).toEqual([past.id]);
    expect(lists.archived.map((event) => event.id)).toEqual([archived.id]);
    expect(lists.archived[0]).toMatchObject({ archived: true, timing: "upcoming" });
    const all = [...lists.upcoming, ...lists.past, ...lists.archived];
    expect(all.some((event) => event.name.startsWith("Obce"))).toBe(false);
    expect(Object.keys(lists.upcoming[0] ?? {}).sort()).toEqual(
      ["archived", "date", "expectedGuests", "id", "name", "timing"].sort(),
    );
  });

  it("edits, archives and restores an event without touching its links", async () => {
    const card = await create("Do edycji", "2026-12-01", 50);
    expect(
      await updateEvent(db, restaurant.id, card.id, {
        name: `Po edycji ${tag}`,
        date: "2026-12-02",
        expectedGuests: null,
      }),
    ).toBe("updated");
    expect(await updateEvent(db, restaurant.id, card.id, { archived: true })).toBe("updated");
    const archived = await getEventCard(db, restaurant.id, card.id, now);
    expect(archived).toMatchObject({ name: `Po edycji ${tag}`, date: "2026-12-02", expectedGuests: null });
    expect(archived?.archived).toBe(true);
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.links).toEqual(card.links);
    expect(await updateEvent(db, restaurant.id, card.id, { archived: false })).toBe("updated");
    const restored = await getEventCard(db, restaurant.id, card.id, now);
    expect(restored?.archived).toBe(false);
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.links).toEqual(card.links);
  });

  it("replaces exactly one link per call: the old key opens nothing, the new one opens the event", async () => {
    const card = await create("Linki", "2026-12-03");
    const before = await readEventKeys(db, card.id);

    expect(await rotateEventKey(db, restaurant.id, card.id, "organizer")).toBe("rotated");
    const afterOrganizer = await readEventKeys(db, card.id);
    expect(afterOrganizer.organizerKey).not.toBe(before.organizerKey);
    expect(afterOrganizer.tvKey).toBe(before.tvKey);
    expect(afterOrganizer.restaurantKey).toBe(before.restaurantKey);
    expect(await resolveAccess(db, "organizer", before.organizerKey)).toBeNull();
    expect((await resolveAccess(db, "organizer", afterOrganizer.organizerKey))?.event.id).toBe(card.id);

    expect(await rotateEventKey(db, restaurant.id, card.id, "tv")).toBe("rotated");
    const afterTv = await readEventKeys(db, card.id);
    expect(afterTv.tvKey).not.toBe(before.tvKey);
    expect(afterTv.organizerKey).toBe(afterOrganizer.organizerKey);
    expect(await resolveAccess(db, "tv", before.tvKey)).toBeNull();
    expect((await resolveAccess(db, "tv", afterTv.tvKey))?.event.id).toBe(card.id);

    expect(await rotateEventKey(db, restaurant.id, card.id, "restaurant")).toBe("rotated");
    const afterRestaurant = await readEventKeys(db, card.id);
    expect(afterRestaurant.restaurantKey).not.toBe(before.restaurantKey);
    expect(afterRestaurant.tvKey).toBe(afterTv.tvKey);
    expect(await resolveAccess(db, "restaurant", before.restaurantKey)).toBeNull();
    expect((await resolveAccess(db, "restaurant", afterRestaurant.restaurantKey))?.event.id).toBe(card.id);
  });

  it("treats another restaurant's event like an unknown one and changes nothing", async () => {
    const card = await create("Cudze", "2026-12-04", 10);
    const keys = await readEventKeys(db, card.id);
    expect(await getEventCard(db, other.id, card.id, now)).toBeNull();
    expect(await getEventCard(db, restaurant.id, 2_000_000_000, now)).toBeNull();
    expect(await updateEvent(db, other.id, card.id, { name: "Przejęte", archived: true })).toBe("not-found");
    expect(await rotateEventKey(db, other.id, card.id, "organizer")).toBe("not-found");
    expect(await deleteEvent(db, other.id, card.id)).toBe("not-found");
    expect(await deleteEvent(db, restaurant.id, 2_000_000_000)).toBe("not-found");
    expect(await getEventCard(db, restaurant.id, card.id, now)).toEqual(card);
    expect(await readEventKeys(db, card.id)).toEqual(keys);
  });

  it("deletes a populated event with every row in it and leaves its neighbours untouched", async () => {
    const doomed = await create("Do usunięcia", "2026-12-05");
    const neighbour = await create("Sąsiad", "2026-12-05");
    const foreign = await createRestaurantEvent(
      db,
      other.id,
      { name: `Obce sąsiednie ${tag}`, date: "2026-12-05", expectedGuests: null },
      now,
    );
    if (foreign.status !== "created") {
      throw new Error("Nie udało się utworzyć obcego wydarzenia.");
    }

    // Fill the doomed event: room, tables, guests, a group, seats, a published snapshot, a guess, an order and a drink.
    const seating = await createTestSeating(db, doomed.id, tag, [{ seatCount: 4, shape: "round" }], 3);
    const [table] = seating.tableIds;
    const [first, second] = seating.guestIds;
    expect((await createGroup(db, doomed.id, [first, second])).status).toBe("created");
    expect((await seatGuest(db, doomed.id, first, table, 1)).status).toBe("seated");
    expect((await seatGuest(db, doomed.id, second, table, 2)).status).toBe("seated");
    const published = await publishSeating(db, doomed.id);
    expect(published.status).toBe("published");
    expect((await saveGuessByOrganizer(db, doomed.id, first, 150_000)).status).toBe("saved");
    expect(
      (
        await addOrderItem(db, doomed.id, {
          name: `Rosół ${tag}`,
          note: null,
          quantity: 2,
          unitPriceGrosze: 1800,
          assignment: { guestId: first },
        })
      ).status,
    ).toBe("added");
    expect((await addDrinkItem(db, doomed.id, { name: `Woda ${tag}`, quantity: 3, unitPriceGrosze: 900 })).status).toBe(
      "added",
    );
    // Also something in the neighbour, which must survive.
    await createTestSeating(db, neighbour.id, `${tag}n`, [{ seatCount: 2, shape: "round" }], 2);

    for (const table of EVENT_TABLES) {
      if (["guest", "venue_room", "venue_table", "seat_assignment", "question"].includes(table)) {
        expect(await countRows(table, doomed.id)).toBeGreaterThan(0);
      }
    }
    const neighbourBefore = await Promise.all(EVENT_TABLES.map((table) => countRows(table, neighbour.id)));
    const foreignBefore = await Promise.all(EVENT_TABLES.map((table) => countRows(table, foreign.event.id)));
    const neighbourCard = await getEventCard(db, restaurant.id, neighbour.id, now);
    const foreignCard = await getEventCard(db, other.id, foreign.event.id, now);
    const doomedKeys = await readEventKeys(db, doomed.id);

    expect(await deleteEvent(db, restaurant.id, doomed.id)).toBe("deleted");

    for (const table of EVENT_TABLES) {
      expect(await countRows(table, doomed.id)).toBe(0);
    }
    const snapshotSeats = await db
      .from("seating_snapshot_seat")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", published.status === "published" ? published.snapshotId : -1);
    expect(snapshotSeats.error).toBeNull();
    expect(snapshotSeats.count).toBe(0);
    expect(await getEventCard(db, restaurant.id, doomed.id, now)).toBeNull();
    expect(await resolveAccess(db, "organizer", doomedKeys.organizerKey)).toBeNull();
    expect(await resolveAccess(db, "tv", doomedKeys.tvKey)).toBeNull();
    expect(await resolveAccess(db, "restaurant", doomedKeys.restaurantKey)).toBeNull();
    expect(await deleteEvent(db, restaurant.id, doomed.id)).toBe("not-found");

    expect(await Promise.all(EVENT_TABLES.map((table) => countRows(table, neighbour.id)))).toEqual(neighbourBefore);
    expect(await Promise.all(EVENT_TABLES.map((table) => countRows(table, foreign.event.id)))).toEqual(foreignBefore);
    expect(await getEventCard(db, restaurant.id, neighbour.id, now)).toEqual(neighbourCard);
    expect(await getEventCard(db, other.id, foreign.event.id, now)).toEqual(foreignCard);
  });
});
