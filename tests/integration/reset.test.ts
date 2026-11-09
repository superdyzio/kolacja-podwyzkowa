import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveGuessByOrganizer, setCorrectAmount, setGuessIntakeOpen } from "@/lib/guesses";
import { setGuestAccess } from "@/lib/guest-links";
import { createGroup } from "@/lib/guests";
import { addQuestions, getQuestionList, starterQuestionRows } from "@/lib/questions";
import { getResetPreview, RESET_PARTS, resetEvent } from "@/lib/reset";
import { publishSeating, seatGuest, setPinned } from "@/lib/seating";
import type { DbClient } from "@/lib/supabase-client";
import { savePlanImage } from "@/lib/venue";
import type { ResetCountsDto, ResetPart } from "@/types";
import {
  createTestEvent,
  createTestSeating,
  hasLocalDb,
  localDb,
  localDbEnv,
  readEventKeys,
  readGuestKeys,
  releaseTestEvent,
  testTag,
  TINY_PNG,
  type TestEvent,
} from "./helpers";

// The organizer reset against the local DB, on the suite's own event (multi-tenant-events: a reset touches only its
// event; tests/integration/isolation.test.ts checks that another event keeps everything).
describe.skipIf(!hasLocalDb)("organizer reset", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  async function count(
    table: "guest" | "guest_group" | "question" | "seating_snapshot" | "drink_item",
  ): Promise<number> {
    const { count: rows, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id);
    if (error) {
      throw new Error(error.message);
    }
    return rows ?? 0;
  }

  async function counts(): Promise<ResetCountsDto> {
    const preview = await getResetPreview(db, event.id);
    if (!preview) {
      throw new Error("no event");
    }
    return preview.counts;
  }

  async function reset(parts: readonly ResetPart[]) {
    const outcome = await resetEvent(db, event.id, parts);
    if (outcome.status !== "reset") {
      throw new Error(`reset failed: ${outcome.status}`);
    }
    return outcome.result;
  }

  async function guestIds(): Promise<number[]> {
    const { data, error } = await db.from("guest").select("id").eq("event_id", event.id).order("id");
    if (error) {
      throw new Error(error.message);
    }
    return data.map((row) => row.id);
  }

  async function maxSnapshotId(): Promise<number> {
    const { data, error } = await db.from("seating_snapshot").select("id").order("id", { ascending: false }).limit(1);
    if (error) {
      throw new Error(error.message);
    }
    return data[0]?.id ?? 0;
  }

  // Something in every part: a plan, a room with two tables, six guests (a pair among them), three seated (one
  // pinned), one published snapshot, two guesses, a correct amount, intake closed, two AI attempts, guest access on
  // and one extra question.
  const SEEDED: ResetCountsDto = {
    guesses: 2,
    correctAmountSet: true,
    intakeOpen: false,
    aiAttempts: 2,
    aiUsed: 1,
    seats: 3,
    pinned: 1,
    snapshots: 1,
    guests: 6,
    groups: 1,
    plan: true,
    rooms: 1,
    tables: 2,
    // Two order lines and one drink (bill-drinks: the part counts and deletes both).
    orders: 3,
    questions: starterQuestionRows().length + 1,
    guestAccessEnabled: true,
  };

  async function seed(): Promise<void> {
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
      6,
    );
    const [a, b, c] = seating.guestIds;
    const [round] = seating.tableIds;
    expect((await createGroup(db, event.id, [a, b])).status).toBe("created");
    for (const [index, guestId] of [a, b, c].entries()) {
      expect((await seatGuest(db, event.id, guestId, round, index + 1)).status).toBe("seated");
    }
    expect((await setPinned(db, event.id, c, true)).status).toBe("updated");
    expect((await publishSeating(db, event.id)).status).toBe("published");
    expect((await saveGuessByOrganizer(db, event.id, a, 150_000)).status).toBe("saved");
    expect((await saveGuessByOrganizer(db, event.id, b, 99_900)).status).toBe("saved");
    await setCorrectAmount(db, event.id, 120_000);
    await setGuessIntakeOpen(db, event.id, false);
    const { error } = await db.from("ai_topic").insert([
      { event_id: event.id, requester: "guest", guest_id: a, category: "generyczne", status: "succeeded" },
      { event_id: event.id, requester: "organizer", category: "refleksyjne", status: "failed" },
    ]);
    if (error) {
      throw new Error(error.message);
    }
    await setGuestAccess(db, event.id, true);
    const [, rectangular] = seating.tableIds;
    const orders = await db.from("order_item").insert([
      { event_id: event.id, name: `Schabowy ${tag}`, quantity: 1, unit_price_grosze: 4_900, guest_id: a },
      { event_id: event.id, name: `Woda ${tag}`, quantity: 2, unit_price_grosze: 1_200, table_id: rectangular },
    ]);
    if (orders.error) {
      throw new Error(orders.error.message);
    }
    const drinks = await db
      .from("drink_item")
      .insert({ event_id: event.id, name: `Piwo ${tag}`, quantity: 6, unit_price_grosze: 1_400 });
    if (drinks.error) {
      throw new Error(drinks.error.message);
    }
    expect((await addQuestions(db, event.id, "generyczne", [`Czy reset ${tag} działa?`])).status).toBe("added");
    expect(await counts()).toEqual(SEEDED);
  }

  describe("always (read-only or refused)", () => {
    it("counts what a reset would remove", async () => {
      const preview = await getResetPreview(db, event.id);
      expect(preview?.starterQuestions).toBe(starterQuestionRows().length);
      expect(preview?.counts).toMatchObject({
        guests: await count("guest"),
        groups: await count("guest_group"),
        questions: await count("question"),
        snapshots: await count("seating_snapshot"),
      });
    });

    it("refuses an empty or unknown part list before touching anything", async () => {
      const before = await counts();
      for (const [parts, message] of [
        [[], "NO_PARTS"],
        [["nope"], "UNKNOWN_PART"],
        [["guesses", "nope"], "UNKNOWN_PART"],
      ] as const) {
        const { error } = await db.rpc("reset_event", {
          p_event_id: event.id,
          p_parts: [...parts],
          p_starter_questions: [],
        });
        expect(error?.message).toBe(message);
      }
      await expect(resetEvent(db, event.id, [])).rejects.toThrow(TypeError);
      expect(await counts()).toEqual(before);
    });

    it("gives browser roles neither function", async () => {
      for (const headers of [{}, { apikey: "anything" }] as Record<string, string>[]) {
        for (const [name, body] of [
          ["reset_counts", { p_event_id: event.id }],
          ["reset_event", { p_event_id: event.id, p_parts: ["guesses"], p_starter_questions: [] }],
        ] as const) {
          const call = await fetch(`${restUrl}/rpc/${name}`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          expect(call.ok).toBe(false);
        }
      }
    });
  });

  describe("destructive (the suite's own event)", () => {
    beforeEach(async () => {
      await reset(RESET_PARTS);
    });

    it("guesses + AI usage reset only those", async () => {
      await seed();
      const keys = await readGuestKeys(db, await guestIds());
      const result = await reset(["guesses", "aiUsage"]);
      expect(result.parts).toEqual(["guesses", "aiUsage"]);
      expect(result.before).toEqual(SEEDED);
      expect(result.summary).toHaveLength(2);
      expect(await counts()).toEqual({
        ...SEEDED,
        guesses: 0,
        correctAmountSet: false,
        intakeOpen: true,
        aiAttempts: 0,
        aiUsed: 0,
      });
      expect(await readGuestKeys(db, await guestIds())).toEqual(keys);
    });

    it("guests take guesses, AI usage and seating with them", async () => {
      await seed();
      const result = await reset(["guests"]);
      expect(result.parts).toEqual(["guesses", "aiUsage", "seating", "guests"]);
      expect(await counts()).toEqual({
        ...SEEDED,
        guesses: 0,
        correctAmountSet: false,
        intakeOpen: true,
        aiAttempts: 0,
        aiUsed: 0,
        seats: 0,
        pinned: 0,
        snapshots: 0,
        guests: 0,
        groups: 0,
      });
    });

    it("the venue takes the seating with it", async () => {
      await seed();
      const result = await reset(["venue"]);
      expect(result.parts).toEqual(["seating", "venue"]);
      expect(await counts()).toEqual({
        ...SEEDED,
        seats: 0,
        pinned: 0,
        snapshots: 0,
        plan: false,
        rooms: 0,
        tables: 0,
      });
    });

    it("orders: every order line and drink, nothing else; guests and tables leave their lines unassigned", async () => {
      await seed();
      await reset(["guests", "venue"]);
      const { data, error } = await db.from("order_item").select("guest_id, table_id").eq("event_id", event.id);
      expect(error).toBeNull();
      expect(data).toEqual([
        { guest_id: null, table_id: null },
        { guest_id: null, table_id: null },
      ]);
      const result = await reset(["orders"]);
      expect(result.parts).toEqual(["orders"]);
      expect(result.summary).toEqual(["Zamówienia i napoje: usunięto 3 pozycje zamówienia."]);
      expect((await counts()).orders).toBe(0);
      expect(await count("drink_item")).toBe(0);
    });

    it("guest links: a fresh key for every guest and guest access off", async () => {
      await seed();
      const ids = await guestIds();
      const before = await readGuestKeys(db, ids);
      const result = await reset(["guestLinks"]);
      expect(result.guestKeysReplaced).toBe(ids.length);
      const after = await readGuestKeys(db, ids);
      expect(new Set(after.values()).size).toBe(ids.length);
      for (const id of ids) {
        expect(after.get(id)).toMatch(/^[A-Za-z0-9_-]{24}$/);
        expect(after.get(id)).not.toBe(before.get(id));
      }
      expect(await counts()).toEqual({ ...SEEDED, guestAccessEnabled: false });
    });

    it("with guests chosen too, guest links only switch guest access off", async () => {
      await seed();
      const result = await reset(["guests", "guestLinks"]);
      expect(result.guestKeysReplaced).toBe(0);
      expect(result.summary.at(-1)).toBe("Linki gości: dostęp gości wyłączony.");
      expect((await counts()).guestAccessEnabled).toBe(false);
    });

    it("questions: exactly the starter base again", async () => {
      await seed();
      const result = await reset(["questions"]);
      expect(result.questionsAdded).toBe(starterQuestionRows().length);
      const list = await getQuestionList(db, event.id);
      expect(list.questions.map(({ category, text }) => ({ category, text }))).toEqual(starterQuestionRows());
      expect(list.starterMissing).toBe(0);
      expect(await counts()).toEqual({ ...SEEDED, questions: starterQuestionRows().length });
    });

    it("everything: an empty event with the starter questions, the same keys, and snapshot ids keep growing", async () => {
      await seed();
      const keys = await readEventKeys(db, event.id);
      const lastSnapshot = await maxSnapshotId();
      const result = await reset(RESET_PARTS);
      expect(result.parts).toEqual([...RESET_PARTS]);
      expect(result.before).toEqual(SEEDED);
      expect(result.summary).toHaveLength(RESET_PARTS.length);
      expect(await counts()).toEqual({
        guesses: 0,
        correctAmountSet: false,
        intakeOpen: true,
        aiAttempts: 0,
        aiUsed: 0,
        seats: 0,
        pinned: 0,
        snapshots: 0,
        guests: 0,
        groups: 0,
        plan: false,
        rooms: 0,
        tables: 0,
        orders: 0,
        questions: starterQuestionRows().length,
        guestAccessEnabled: false,
      });
      expect(await readEventKeys(db, event.id)).toEqual(keys);
      const published = await publishSeating(db, event.id);
      expect(published.snapshotId).toBeGreaterThan(lastSnapshot);
    });

    it("refuses the questions part without starter rows and changes nothing", async () => {
      await seed();
      const { error } = await db.rpc("reset_event", {
        p_event_id: event.id,
        p_parts: ["questions"],
        p_starter_questions: [],
      });
      expect(error?.message).toBe("NO_STARTER_QUESTIONS");
      expect(await counts()).toEqual(SEEDED);
    });
  });
});
