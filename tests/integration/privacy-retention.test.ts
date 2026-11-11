import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access";
import { addRestaurantMember, createStaffAccount, findEventMembership } from "@/lib/auth";
import { createEvent, createRestaurant } from "@/lib/event";
import { createGroup, getGuestList } from "@/lib/guests";
import {
  claimRetentionSweep,
  dateChangePurgesGuestData,
  enforceGuestRetention,
  getEventExport,
  getEventRetention,
  getRestaurantRetention,
  listExpiredGuestDataEvents,
  previewRetentionChange,
  purgeEventGuestData,
  purgeExpiredGuestData,
  runGuestRetentionJob,
  setRestaurantRetention,
} from "@/lib/privacy";
import { publishSeating, seatGuest } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import { createVenueTemplate } from "@/lib/templates";
import { createTestSeating, hasLocalDb, localDb, readEventKeys, testTag } from "./helpers";

// privacy-retention (S-26; FR-040, NFR-019): the purge of one event's guest data (what goes, what stays), who is
// eligible (the term in Warsaw days, templates never, other restaurants' terms), idempotence, the listing, the sweep's
// claim and the guards' hooks (resolveAccess, findEventMembership). Every restaurant, event and account is the test's
// own; a fixed clock decides every term (never a global sweep: the local DB may hold other data).

const NOW = new Date("2026-11-10T11:00:00Z"); // Warsaw: 2026-11-10 12:00
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

describe.skipIf(!hasLocalDb)("privacy retention (integration)", () => {
  let db: DbClient;
  const tag = testTag();
  const restaurantIds: number[] = [];
  const accountIds: number[] = [];

  async function restaurant(label: string, days?: number): Promise<number> {
    const created = await createRestaurant(db, `Retencja ${label} ${tag}`);
    restaurantIds.push(created.id);
    if (days !== undefined) {
      expect(await setRestaurantRetention(db, created.id, days)).toBe("updated");
    }
    return created.id;
  }

  async function event(restaurantId: number, label: string, date: string): Promise<number> {
    const result = await createEvent(db, { restaurantId, name: `Retencja ${label} ${tag}`, date });
    if (result.status !== "created") throw new Error(result.status);
    return result.event.id;
  }

  async function count(
    table:
      | "guest"
      | "guest_group"
      | "seating_snapshot"
      | "tv_spotlight"
      | "event_waiter"
      | "guess"
      | "guest_rsvp"
      | "seat_assignment"
      | "question"
      | "drink_item"
      | "venue_table"
      | "venue_room"
      | "order_item"
      | "order_piece"
      | "ai_topic",
    eventId: number,
  ): Promise<number> {
    const { count: n, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);
    if (error) throw new Error(error.message);
    return n ?? 0;
  }

  async function addGuest(eventId: number, name: string): Promise<{ id: number; key: string }> {
    const { data, error } = await db
      .from("guest")
      .insert({ event_id: eventId, display_name: `${name} ${tag}` })
      .select("id, access_key")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, key: data.access_key };
  }

  async function setGuestAccess(eventId: number, enabled: boolean): Promise<void> {
    const { error } = await db.from("event").update({ guest_access_enabled: enabled }).eq("id", eventId);
    if (error) throw new Error(error.message);
  }

  async function supportLogCount(): Promise<number> {
    const { count: n, error } = await db.from("support_log").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return n ?? 0;
  }

  beforeAll(() => {
    db = localDb();
  });

  afterAll(async () => {
    if (restaurantIds.length > 0) {
      // event → restaurant does not cascade: every event row (templates included) first.
      const events = await db.from("event").delete().in("restaurant_id", restaurantIds);
      if (events.error) throw new Error(events.error.message);
      const restaurants = await db.from("restaurant").delete().in("id", restaurantIds);
      if (restaurants.error) throw new Error(restaurants.error.message);
    }
    if (accountIds.length > 0) {
      const accounts = await db.from("staff_account").delete().in("id", accountIds);
      if (accounts.error) throw new Error(accounts.error.message);
    }
  });

  it("decides the term in Warsaw days at the database too", async () => {
    const expired = async (date: string, days: number, now: string) => {
      const { data, error } = await db.rpc("guest_data_expired", {
        p_event_date: date,
        p_retention_days: days,
        p_now: now,
      });
      if (error) throw new Error(error.message);
      return data;
    };
    expect(await expired("2026-11-08", 1, "2026-11-09T22:59:59Z")).toBe(false);
    expect(await expired("2026-11-08", 1, "2026-11-09T23:00:00Z")).toBe(true);
    expect(await expired("2026-07-10", 1, "2026-07-11T21:59:59Z")).toBe(false);
    expect(await expired("2026-07-10", 1, "2026-07-11T22:00:00Z")).toBe(true);
  });

  it("keeps the term per restaurant: default 30, 1–365, unknown restaurant", async () => {
    const id = await restaurant("termin");
    expect(await getRestaurantRetention(db, id)).toEqual({
      restaurantId: id,
      guestRetentionDays: 30,
      minDays: 1,
      maxDays: 365,
    });
    expect(await setRestaurantRetention(db, id, 7)).toBe("updated");
    expect((await getRestaurantRetention(db, id))?.guestRetentionDays).toBe(7);
    for (const bad of [0, 366]) {
      const { error } = await db.from("restaurant").update({ guest_retention_days: bad }).eq("id", id);
      expect(error?.message).toContain("restaurant_guest_retention_days");
    }
    expect(await setRestaurantRetention(db, 2_147_483_000, 30)).toBe("not-found");
    expect(await getRestaurantRetention(db, 2_147_483_000)).toBeNull();
  });

  it("purges only events past their term: never today, yesterday, the last day, a template", async () => {
    const r = await restaurant("macierz", 30);
    const today = await event(r, "dzis", "2026-11-10");
    const yesterday = await event(r, "wczoraj", "2026-11-09");
    const lastDay = await event(r, "ostatni-dzien", "2026-10-11"); // + 30 = 2026-11-10: still kept today
    const dayAfter = await event(r, "po-terminie", "2026-10-10"); // + 30 = 2026-11-09 < 2026-11-10
    const archived = await event(r, "archiwum", "2026-09-01");
    {
      const { error } = await db.from("event").update({ archived_at: "2026-09-02T10:00:00Z" }).eq("id", archived);
      if (error) throw new Error(error.message);
    }
    const template = await createVenueTemplate(db, r, `Szablon ${tag}`, null);
    if (template.status !== "created") throw new Error(template.status);
    {
      const { error } = await db.from("event").update({ event_date: "2025-01-01" }).eq("id", template.template.id);
      if (error) throw new Error(error.message);
    }
    const guests = new Map<number, number>();
    for (const id of [today, yesterday, lastDay, dayAfter, archived]) {
      guests.set(id, (await addGuest(id, `Gosc ${String(id)}`)).id);
    }

    const listed = await listExpiredGuestDataEvents(db, NOW, { restaurantId: r, limit: 100 });
    expect(listed).toEqual([archived, dayAfter]); // oldest first

    for (const id of [today, yesterday, lastDay]) {
      const result = await purgeEventGuestData(db, id, NOW);
      expect(result.status).toBe("kept");
      expect(await count("guest", id)).toBe(1);
    }
    expect((await purgeEventGuestData(db, template.template.id, NOW)).status).toBe("not-found");
    expect((await purgeEventGuestData(db, 2_147_483_000, NOW)).status).toBe("not-found");
    {
      const { data, error } = await db.from("event").select("guest_data_purged_at").eq("id", template.template.id);
      if (error) throw new Error(error.message);
      expect(data[0]?.guest_data_purged_at).toBeNull();
    }

    // The batch takes the listed ones only, one transaction each.
    const results = await purgeExpiredGuestData(db, NOW, { restaurantId: r, limit: 100 });
    expect(results.map((x) => [x.eventId, x.status, x.guests])).toEqual([
      [archived, "purged", 1],
      [dayAfter, "purged", 1],
    ]);
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: r, limit: 100 })).toEqual([]);
    expect(await count("guest", today)).toBe(1);
    expect(await count("guest", archived)).toBe(0);

    // The limit and the yesterday-before-noon edge (the floor window): never purged.
    expect(await listExpiredGuestDataEvents(db, new Date("2026-11-10T09:00:00Z"), { restaurantId: r })).toEqual([]);
    const later = await listExpiredGuestDataEvents(db, new Date("2026-11-11T23:30:00Z"), { restaurantId: r, limit: 1 });
    expect(later).toEqual([lastDay]);
  });

  it("follows each restaurant's own term", async () => {
    const short = await restaurant("krotki", 1);
    const long = await restaurant("dlugi", 365);
    const a = await event(short, "krotki", "2026-11-08");
    const b = await event(long, "dlugi", "2026-11-08");
    await addGuest(a, "Krotki");
    await addGuest(b, "Dlugi");
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: short })).toEqual([a]);
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: long })).toEqual([]);
    expect((await purgeEventGuestData(db, b, NOW)).status).toBe("kept");
    // Shortening the term makes it eligible at once.
    expect(await setRestaurantRetention(db, long, 1)).toBe("updated");
    expect((await purgeEventGuestData(db, b, NOW)).status).toBe("purged");
    // The other restaurant's event was not touched by that.
    expect(await count("guest", a)).toBe(1);
  });

  it("warns before a date change that would purge the guests' data at once, and only then (review-fixes)", async () => {
    const r = await restaurant("data", 7);
    const withGuests = await event(r, "z-goscmi", "2026-11-20");
    const empty = await event(r, "bez-gosci", "2026-11-20");
    await addGuest(withGuests, "Datowany");
    // Past the term (2026-11-02 + 7 = 2026-11-09 < 2026-11-10) with guest data → the warning, with the last day kept.
    expect(await dateChangePurgesGuestData(db, withGuests, "2026-11-02", NOW)).toEqual({
      deleteAfter: "2026-11-09",
      retentionDays: 7,
    });
    expect(await dateChangePurgesGuestData(db, withGuests, "2025-11-20", NOW)).toEqual({
      deleteAfter: "2025-11-27",
      retentionDays: 7,
    });
    // Inside the term (the last day is today), a later date, an event without guest data: no warning.
    expect(await dateChangePurgesGuestData(db, withGuests, "2026-11-03", NOW)).toBeNull();
    expect(await dateChangePurgesGuestData(db, withGuests, "2026-12-24", NOW)).toBeNull();
    expect(await dateChangePurgesGuestData(db, empty, "2025-11-20", NOW)).toBeNull();
    // The same date (an expired event is purged by its guard before the route runs) and an unknown id: no warning.
    const old = await event(r, "stare", "2025-01-01");
    await addGuest(old, "Stary");
    expect(await dateChangePurgesGuestData(db, old, "2025-01-01", NOW)).toBeNull();
    expect(await dateChangePurgesGuestData(db, 2_000_000_000, "2025-01-01", NOW)).toBeNull();
    // Nothing was purged by asking.
    expect(await count("guest", withGuests)).toBe(1);
  });

  it("previews what a shorter term would purge at once: only events with guest data the current term keeps (retention-preview)", async () => {
    const r = await restaurant("podglad", 30);
    const other = await restaurant("podglad-inny", 30);
    const recent = await event(r, "niedawne", "2026-11-03"); // + 7 = 2026-11-10: kept under 7 too
    const older = await event(r, "starsze", "2026-11-01"); // + 7 = 2026-11-08 < today; + 30 kept
    const oldest = await event(r, "najstarsze", "2026-10-20"); // + 7 past; + 30 = 2026-11-19 kept
    const empty = await event(r, "bez-gosci", "2026-10-25"); // past 7, but no guest data
    const pastTerm = await event(r, "po-terminie", "2026-09-01"); // already past 30: not the change's doing
    const foreign = await event(other, "obce", "2026-10-20"); // another restaurant
    const template = await createVenueTemplate(db, r, `Szablon podgladu ${tag}`, null);
    if (template.status !== "created") throw new Error(template.status);
    {
      const { error } = await db.from("event").update({ event_date: "2026-10-20" }).eq("id", template.template.id);
      if (error) throw new Error(error.message);
    }
    for (const id of [recent, older, oldest, pastTerm, foreign]) {
      await addGuest(id, `Podglad ${String(id)}`);
    }
    expect(empty).toBeGreaterThan(0);

    expect(await previewRetentionChange(db, r, 7, NOW)).toEqual({
      restaurantId: r,
      guestRetentionDays: 30,
      days: 7,
      events: 2,
      latestEventDate: "2026-11-01",
    });
    // The edges: + 21 = today keeps `oldest`, + 20 does not; a longer or the same term costs nothing.
    expect((await previewRetentionChange(db, r, 21, NOW))?.events).toBe(0);
    expect(await previewRetentionChange(db, r, 20, NOW)).toMatchObject({ events: 1, latestEventDate: "2026-10-20" });
    for (const days of [30, 60, 365]) {
      expect(await previewRetentionChange(db, r, days, NOW)).toEqual({
        restaurantId: r,
        guestRetentionDays: 30,
        days,
        events: 0,
        latestEventDate: null,
      });
    }
    expect((await previewRetentionChange(db, r, 1, NOW))?.events).toBe(3); // recent too (+ 1 < today)
    // Purged events have nothing left to lose; an unknown restaurant has no preview. Asking purged nothing.
    expect(await count("guest", older)).toBe(1);
    expect((await purgeEventGuestData(db, older, new Date("2026-12-31T12:00:00Z"))).status).toBe("purged");
    expect((await previewRetentionChange(db, r, 7, NOW))?.events).toBe(1);
    expect(await previewRetentionChange(db, 2_147_483_000, 7, NOW)).toBeNull();
    expect(await count("guest", oldest)).toBe(1);
    expect(await count("guest", pastTerm)).toBe(1);
  });

  it("runs the daily clean-up over every expired event in batches, counts only, then finds nothing (retention-schedule)", async () => {
    const r = await restaurant("codzienne", 7);
    const expired = [
      await event(r, "stare-1", "2026-10-01"),
      await event(r, "stare-2", "2026-10-02"),
      await event(r, "stare-3", "2026-11-02"), // + 7 = 2026-11-09 < today
    ];
    const kept = await event(r, "w-terminie", "2026-11-03"); // + 7 = today
    const template = await createVenueTemplate(db, r, `Szablon codzienny ${tag}`, null);
    if (template.status !== "created") throw new Error(template.status);
    {
      const { error } = await db.from("event").update({ event_date: "2025-01-01" }).eq("id", template.template.id);
      if (error) throw new Error(error.message);
    }
    for (const id of [...expired, kept]) {
      await addGuest(id, `Codzienny A ${String(id)}`);
      await addGuest(id, `Codzienny B ${String(id)}`);
    }
    // Batches of 2: three events in two batches, then an empty list.
    const run = await runGuestRetentionJob(db, NOW, { restaurantId: r, batch: 2 });
    expect(run).toEqual({
      events: 3,
      guests: 6,
      groups: 0,
      snapshots: 0,
      spotlight: 0,
      waiters: 0,
      notes: 0,
      skipped: 0,
      complete: true,
    });
    for (const id of expired) {
      expect(await count("guest", id)).toBe(0);
    }
    expect(await count("guest", kept)).toBe(2);
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: r })).toEqual([]);
    expect(await runGuestRetentionJob(db, NOW, { restaurantId: r })).toMatchObject({ events: 0, complete: true });
    // A spent budget purges nothing (the next run goes on).
    await addGuest(expired[0], "Codzienny pozniej");
    expect(await runGuestRetentionJob(db, NOW, { restaurantId: r, budgetMs: 0 })).toMatchObject({
      events: 0,
      complete: false,
    });
    expect(await count("guest", expired[0])).toBe(1);
    expect(await runGuestRetentionJob(db, NOW, { restaurantId: r })).toMatchObject({ events: 1, guests: 1 });
  });

  it("deletes every guest datum of the event and keeps the venue's records", async () => {
    const r = await restaurant("pelne", 30);
    const eventId = await event(r, "pelne", "2026-09-30");
    const seating = await createTestSeating(db, eventId, tag, [{ seatCount: 6, shape: "round" }], 4);
    const [g1, g2, g3] = seating.guestIds as [number, number, number, number];
    const tableId = seating.tableIds[0] ?? 0;
    await db
      .from("guest")
      .update({ diets: ["vegan"], diet_note: "bez cebuli" })
      .eq("id", g1)
      .throwOnError();
    expect((await createGroup(db, eventId, [g1, g2])).status).toBe("created");
    await db
      .from("guest_rsvp")
      .insert({ guest_id: g1, event_id: eventId, restaurant_id: r, menu_item_id: null, answered_by: "guest" })
      .throwOnError();
    await db.from("guess").insert({ guest_id: g1, event_id: eventId, amount_grosze: 150_000 }).throwOnError();
    for (const [index, guestId] of [g1, g2, g3].entries()) {
      expect((await seatGuest(db, eventId, guestId, tableId, index + 1)).status).toBe("seated");
    }
    expect((await publishSeating(db, eventId)).status).toBe("published");
    await db
      .from("tv_spotlight")
      .insert({ event_id: eventId, kind: "person", text: `G1 ${tag}` })
      .throwOnError();
    const { data: lines } = await db
      .from("order_item")
      .insert([
        { event_id: eventId, name: "Zupa", note: "bez soli", quantity: 2, unit_price_grosze: 1500, guest_id: g1 },
        { event_id: eventId, name: "Deska serów", quantity: 1, unit_price_grosze: 6000, table_id: tableId },
      ])
      .select("id, name")
      .throwOnError();
    const soup = lines.find((line) => line.name === "Zupa")?.id ?? 0;
    await db
      .from("order_piece")
      .insert({ order_item_id: soup, piece: 1, event_id: eventId, marked_by: "guest", guest_id: g1 })
      .throwOnError();
    await db
      .from("ai_topic")
      .insert({ event_id: eventId, requester: "guest", guest_id: g1, category: "generyczne", status: "succeeded" })
      .throwOnError();
    await db
      .from("event_waiter")
      .insert({
        event_id: eventId,
        restaurant_id: r,
        display_name: `Kelner ${tag}`,
        expires_at: "2026-10-01T10:00:00Z",
        link_hash: HEX_A,
        code_hash: HEX_B,
      })
      .throwOnError();
    await db
      .from("drink_item")
      .insert({ event_id: eventId, name: "Woda", quantity: 3, unit_price_grosze: 900 })
      .throwOnError();
    await setGuestAccess(eventId, true);

    const questionsBefore = await count("question", eventId);
    expect(questionsBefore).toBeGreaterThan(0);
    const keysBefore = await readEventKeys(db, eventId);
    const { data: snapshots } = await db.from("seating_snapshot").select("id").eq("event_id", eventId).throwOnError();
    const snapshotIds = snapshots.map((row) => row.id);
    expect(snapshotIds).toHaveLength(1);
    const logBefore = await supportLogCount();

    const result = await purgeEventGuestData(db, eventId, NOW);
    expect(result).toEqual({
      eventId,
      status: "purged",
      purgedAt: expect.any(String) as string,
      guests: 4,
      groups: 1,
      snapshots: 1,
      spotlight: 1,
      waiters: 1,
      notes: 1,
    });
    expect(Date.parse(result.purgedAt ?? "")).toBe(NOW.getTime());

    // Gone: guests and everything that hangs on them, groups, published names, the TV, the waiters, the notes.
    for (const table of [
      "guest",
      "guest_group",
      "seating_snapshot",
      "tv_spotlight",
      "event_waiter",
      "guess",
      "guest_rsvp",
      "seat_assignment",
    ] as const) {
      expect(await count(table, eventId), table).toBe(0);
    }
    {
      const { count: seats } = await db
        .from("seating_snapshot_seat")
        .select("snapshot_id", { count: "exact", head: true })
        .in("snapshot_id", snapshotIds)
        .throwOnError();
      expect(seats).toBe(0);
    }
    // Kept: the venue, the questions, the bill (without a person or a note), the pieces, AI counts, drinks, keys.
    expect(await count("venue_room", eventId)).toBe(1);
    expect(await count("venue_table", eventId)).toBe(1);
    expect(await count("question", eventId)).toBe(questionsBefore);
    expect(await count("drink_item", eventId)).toBe(1);
    const { data: kept } = await db
      .from("order_item")
      .select("name, note, quantity, unit_price_grosze, guest_id, table_id")
      .eq("event_id", eventId)
      .order("id")
      .throwOnError();
    expect(kept).toEqual([
      { name: "Zupa", note: null, quantity: 2, unit_price_grosze: 1500, guest_id: null, table_id: null },
      { name: "Deska serów", note: null, quantity: 1, unit_price_grosze: 6000, guest_id: null, table_id: tableId },
    ]);
    const { data: pieces } = await db
      .from("order_piece")
      .select("piece, marked_by, guest_id")
      .eq("event_id", eventId)
      .throwOnError();
    expect(pieces).toEqual([{ piece: 1, marked_by: "guest", guest_id: null }]);
    const { data: topics } = await db
      .from("ai_topic")
      .select("status, guest_id")
      .eq("event_id", eventId)
      .throwOnError();
    expect(topics).toEqual([{ status: "succeeded", guest_id: null }]);
    expect(await readEventKeys(db, eventId)).toEqual(keysBefore);
    const { data: row } = await db
      .from("event")
      .select("guest_access_enabled, guest_data_purged_at")
      .eq("id", eventId)
      .single()
      .throwOnError();
    expect(row.guest_access_enabled).toBe(false);
    expect(Date.parse(row.guest_data_purged_at ?? "")).toBe(NOW.getTime());
    expect(await supportLogCount()).toBe(logBefore);

    // Idempotent: nothing left → clean (no lock, same first date).
    const again = await purgeEventGuestData(db, eventId, new Date("2026-11-20T10:00:00Z"));
    expect(again.status).toBe("clean");
    expect(again.purgedAt).toBe(result.purgedAt);
    const retention = await getEventRetention(db, eventId);
    expect(retention).toEqual({
      eventDate: "2026-09-30",
      retentionDays: 30,
      deleteAfter: "2026-10-30",
      purgedAt: row.guest_data_purged_at,
    });

    // A guest added after the purge makes it eligible again; the first purge date stays.
    await addGuest(eventId, "Spozniony");
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: r })).toEqual([eventId]);
    const third = await purgeEventGuestData(db, eventId, new Date("2026-11-21T10:00:00Z"));
    expect([third.status, third.guests, third.purgedAt]).toEqual(["purged", 1, result.purgedAt]);
    expect(await listExpiredGuestDataEvents(db, NOW, { restaurantId: r })).toEqual([]);
  });

  it("purges before a link key serves anything: the guest's key opens nothing afterwards", async () => {
    const r = await restaurant("klucze", 30);
    const live = await event(r, "trwa", "2026-11-01");
    const old = await event(r, "minelo", "2026-09-01");
    const liveGuest = await addGuest(live, "Zywy");
    const oldGuest = await addGuest(old, "Dawny");
    await setGuestAccess(live, true);
    await setGuestAccess(old, true);

    const liveAccess = await resolveAccess(db, "guest", liveGuest.key, NOW);
    expect(liveAccess?.role).toBe("guest");
    expect(await count("guest", live)).toBe(1);

    expect(await resolveAccess(db, "guest", oldGuest.key, NOW)).toBeNull();
    expect(await count("guest", old)).toBe(0);

    // The client's, TV and tablet keys still open the event — with its guests gone.
    await addGuest(old, "Dopisany");
    const keys = await readEventKeys(db, old);
    const organizer = await resolveAccess(db, "organizer", keys.organizerKey, NOW);
    expect(organizer?.event.id).toBe(old);
    expect((await getGuestList(db, old)).guests).toEqual([]);
    expect((await resolveAccess(db, "tv", keys.tvKey, NOW))?.event.id).toBe(old);
    expect((await resolveAccess(db, "restaurant", keys.restaurantKey, NOW))?.event.id).toBe(old);

    // Inside the term the hook does not even call the database.
    expect(
      await enforceGuestRetention(db, { eventId: live, eventDate: "2026-11-01", retentionDays: 30 }, NOW),
    ).toBeNull();
  });

  it("purges before a panel guard opens the event, for members only", async () => {
    const r = await restaurant("panel", 30);
    const old = await event(r, "panel", "2026-09-01");
    await addGuest(old, "Panelowy");
    const created = await createStaffAccount(db, { email: `retencja-${tag}@test.stolik`, displayName: "Retencja" });
    if (created.status !== "created") throw new Error(created.status);
    accountIds.push(created.id);
    const outsider = await createStaffAccount(db, { email: `obcy-${tag}@test.stolik`, displayName: "Obcy" });
    if (outsider.status !== "created") throw new Error(outsider.status);
    accountIds.push(outsider.id);
    await addRestaurantMember(db, r, created.id, "manager");

    expect(await findEventMembership(db, outsider.id, old, NOW)).toBeNull();
    expect(await count("guest", old)).toBe(1); // an outsider's request never reaches the hook

    const membership = await findEventMembership(db, created.id, old, NOW);
    expect(membership?.event.id).toBe(old);
    expect(await count("guest", old)).toBe(0);
    const { data: account } = await db.from("staff_account").select("id").eq("id", created.id).throwOnError();
    expect(account).toHaveLength(1); // staff accounts are never touched
  });

  it("exports an event by names only — no ids, keys, tokens or hashes — and nothing of its guests once purged", async () => {
    const r = await restaurant("eksport", 30);
    const other = await restaurant("eksport-obcy", 30);
    const eventId = await event(r, "eksport", "2026-11-05");
    const seating = await createTestSeating(db, eventId, `${tag}e`, [{ seatCount: 4, shape: "rectangular" }], 3);
    const [g1, g2, g3] = seating.guestIds as [number, number, number];
    const tableId = seating.tableIds[0] ?? 0;
    await db
      .from("guest")
      .update({ diets: ["gluten-free"], diet_note: "bez cebuli" })
      .eq("id", g1)
      .throwOnError();
    await db.from("guest").update({ is_absent: true }).eq("id", g3).throwOnError();
    expect((await createGroup(db, eventId, [g1, g2])).status).toBe("created");
    await db.from("event").update({ rsvp_deadline: "2026-11-04T22:00:00Z" }).eq("id", eventId).throwOnError();
    await db
      .from("guest_rsvp")
      .insert({ guest_id: g1, event_id: eventId, restaurant_id: r, menu_item_id: null, answered_by: "guest" })
      .throwOnError();
    await db
      .from("guess")
      .insert({ guest_id: g2, event_id: eventId, amount_grosze: 123_456, predicted_place: 1 })
      .throwOnError();
    expect((await seatGuest(db, eventId, g1, tableId, 1)).status).toBe("seated");
    expect((await seatGuest(db, eventId, g2, tableId, 2)).status).toBe("seated");
    expect((await publishSeating(db, eventId)).status).toBe("published");
    await db
      .from("order_item")
      .insert([
        { event_id: eventId, name: "Rosół", note: "bez makaronu", quantity: 2, unit_price_grosze: 1800, guest_id: g1 },
        { event_id: eventId, name: "Deska", quantity: 1, unit_price_grosze: 5000, table_id: tableId },
      ])
      .throwOnError();
    await db
      .from("drink_item")
      .insert({ event_id: eventId, name: "Kompot", quantity: 2, unit_price_grosze: 1200 })
      .throwOnError();

    const data = await getEventExport(db, r, eventId, NOW);
    expect(data).not.toBeNull();
    if (!data) return;
    const [n1, n2, n3] = seating.guestNames as [string, string, string];
    expect(data.event).toEqual({
      name: `Retencja eksport ${tag}`,
      date: "2026-11-05",
      restaurant: `Retencja eksport ${tag}`,
      archived: false,
      guestData: { retentionDays: 30, deleteAfter: "2026-12-05", purgedAt: null },
    });
    const byName = new Map(data.guests.map((guest) => [guest.name, guest]));
    expect(byName.get(n1)).toMatchObject({
      absent: false,
      group: 1,
      diets: ["gluten-free"],
      dietNote: "bez cebuli",
      rsvp: { attending: true, byOrganizer: false },
      seat: { room: `Sala ${tag}e`, table: `T1 ${tag}e`, seat: 1 },
      guess: null,
    });
    expect(byName.get(n2)).toMatchObject({ group: 1, guess: { amountGrosze: 123_456, predictedPlace: 1 } });
    expect(byName.get(n3)).toMatchObject({ absent: true, group: null, seat: null, rsvp: { attending: false } });
    expect(data.groups).toEqual([[n1, n2].sort((a, b) => a.localeCompare(b, "pl"))]);
    expect(data.seating?.tables[0]?.seats).toEqual([
      { seat: 1, name: n1 },
      { seat: 2, name: n2 },
    ]);
    expect(data.orders.lines.map((line) => [line.name, line.totalGrosze, line.place])).toEqual([
      ["Rosół", 3600, { guest: n1 }],
      ["Deska", 5000, { table: `T1 ${tag}e` }],
    ]);
    expect([data.orders.dishesGrosze, data.orders.drinksGrosze, data.orders.billGrosze]).toEqual([8600, 2400, 11_000]);

    // No secret and no internal id anywhere in the file.
    const json = JSON.stringify(data);
    const keys = await readEventKeys(db, eventId);
    const guestKeys = await db.from("guest").select("access_key").eq("event_id", eventId).throwOnError();
    for (const secret of [
      keys.organizerKey,
      keys.tvKey,
      keys.restaurantKey,
      ...guestKeys.data.map((row) => row.access_key),
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toMatch(/"(id|\w+Id|\w*[Kk]ey|\w*[Tt]oken|\w*[Hh]ash|access_key)"\s*:/);

    // Another restaurant's id and a template open nothing.
    expect(await getEventExport(db, other, eventId, NOW)).toBeNull();
    const template = await createVenueTemplate(db, r, `Szablon eksport ${tag}`, null);
    if (template.status !== "created") throw new Error(template.status);
    expect(await getEventExport(db, r, template.template.id, NOW)).toBeNull();

    // After the purge: no guests, no published names, no notes; the bill stays.
    const later = new Date("2026-12-06T12:00:00Z");
    expect((await purgeEventGuestData(db, eventId, later)).status).toBe("purged");
    const purged = await getEventExport(db, r, eventId, later);
    expect(purged?.guests).toEqual([]);
    expect(purged?.groups).toEqual([]);
    expect(purged?.seating).toBeNull();
    expect(purged?.event.guestData.purgedAt).not.toBeNull();
    expect(purged?.orders.lines.map((line) => [line.note, line.place])).toEqual([
      [null, null],
      [null, { table: `T1 ${tag}e` }],
    ]);
    expect(purged?.orders.billGrosze).toBe(11_000);
  });

  it("lets one caller per interval claim the sweep", async () => {
    const { data: before } = await db.from("retention_sweep").select("last_run_at").eq("id", 1).single().throwOnError();
    try {
      await db.from("retention_sweep").update({ last_run_at: "2026-11-10T10:00:00Z" }).eq("id", 1).throwOnError();
      expect(await claimRetentionSweep(db, new Date("2026-11-10T10:05:00Z"), 600_000)).toBe(false);
      expect(await claimRetentionSweep(db, new Date("2026-11-10T10:10:00Z"), 600_000)).toBe(true);
      expect(await claimRetentionSweep(db, new Date("2026-11-10T10:10:00Z"), 600_000)).toBe(false);
      expect(await claimRetentionSweep(db, new Date("2026-11-10T10:19:59Z"), 600_000)).toBe(false);
      expect(await claimRetentionSweep(db, new Date("2026-11-10T10:20:00Z"), 600_000)).toBe(true);
    } finally {
      await db
        .from("retention_sweep")
        .update({ last_run_at: before.last_run_at ?? null })
        .eq("id", 1)
        .throwOnError();
    }
  });
});
