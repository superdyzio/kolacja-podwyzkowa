import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access/resolve";
import { createMockProvider, generateTopic, getAiTopicUsage } from "@/lib/ai-topics";
import { getGuestStateVersion, getGuestLinks, revokeGuestKey } from "@/lib/guest-links";
import { deleteGuess, getGuessBoard, getGuestGuess, saveGuessByOrganizer, submitGuestGuess } from "@/lib/guesses";
import { createGroup, deleteGuest, dissolveGroup, getGuestList, updateGuest } from "@/lib/guests";
import {
  addDrinkItem,
  addOrderItem,
  deleteDrinkItem,
  deleteOrderItem,
  getDrinkItems,
  getOrderItems,
  getRestaurantView,
  markGuestPiece,
  markOrderPieces,
  updateDrinkItem,
  updateOrderItem,
} from "@/lib/orders";
import { addQuestions, deleteQuestion, getQuestionList, updateQuestion } from "@/lib/questions";
import { getResetPreview, RESET_PARTS, resetEvent } from "@/lib/reset";
import {
  getAssignments,
  getLatestSnapshot,
  getNeighbourHistory,
  getSeatOccupancy,
  getSnapshot,
  publishSeating,
  restoreSnapshot,
  saveDraft,
  seatGuest,
  setPinned,
  unseatGuest,
} from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import { getTvScreenVersion, getTvSpotlight, hideTvSpotlight, showOnTv } from "@/lib/tv-spotlight";
import {
  addTable,
  applyVenueLayout,
  deleteRoom,
  deleteTable,
  getPlanImage,
  getVenue,
  renameRoom,
  savePlanImage,
  updateTable,
} from "@/lib/venue";
import {
  createTestEvent,
  createTestSeating,
  hasLocalDb,
  localDb,
  localDbEnv,
  readGuestKeys,
  releaseTestEvent,
  testTag,
  TINY_PNG,
  writeGuestAccessEnabled,
  type TestEvent,
  type TestSeating,
} from "./helpers";

// multi-tenant-events: two events of two restaurants, both filled with a bit of everything. Every operation called
// with A's event id and B's row ids answers like an unknown id and leaves B untouched; every read of A shows nothing
// of B; the DB functions and the composite foreign keys refuse the same mix at the database level; B's polling tokens
// never move because of A (and vice versa); a reset of A leaves B as it was.

interface Fixture {
  event: TestEvent;
  tag: string;
  seating: TestSeating;
  groupId: number;
  snapshotId: number;
  questionId: number;
  lineId: number;
  drinkId: number;
  spotlight: string;
}

const fast = createMockProvider({ delayMs: () => 0 });

describe.skipIf(!hasLocalDb)("isolation between events (multi-tenant-events)", () => {
  let db: DbClient;
  let a: Fixture;
  let b: Fixture;

  // Guests 0..2 seated at the round table (0 and 1 a group), guest 3 without a seat; a plan, a published snapshot,
  // a guess, a question, an order line with a delivered piece, a drink, an AI attempt and a TV spotlight.
  async function fill(label: string): Promise<Fixture> {
    const event = await createTestEvent(db, label);
    const tag = testTag();
    expect((await savePlanImage(db, event.id, TINY_PNG)).status).toBe("saved");
    const seating = await createTestSeating(
      db,
      event.id,
      tag,
      [
        { seatCount: 6, shape: "round" },
        { seatCount: 6, shape: "rectangular" },
      ],
      4,
    );
    const [g0, g1, g2] = seating.guestIds;
    const [round] = seating.tableIds;
    const group = await createGroup(db, event.id, [g0, g1]);
    if (group.status !== "created") {
      throw new Error(group.status);
    }
    for (const [index, guestId] of [g0, g1, g2].entries()) {
      expect((await seatGuest(db, event.id, guestId, round, index + 1)).status).toBe("seated");
    }
    const published = await publishSeating(db, event.id);
    expect((await saveGuessByOrganizer(db, event.id, g0, 150_000)).status).toBe("saved");
    const questions = await addQuestions(db, event.id, "generyczne", [`Pytanie ${tag} o izolację?`]);
    if (questions.status !== "added") {
      throw new Error(questions.status);
    }
    expect(
      await addOrderItem(db, event.id, {
        name: `Schabowy ${tag}`,
        note: null,
        quantity: 2,
        unitPriceGrosze: 4_900,
        assignment: { guestId: g0 },
      }),
    ).toEqual({ status: "added" });
    const [line] = await getOrderItems(db, event.id);
    const lineId = line.id;
    expect(await markOrderPieces(db, event.id, lineId, [1], true)).toEqual({ status: "marked" });
    expect(await addDrinkItem(db, event.id, { name: `Piwo ${tag}`, quantity: 4, unitPriceGrosze: 1_400 })).toEqual({
      status: "added",
    });
    const [drink] = await getDrinkItems(db, event.id);
    const drinkId = drink.id;
    expect((await generateTopic(db, event.id, fast, { guestId: null, category: null })).status).toBe("generated");
    const spotlight = `Na ekranie ${tag}?`;
    expect((await showOnTv(db, event.id, "question", spotlight)).status).toBe("shown");
    await writeGuestAccessEnabled(db, event.id, true);
    return {
      event,
      tag,
      seating,
      groupId: group.groupId,
      snapshotId: published.snapshotId,
      questionId: questions.added[0].id,
      lineId,
      drinkId,
      spotlight,
    };
  }

  // Everything an event's pages and APIs can show, in one value (compared before/after, searched for the other tag).
  async function everything(fixture: Fixture) {
    const id = fixture.event.id;
    const [guests, venue, assignments, occupancy, latest, history, guesses, questions, orders, drinks, ai, tv, reset] =
      await Promise.all([
        getGuestList(db, id),
        getVenue(db, id),
        getAssignments(db, id),
        getSeatOccupancy(db, id),
        getLatestSnapshot(db, id),
        getNeighbourHistory(db, id),
        getGuessBoard(db, id),
        getQuestionList(db, id),
        getOrderItems(db, id),
        getDrinkItems(db, id),
        getAiTopicUsage(db, id),
        getTvSpotlight(db, id),
        getResetPreview(db, id),
      ]);
    const links = await getGuestLinks(db, id);
    const restaurant = await getRestaurantView(db, id);
    return {
      guests,
      venue,
      assignments,
      occupancy,
      latest,
      history,
      guesses,
      questions,
      orders,
      drinks,
      ai,
      tv,
      reset,
      links,
      restaurant,
    };
  }

  beforeAll(async () => {
    db = localDb();
    a = await fill("A");
    b = await fill("B");
  });

  afterAll(async () => {
    await releaseTestEvent(db, a.event);
    await releaseTestEvent(db, b.event);
  });

  it("every read of A contains nothing of B, and the other way round", async () => {
    const [ofA, ofB] = await Promise.all([everything(a), everything(b)]);
    expect(JSON.stringify(ofA)).not.toContain(b.tag);
    expect(JSON.stringify(ofB)).not.toContain(a.tag);
    expect(JSON.stringify(ofA)).toContain(a.tag);
    expect(ofA.history.snapshotCount).toBe(1);
    expect(ofA.latest?.id).toBe(a.snapshotId);
    expect(ofA.ai.used).toBe(1);
    expect(ofA.tv?.text).toBe(a.spotlight);
    expect(ofA.reset?.counts).toEqual(ofB.reset?.counts);
    expect((await getPlanImage(db, a.event.id))?.bytes.byteLength).toBe(TINY_PNG.byteLength);
  });

  it("answers every service operation with A's event and B's ids like an unknown id, and B stays as it was", async () => {
    const before = await everything(b);
    const id = a.event.id;
    const [guestB, b1, b2, b3] = b.seating.guestIds;
    const [tableB] = b.seating.tableIds;
    const [a0, , , a3] = a.seating.guestIds;
    const [tableA] = a.seating.tableIds;

    // Guests and groups.
    expect(await updateGuest(db, id, guestB, { displayName: `Przejęty ${a.tag}` })).toEqual({ status: "not-found" });
    expect(await updateGuest(db, id, guestB, { isAbsent: true })).toEqual({ status: "not-found" });
    expect(await deleteGuest(db, id, guestB)).toEqual({ status: "not-found" });
    expect(await createGroup(db, id, [b2, b3])).toEqual({ status: "not-found" });
    expect(await createGroup(db, id, [a3, b3])).toEqual({ status: "not-found" });
    expect(await dissolveGroup(db, id, b.groupId)).toEqual({ status: "not-found" });
    expect(await revokeGuestKey(db, id, guestB)).toEqual({ status: "not-found" });

    // Venue.
    expect(await renameRoom(db, id, b.seating.roomId, `Sala ${a.tag} 2`)).toEqual({ status: "not-found" });
    expect(await deleteRoom(db, id, b.seating.roomId)).toEqual({ status: "not-found" });
    const table = { name: `Obcy ${a.tag}`, seatCount: 4, shape: "round" as const, x: 0.5, y: 0.5 };
    expect(await addTable(db, id, { ...table, roomId: b.seating.roomId })).toEqual({ status: "room-not-found" });
    expect(await updateTable(db, id, tableB, { name: `Obcy ${a.tag}` })).toEqual({ status: "not-found" });
    expect(await updateTable(db, id, tableA, { roomId: b.seating.roomId })).toEqual({ status: "room-not-found" });
    expect(await deleteTable(db, id, tableB)).toEqual({ status: "not-found" });
    expect(
      await applyVenueLayout(db, id, {
        tables: [{ id: tableB, x: 0.2, y: 0.2, rotation: 0 }],
        newTables: [],
        rooms: [],
        chairPitch: null,
      }),
    ).toEqual({ status: "table-not-found" });

    // Seating, snapshots and drafts.
    expect(await seatGuest(db, id, guestB, tableA, 5)).toEqual({ status: "guest-not-found" });
    expect(await seatGuest(db, id, a3, tableB, 5)).toEqual({ status: "table-not-found" });
    expect(await setPinned(db, id, guestB, true)).toEqual({ status: "guest-not-found" });
    expect(await unseatGuest(db, id, guestB)).toEqual({ status: "guest-not-found" });
    expect(await getSnapshot(db, id, b.snapshotId)).toBeNull();
    expect(await restoreSnapshot(db, id, b.snapshotId)).toEqual({ status: "not-found" });
    expect((await saveDraft(db, id, [{ guestId: guestB, tableId: tableB, seat: 1 }])).status).toBe("invalid");

    // Guesses.
    expect(await saveGuessByOrganizer(db, id, guestB, 1)).toEqual({ status: "not-found" });
    expect(await saveGuessByOrganizer(db, id, b1, 1, 1)).toEqual({ status: "not-found" });
    expect(await deleteGuess(db, id, guestB)).toEqual({ status: "not-found" });
    expect(await submitGuestGuess(db, id, guestB, 1)).toEqual({ status: "not-found" });
    expect(await submitGuestGuess(db, id, guestB, 1, 1)).toEqual({ status: "not-found" });
    expect(await getGuestGuess(db, id, guestB)).toMatchObject({
      intakeOpen: false,
      amountGrosze: null,
      predictedPlace: null,
    });

    // Questions.
    expect(await updateQuestion(db, id, b.questionId, { text: `Przejęte ${a.tag} pytanie?` })).toEqual({
      status: "not-found",
    });
    expect(await deleteQuestion(db, id, b.questionId)).toEqual({ status: "not-found" });

    // Orders and drinks.
    const line = { name: `Obce ${a.tag}`, note: null, quantity: 1, unitPriceGrosze: 100 };
    expect(await addOrderItem(db, id, { ...line, assignment: { guestId: guestB } })).toEqual({ status: "place-gone" });
    expect(await addOrderItem(db, id, { ...line, assignment: { tableId: tableB } })).toEqual({ status: "place-gone" });
    expect(await updateOrderItem(db, id, b.lineId, { quantity: 9 })).toEqual({ status: "not-found" });
    expect(await updateOrderItem(db, id, b.lineId, { delivered: false })).toEqual({ status: "not-found" });
    expect(await updateOrderItem(db, id, a.lineId, { assignment: { tableId: tableB } })).toEqual({
      status: "place-gone",
    });
    expect(await markOrderPieces(db, id, b.lineId, null, false)).toEqual({ status: "not-found" });
    expect(await markGuestPiece(db, id, a0, b.lineId, 2, true)).toEqual({ status: "not-found" });
    expect(await markGuestPiece(db, b.event.id, a0, b.lineId, 2, true)).toEqual({ status: "not-found" });
    expect(await deleteOrderItem(db, id, b.lineId)).toEqual({ status: "not-found" });
    expect(await updateDrinkItem(db, id, b.drinkId, { quantity: 99 })).toEqual({ status: "not-found" });
    expect(await deleteDrinkItem(db, id, b.drinkId)).toEqual({ status: "not-found" });

    // AI topics and the TV.
    expect(await generateTopic(db, id, fast, { guestId: guestB, category: null })).toEqual({ status: "not-found" });
    await hideTvSpotlight(db, id);
    expect(await getTvSpotlight(db, b.event.id)).toMatchObject({ text: b.spotlight });
    await showOnTv(db, id, "question", a.spotlight);

    expect(await everything(b)).toEqual(before);
  });

  it("refuses B's ids in the DB functions called for A, like unknown ids", async () => {
    const before = await everything(b);
    const id = a.event.id;
    const [guestB, , , b3] = b.seating.guestIds;
    const [tableB] = b.seating.tableIds;
    const [a0] = a.seating.guestIds;
    const [tableA] = a.seating.tableIds;
    const message = async (call: PromiseLike<{ error: { message: string } | null }>) => (await call).error?.message;

    expect(
      await message(db.rpc("seat_guest", { p_event_id: id, p_guest_id: guestB, p_table_id: tableA, p_seat: 5 })),
    ).toBe("GUEST_NOT_FOUND");
    expect(await message(db.rpc("seat_guest", { p_event_id: id, p_guest_id: a0, p_table_id: tableB, p_seat: 5 }))).toBe(
      "TABLE_NOT_FOUND",
    );
    expect(await message(db.rpc("create_guest_group", { p_event_id: id, p_guest_ids: [a0, b3] }))).toBe(
      "GUEST_NOT_FOUND",
    );
    expect(await message(db.rpc("save_guest_guess", { p_event_id: id, p_guest_id: guestB, p_amount_grosze: 1 }))).toBe(
      "GUEST_NOT_FOUND",
    );
    expect(
      await message(
        db.rpc("save_guest_guess_with_place", {
          p_event_id: id,
          p_guest_id: guestB,
          p_amount_grosze: 1,
          p_predicted_place: 1,
        }),
      ),
    ).toBe("GUEST_NOT_FOUND");
    for (const guestId of [null, a0]) {
      expect(
        await message(
          db.rpc("set_order_pieces", {
            p_event_id: id,
            p_item_id: b.lineId,
            p_pieces: null,
            p_delivered: false,
            p_guest_id: guestId,
          }),
        ),
      ).toBe("ITEM_NOT_FOUND");
    }
    expect(
      await message(
        db.rpc("reserve_ai_topic", {
          p_event_id: id,
          p_guest_id: guestB,
          p_category: "generyczne",
          p_guest_limit: 5,
          p_event_limit: 1000,
        }),
      ),
    ).toBe("GUEST_NOT_FOUND");
    const assignmentsOfA = await getAssignments(db, id);
    const replaced = await db.rpc("replace_seating", {
      p_event_id: id,
      // B's guest 3 has no seat (a seated one would hit the one-seat-per-guest key first).
      p_seats: [{ guest_id: b3, table_id: tableA, seat: 6 }],
    });
    expect(replaced.error?.code).toBe("23503");
    expect(await getAssignments(db, id)).toEqual(assignmentsOfA);

    expect(await everything(b)).toEqual(before);
  });

  it("refuses rows of A that point at rows of B (composite foreign keys)", async () => {
    const before = await everything(b);
    const id = a.event.id;
    const [guestB, b1, , b3] = b.seating.guestIds;
    const [tableB] = b.seating.tableIds;
    const [, , , a3] = a.seating.guestIds;
    const [tableA] = a.seating.tableIds;
    const codes = [
      // B's guest 3 has no seat (a seated one would hit the one-seat-per-guest key first).
      await db.from("seat_assignment").insert({ event_id: id, guest_id: b3, table_id: tableA, seat: 6 }),
      await db.from("seat_assignment").insert({ event_id: id, guest_id: a3, table_id: tableB, seat: 6 }),
      await db
        .from("order_item")
        .insert({ event_id: id, name: "x", quantity: 1, unit_price_grosze: 1, guest_id: guestB }),
      await db
        .from("order_item")
        .insert({ event_id: id, name: "x", quantity: 1, unit_price_grosze: 1, table_id: tableB }),
      await db.from("order_piece").insert({ event_id: id, order_item_id: b.lineId, piece: 2, marked_by: "organizer" }),
      await db
        .from("order_piece")
        .insert({ event_id: id, order_item_id: a.lineId, piece: 2, marked_by: "guest", guest_id: guestB }),
      await db.from("ai_topic").insert({ event_id: id, requester: "guest", guest_id: guestB, category: "generyczne" }),
      await db.from("venue_table").insert({
        event_id: id,
        room_id: b.seating.roomId,
        name: `Obcy ${a.tag}`,
        seat_count: 4,
        shape: "round",
        pos_x: 0.5,
        pos_y: 0.5,
      }),
      await db.from("guest").update({ group_id: b.groupId }).eq("id", a3),
    ].map((result) => result.error?.code);
    expect(codes).toEqual(Array.from({ length: codes.length }, () => "23503"));

    // The one accepted gap (plan-review F3): guess.guest_id keeps its single-column foreign key (PostgREST's guest →
    // guess one-to-one embed), so only the service and the DB functions guard it (see the test above).
    const stray = await db.from("guess").insert({ event_id: id, guest_id: b1, amount_grosze: 1 });
    expect(stray.error).toBeNull();
    await db.from("guess").delete().eq("guest_id", b1).eq("event_id", id);

    expect(await everything(b)).toEqual(before);
  });

  it("never moves A's polling tokens because of B", async () => {
    const [a0] = a.seating.guestIds;
    const [, , b2] = b.seating.guestIds;
    const [, bRectangular] = b.seating.tableIds;
    const guestA = { id: a0, displayName: a.seating.guestNames[0] };
    const read = () =>
      Promise.all([
        getTvScreenVersion(db, a.event.id),
        getGuestStateVersion(db, a.event.id, guestA),
        getRestaurantView(db, a.event.id).then((view) => view.version),
      ]);
    const before = await read();

    expect((await unseatGuest(db, b.event.id, b2)).status).toBe("unseated");
    expect((await publishSeating(db, b.event.id)).status).toBe("published");
    expect((await showOnTv(db, b.event.id, "question", `Nowe ${b.tag}?`)).status).toBe("shown");
    expect(
      await addOrderItem(db, b.event.id, {
        name: `Woda ${b.tag}`,
        note: null,
        quantity: 1,
        unitPriceGrosze: 900,
        assignment: { tableId: bRectangular },
      }),
    ).toEqual({ status: "added" });
    expect(await markOrderPieces(db, b.event.id, b.lineId, [2], true)).toEqual({ status: "marked" });

    expect(await read()).toEqual(before);
  });

  it("opens every key only on its own event", async () => {
    for (const fixture of [a, b]) {
      const { event } = fixture;
      const keys = await readGuestKeys(db, fixture.seating.guestIds);
      const guestKey = keys.get(fixture.seating.guestIds[0]) ?? "";
      for (const [role, key] of [
        ["organizer", event.organizerKey],
        ["tv", event.tvKey],
        ["restaurant", event.restaurantKey],
        ["guest", guestKey],
      ] as const) {
        expect((await resolveAccess(db, role, key))?.event.id).toBe(event.id);
      }
    }
  });

  it("does not serve restaurants to anonymous REST requests", async () => {
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    for (const headers of [{}, { apikey: "anything" }] as Record<string, string>[]) {
      const response = await fetch(`${env.url}/rest/v1/restaurant?select=*`, { headers });
      const body = await response.text();
      expect(body).not.toContain(`Restauracja A`);
      if (response.ok) {
        expect(JSON.parse(body)).toEqual([]);
      }
      const insert = await fetch(`${env.url}/rest/v1/restaurant`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Obca" }),
      });
      expect(insert.ok).toBe(false);
    }
  });

  it("a reset of A (every part) leaves B exactly as it was", async () => {
    const before = await everything(b);
    const outcome = await resetEvent(db, a.event.id, RESET_PARTS);
    expect(outcome.status).toBe("reset");
    const afterA = await getResetPreview(db, a.event.id);
    expect(afterA?.counts).toMatchObject({ guests: 0, orders: 0, snapshots: 0, aiAttempts: 0, plan: false });
    expect(await getTvSpotlight(db, a.event.id)).toBeNull();
    expect(await everything(b)).toEqual(before);
  });
});
