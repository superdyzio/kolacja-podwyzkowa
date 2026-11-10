import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access/resolve";
import {
  addRestaurantMember,
  createStaffAccount,
  findEventMembership,
  getSession,
  issueStaffToken,
  redeemStaffToken,
} from "@/lib/auth/service";
import { beginSupport, recordSupportAccess } from "@/lib/support/service";
import { createRestaurant } from "@/lib/event";
import { createRestaurantEvent, listRestaurantEvents } from "@/lib/events/service";
import type { DbClient } from "@/lib/supabase-client";
import {
  applyVenueTemplate,
  createEventFromTemplate,
  createVenueTemplate,
  deleteVenueTemplate,
  findTemplateRow,
  getVenueTemplate,
  listVenueTemplates,
  previewTemplateUpdate,
  renameVenueTemplate,
} from "@/lib/templates/service";
import { getVenue } from "@/lib/venue/service";
import { createTestEvent, hasLocalDb, localDb, readEventKeys, testTag, type TestEvent } from "./helpers";

// venue-templates (S-15): templates are event rows with is_template. Copies share no rows with their source, the update
// matches rooms and tables by name, and no key, list, counter or event guard ever sees a template. Cleanup: every
// event row of the test's restaurants first (templates included — event → restaurant does not cascade), then the
// restaurants, then the account.

const NOW = new Date("2026-11-10T12:00:00Z");

describe.skipIf(!hasLocalDb)("venue templates (integration)", () => {
  let db: DbClient;
  let event: TestEvent;
  let otherRestaurant: number;
  let accountId: number;
  let adminId: number | undefined;
  let templateId: number;
  const tag = testTag();
  const tableIds: Record<string, number> = {};
  const guestIds: Record<string, number> = {};

  async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await db
      .from(table as "venue_room")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as T;
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "szablony");
    otherRestaurant = (await createRestaurant(db, `Restauracja obca ${tag}`)).id;
    const account = await createStaffAccount(db, { email: `szablony-${tag}@test.stolik` });
    if (account.status !== "created") throw new Error(account.status);
    accountId = account.id;
    await addRestaurantMember(db, event.restaurantId, accountId, "owner");

    const plan = await db
      .from("venue_plan")
      .insert({ event_id: event.id, mime_type: "image/png", byte_size: 3, image_base64: "AAAA", chair_pitch: 0.05 });
    if (plan.error) throw new Error(plan.error.message);
    const hall = await insert<{ id: number }>("venue_room", {
      event_id: event.id,
      name: "Sala główna",
      outline_x: 0.1,
      outline_y: 0.1,
      outline_w: 0.5,
      outline_h: 0.5,
    });
    const garden = await insert<{ id: number }>("venue_room", { event_id: event.id, name: "Ogród" });
    for (const [name, room, seats, rotation] of [
      ["A", hall.id, 8, 30],
      ["B", hall.id, 6, 0],
      ["Altana", garden.id, 4, 0],
    ] as const) {
      const row = await insert<{ id: number }>("venue_table", {
        event_id: event.id,
        room_id: room,
        name,
        seat_count: seats,
        shape: "round",
        pos_x: 0.3,
        pos_y: 0.4,
        rotation,
      });
      tableIds[name] = row.id;
    }
    for (const [name, table, seat, pinned] of [
      ["Ania", "A", 1, false],
      ["Bartek", "A", 7, true],
      ["Celina", "B", 6, false],
      ["Darek", "Altana", 2, false],
    ] as const) {
      const guest = await insert<{ id: number }>("guest", { event_id: event.id, display_name: `${name} ${tag}` });
      guestIds[name] = guest.id;
      const seated = await db.from("seat_assignment").insert({
        event_id: event.id,
        guest_id: guest.id,
        table_id: tableIds[table],
        seat,
        is_pinned: pinned,
      });
      if (seated.error) throw new Error(seated.error.message);
    }
    await insert("order_item", {
      event_id: event.id,
      name: "Deska serów",
      quantity: 1,
      unit_price_grosze: 5000,
      table_id: tableIds.B,
    });
  });

  afterAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- unset when beforeAll failed early
    if (!event) return;
    await db.from("event").delete().in("restaurant_id", [event.restaurantId, otherRestaurant]);
    await db.from("restaurant").delete().in("id", [event.restaurantId, otherRestaurant]);
    await db
      .from("staff_account")
      .delete()
      .in("id", [accountId, adminId ?? accountId]);
  });

  it("copies an event's room into a new template that shares no rows with it", async () => {
    const created = await createVenueTemplate(db, event.restaurantId, `Szablon ${tag}`, event.id);
    if (created.status !== "created") throw new Error(created.status);
    templateId = created.template.id;
    expect(created.template).toEqual({
      id: templateId,
      name: `Szablon ${tag}`,
      roomCount: 2,
      tableCount: 3,
      seatCount: 18,
      hasPlan: true,
    });
    const source = await getVenue(db, event.id);
    const copy = await getVenue(db, templateId);
    expect(copy.chairPitch).toBe(0.05);
    expect(copy.plan?.byteSize).toBe(3);
    const strip = (venue: typeof source) => ({
      rooms: venue.rooms.map((room) => ({ name: room.name, outline: room.outline })),
      tables: venue.tables.map(({ name, seatCount, shape, x, y, rotation }) => ({
        name,
        seatCount,
        shape,
        x,
        y,
        rotation,
      })),
    });
    expect(strip(copy)).toEqual(strip(source));
    // Rooms and tables have their own id sequences: compare each kind with its own.
    const roomIds = new Set(source.rooms.map((room) => room.id));
    const sourceTableIds = new Set(source.tables.map((table) => table.id));
    expect(copy.rooms.some((room) => roomIds.has(room.id))).toBe(false);
    expect(copy.tables.some((table) => sourceTableIds.has(table.id))).toBe(false);
    const guests = await db.from("guest").select("id", { count: "exact", head: true }).eq("event_id", templateId);
    const questions = await db.from("question").select("id", { count: "exact", head: true }).eq("event_id", templateId);
    expect(guests.count).toBe(0);
    expect(questions.count).toBe(0);
    expect(await listVenueTemplates(db, event.restaurantId)).toEqual([created.template]);
  });

  it("never shows a template as an event: lists, counters, keys and the event guard leave it out", async () => {
    const lists = await listRestaurantEvents(db, event.restaurantId, NOW);
    const listed = [...lists.upcoming, ...lists.past, ...lists.archived].map((row) => row.id);
    expect(listed).toEqual([event.id]);
    const { data, error } = await db.rpc("platform_restaurant_list");
    if (error) throw new Error(error.message);
    expect(data.find((row) => row.id === event.restaurantId)?.event_count).toBe(1);

    const keys = await readEventKeys(db, templateId);
    expect(await resolveAccess(db, "organizer", keys.organizerKey)).toBeNull();
    expect(await resolveAccess(db, "tv", keys.tvKey)).toBeNull();
    expect(await resolveAccess(db, "restaurant", keys.restaurantKey)).toBeNull();
    expect(await findEventMembership(db, accountId, templateId)).toBeNull();
    expect((await findEventMembership(db, accountId, event.id))?.event.id).toBe(event.id);

    // A template never gets the guests' switch (DB check).
    const switched = await db.from("event").update({ guest_access_enabled: true }).eq("id", templateId);
    expect(switched.error?.message).toContain("event_template_no_guest_access");

    // The template guard's first step opens templates only.
    expect(await findTemplateRow(db, event.id)).toBeNull();
    expect(await findTemplateRow(db, templateId)).toMatchObject({ id: templateId, restaurantId: event.restaurantId });
  });

  it("the admin's support path never opens a template as an event (and writes no log row for it)", async () => {
    const created = await createStaffAccount(db, { email: `szablony-admin-${tag}@test.stolik`, isPlatformAdmin: true });
    if (created.status !== "created") throw new Error(created.status);
    adminId = created.id;
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") throw new Error("link");
    const password = "haslo-szablonow-123";
    const redeemed = await redeemStaffToken(db, link.token, { password, repeat: password });
    if (redeemed.status !== "ok") throw new Error(redeemed.status);
    const session = await getSession(db, redeemed.session.token);
    if (!session) throw new Error("session");
    expect((await beginSupport(db, session, event.restaurantId, "Sprawdzenie szablonów")).status).toBe("entered");
    const request = { method: "GET", path: "/api/panel/events/x" };
    expect(await recordSupportAccess(db, session.sessionId, { eventId: templateId }, request)).toBeNull();
    expect((await recordSupportAccess(db, session.sessionId, { eventId: event.id }, request))?.event?.id).toBe(
      event.id,
    );
    const rows = await db.from("support_log").select("kind, event_id").eq("restaurant_id", event.restaurantId);
    expect(rows.data?.filter((row) => row.kind === "access").map((row) => row.event_id)).toEqual([event.id]);
  });

  it("previews and applies „Zaktualizuj z szablonu”: matched tables keep their rows, others lose their seats", async () => {
    const template = await getVenue(db, templateId);
    const byName = (name: string) => template.tables.find((table) => table.name === name)?.id ?? 0;
    const garden = template.rooms.find((room) => room.name === "Ogród")?.id ?? 0;
    // In the template: the garden (with Altana) goes, A shrinks to 6, B is renamed in other case, a terrace with a new
    // table comes.
    await db.from("venue_room").delete().eq("id", garden);
    await db.from("venue_table").update({ seat_count: 6 }).eq("id", byName("A"));
    await db.from("venue_table").update({ name: "b" }).eq("id", byName("B"));
    const terrace = await insert<{ id: number }>("venue_room", { event_id: templateId, name: "Taras" });
    await insert("venue_table", {
      event_id: templateId,
      room_id: terrace.id,
      name: "Nowy",
      seat_count: 10,
      shape: "rectangular",
      pos_x: 0.8,
      pos_y: 0.8,
      rotation: 0,
    });

    const preview = await previewTemplateUpdate(db, event.restaurantId, event.id, templateId);
    expect(preview).toEqual({
      templateId,
      templateName: `Szablon ${tag}`,
      lost: [
        { guestName: `Bartek ${tag}`, table: "A", seat: 7 },
        { guestName: `Darek ${tag}`, table: "Altana", seat: 2 },
      ],
      tablesAdded: ["Nowy"],
      tablesRemoved: ["Altana"],
      tablesResized: ["A"],
      roomsAdded: ["Taras"],
      roomsRemoved: ["Ogród"],
      planChange: "replaced",
    });

    const applied = await applyVenueTemplate(db, event.restaurantId, event.id, templateId);
    expect(applied).toEqual({
      status: "applied",
      result: {
        seatsBefore: 4,
        seatsAfter: 2,
        roomsAdded: 1,
        roomsRemoved: 1,
        tablesAdded: 1,
        tablesRemoved: 1,
        tablesKept: 2,
      },
    });
    const seats = await db.from("seat_assignment").select("guest_id, table_id, seat").eq("event_id", event.id);
    if (seats.error) throw new Error(seats.error.message);
    // Exactly the guests the preview named lost their seats.
    expect(seats.data.map((row) => row.guest_id).sort()).toEqual([guestIds.Ania, guestIds.Celina].sort());
    expect(seats.data.find((row) => row.guest_id === guestIds.Celina)?.table_id).toBe(tableIds.B);
    const order = await db.from("order_item").select("table_id").eq("event_id", event.id).single();
    expect(order.data?.table_id).toBe(tableIds.B);
    const venue = await getVenue(db, event.id);
    expect(venue.rooms.map((room) => room.name).sort()).toEqual(["Sala główna", "Taras"]);
    expect(venue.tables.map((table) => [table.name, table.seatCount])).toEqual(
      expect.arrayContaining([
        ["A", 6],
        ["b", 6],
        ["Nowy", 10],
      ]),
    );
    expect(venue.tables).toHaveLength(3);
    // The template keeps its own rows.
    expect((await getVenue(db, templateId)).tables.some((table) => table.id === tableIds.B)).toBe(false);
  });

  it("creates an event from a template with a copy of its room and the starter questions", async () => {
    const created = await createEventFromTemplate(db, event.restaurantId, templateId, {
      name: `Z szablonu ${tag}`,
      date: "2026-12-12",
      expectedGuests: 40,
    });
    if (created.status !== "created") throw new Error(created.status);
    const copy = await getVenue(db, created.eventId);
    const template = await getVenue(db, templateId);
    expect(copy.tables.map((table) => table.name)).toEqual(template.tables.map((table) => table.name));
    expect(copy.tables.some((table) => template.tables.some((other) => other.id === table.id))).toBe(false);
    const questions = await db
      .from("question")
      .select("id", { count: "exact", head: true })
      .eq("event_id", created.eventId);
    expect(questions.count).toBeGreaterThan(0);
    const card = await createRestaurantEvent(
      db,
      event.restaurantId,
      { name: `Z szablonu przez panel ${tag}`, date: "2026-12-13", expectedGuests: null, templateId },
      NOW,
    );
    expect(card.status).toBe("created");
  });

  it("refuses other restaurants, swapped ids and deleted templates alike", async () => {
    expect(await createVenueTemplate(db, otherRestaurant, "Obcy", event.id)).toEqual({ status: "not-found" });
    expect(await createVenueTemplate(db, event.restaurantId, "Z szablonu jako źródło", templateId)).toMatchObject({
      status: "created",
    });
    expect(
      await createEventFromTemplate(db, otherRestaurant, templateId, {
        name: "x",
        date: "2026-12-12",
        expectedGuests: null,
      }),
    ).toEqual({ status: "not-found" });
    expect(
      await createEventFromTemplate(db, event.restaurantId, event.id, {
        name: "x",
        date: "2026-12-12",
        expectedGuests: null,
      }),
    ).toEqual({ status: "not-found" });
    expect(await getVenueTemplate(db, otherRestaurant, templateId)).toBeNull();
    expect(await getVenueTemplate(db, event.restaurantId, event.id)).toBeNull();
    expect(await applyVenueTemplate(db, otherRestaurant, event.id, templateId)).toEqual({ status: "not-found" });
    expect(await applyVenueTemplate(db, event.restaurantId, templateId, templateId)).toEqual({ status: "not-found" });
    expect(await previewTemplateUpdate(db, event.restaurantId, event.id, event.id)).toBeNull();
    expect(await renameVenueTemplate(db, otherRestaurant, templateId, "x")).toBe("not-found");
    expect(await renameVenueTemplate(db, event.restaurantId, event.id, "x")).toBe("not-found");
    expect(await renameVenueTemplate(db, event.restaurantId, templateId, `Nowa nazwa ${tag}`)).toBe("updated");
    expect(await deleteVenueTemplate(db, otherRestaurant, templateId)).toBe("not-found");
    expect(await deleteVenueTemplate(db, event.restaurantId, event.id)).toBe("not-found");
    expect(await deleteVenueTemplate(db, event.restaurantId, templateId)).toBe("deleted");
    expect(await findTemplateRow(db, templateId)).toBeNull();
    // The event updated from it keeps its own room.
    expect((await getVenue(db, event.id)).tables).toHaveLength(3);
  });
});
