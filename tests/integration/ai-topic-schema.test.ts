import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/db/database.types";
import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  createTestGuests,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;
const PLENTY = 1_000_000;

interface Reservation {
  id: number | null;
  error: string | null;
}

// The AI topic attempts (S-08) against the local DB: constraints, the atomic admission against the per-guest and
// per-evening limits (also under parallel calls), busy guests, stale attempts, the usage counts and nothing for
// browser roles. Only rows and guests this test created are touched; limits are passed relative to the event's
// current usage, so attempts that already exist never break a test.
describe.skipIf(!hasLocalDb)("AI topic schema", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const topicIds: number[] = [];
  const guestIds: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterEach(async () => {
    const ids = topicIds.splice(0);
    if (ids.length > 0) {
      const { error } = await db.from("ai_topic").delete().in("id", ids);
      if (error) {
        throw new Error(error.message);
      }
    }
    await deleteTestGuests(db, guestIds.splice(0));
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function guests(count: number): Promise<number[]> {
    const created = await createTestGuests(db, testTag(), count);
    guestIds.push(...created.ids);
    return created.ids;
  }

  async function usage(guestId: number | null = null) {
    const { data, error } = await db.rpc("ai_topic_usage", { p_event_id: EVENT_ID, p_guest_id: guestId });
    if (error) {
      throw new Error(error.message);
    }
    const row = data.at(0);
    if (!row) {
      throw new Error("ai_topic_usage returned no row");
    }
    return row;
  }

  async function reserve(
    guestId: number | null,
    limits: { guest?: number; event?: number } = {},
    eventId: number = EVENT_ID,
  ): Promise<Reservation> {
    const { data, error } = await db.rpc("reserve_ai_topic", {
      p_event_id: eventId,
      p_guest_id: guestId,
      p_category: "generyczne",
      p_guest_limit: limits.guest ?? 5,
      p_event_limit: limits.event ?? PLENTY,
    });
    if (error) {
      return { id: null, error: error.message };
    }
    topicIds.push(data);
    return { id: data, error: null };
  }

  async function finish(id: number | null, status: "succeeded" | "failed") {
    if (id === null) {
      throw new Error("no reservation to finish");
    }
    const { error } = await db.from("ai_topic").update({ status, finished_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      throw new Error(error.message);
    }
  }

  async function statusOf(id: number) {
    const { data, error } = await db.from("ai_topic").select("status").eq("id", id).single();
    if (error) {
      throw new Error(error.message);
    }
    return data.status;
  }

  async function insertStalePending(guestId: number): Promise<number> {
    const { data, error } = await db
      .from("ai_topic")
      .insert({
        requester: "guest",
        guest_id: guestId,
        category: "refleksyjne",
        created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    topicIds.push(data.id);
    return data.id;
  }

  it("keeps requester, category and status known and organizer rows without a guest", async () => {
    const [guest] = await guests(1);
    const invalid: Database["public"]["Tables"]["ai_topic"]["Insert"][] = [
      { requester: "organizer", category: "polityczne" },
      { requester: "organizer", category: "generyczne", status: "lost" },
      { requester: "tv", category: "generyczne" },
      { requester: "organizer", category: "generyczne", guest_id: guest },
    ];
    for (const row of invalid) {
      const { error } = await db.from("ai_topic").insert(row);
      expect(error?.code).toBe("23514");
    }
  });

  it("admits a guest up to the limit, and failed attempts do not count", async () => {
    const [guest = 0] = await guests(1);
    const first = await reserve(guest, { guest: 2 });
    expect(first.error).toBeNull();
    await finish(first.id, "succeeded");
    const second = await reserve(guest, { guest: 2 });
    expect(second.error).toBeNull();
    await finish(second.id, "succeeded");
    expect((await reserve(guest, { guest: 2 })).error).toBe("GUEST_LIMIT");

    await finish(second.id, "failed");
    const again = await reserve(guest, { guest: 2 });
    expect(again.error).toBeNull();
    expect(await usage(guest)).toMatchObject({ guest_used: 2, guest_busy: true });
  });

  it("refuses a second live attempt of the same guest until the first ends", async () => {
    const [guest = 0] = await guests(1);
    const first = await reserve(guest);
    expect(first.error).toBeNull();
    expect((await reserve(guest)).error).toBe("GUEST_BUSY");
    await finish(first.id, "failed");
    expect((await reserve(guest)).error).toBeNull();
  });

  it("expires stale pending attempts: they neither count nor block", async () => {
    const [guest = 0] = await guests(1);
    const stale = await insertStalePending(guest);
    expect(await usage(guest)).toMatchObject({ guest_used: 0, guest_busy: false });
    const fresh = await reserve(guest, { guest: 1 });
    expect(fresh.error).toBeNull();
    expect(await statusOf(stale)).toBe("failed");
  });

  it("stops everyone at the evening limit, the organizer included", async () => {
    const [guest = 0] = await guests(1);
    const { event_used } = await usage();
    expect((await reserve(null, { event: event_used + 1 })).error).toBeNull();
    expect((await reserve(null, { event: event_used + 1 })).error).toBe("EVENT_LIMIT");
    expect((await reserve(guest, { event: event_used + 1 })).error).toBe("EVENT_LIMIT");
  });

  it("gives the organizer no personal limit", async () => {
    for (let index = 0; index < 4; index++) {
      const attempt = await reserve(null, { guest: 1 });
      expect(attempt.error).toBeNull();
      await finish(attempt.id, "succeeded");
    }
  });

  it("refuses an unknown guest or event", async () => {
    expect((await reserve(UNKNOWN_ID)).error).toBe("GUEST_NOT_FOUND");
    expect((await reserve(null, {}, 99)).error).toBe("EVENT_NOT_FOUND");
  });

  it("admits exactly the limit under parallel calls", async () => {
    const { event_used } = await usage();
    const organizer = await Promise.all(Array.from({ length: 8 }, () => reserve(null, { event: event_used + 3 })));
    expect(organizer.filter((attempt) => attempt.id !== null)).toHaveLength(3);
    expect(organizer.filter((attempt) => attempt.error === "EVENT_LIMIT")).toHaveLength(5);
  });

  it("admits exactly the limit when different guests tap at once", async () => {
    const many = await guests(8);
    const { event_used } = await usage();
    const attempts = await Promise.all(many.map((guest) => reserve(guest, { event: event_used + 3 })));
    expect(attempts.filter((attempt) => attempt.id !== null)).toHaveLength(3);
    expect(attempts.filter((attempt) => attempt.error === "EVENT_LIMIT")).toHaveLength(5);
  });

  it("admits one attempt when one guest taps many times at once", async () => {
    const [guest = 0] = await guests(1);
    const attempts = await Promise.all(Array.from({ length: 8 }, () => reserve(guest)));
    expect(attempts.filter((attempt) => attempt.id !== null)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.error === "GUEST_BUSY")).toHaveLength(7);
  });

  it("counts live and failed attempts for the evening and the guest", async () => {
    const [guest = 0, other = 0] = await guests(2);
    const before = await usage(guest);
    const done = await reserve(guest);
    await finish(done.id, "succeeded");
    const failed = await reserve(other);
    await finish(failed.id, "failed");
    await insertStalePending(guest);
    await reserve(guest);
    expect(await usage(guest)).toEqual({
      event_used: before.event_used + 2,
      event_failed: before.event_failed + 2,
      guest_used: 2,
      guest_busy: true,
    });
    expect(await usage(null)).toMatchObject({ guest_used: 0, guest_busy: false });
  });

  it("gives browser roles no attempts and no functions", async () => {
    const attempt = await reserve(null);
    expect(attempt.error).toBeNull();
    const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];
    for (const headers of anonymousHeaders) {
      const rows = await fetch(`${restUrl}/ai_topic?select=*`, { headers });
      if (rows.ok) {
        expect(await rows.json()).toEqual([]);
      }
      const insert = await fetch(`${restUrl}/ai_topic`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ requester: "organizer", category: "generyczne" }),
      });
      expect(insert.ok).toBe(false);
      for (const [name, body] of [
        [
          "reserve_ai_topic",
          { p_event_id: EVENT_ID, p_guest_id: null, p_category: "generyczne", p_guest_limit: 5, p_event_limit: 300 },
        ],
        ["ai_topic_usage", { p_event_id: EVENT_ID }],
        ["ai_topic_tokens", { p_event_id: EVENT_ID }],
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
