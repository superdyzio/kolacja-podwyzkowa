import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { updateGuest } from "@/lib/guests";
import type { DbClient } from "@/lib/supabase-client";
import {
  drawPersonOnTv,
  getTvScreen,
  getTvScreenVersion,
  getTvSpotlight,
  hideTvSpotlight,
  showOnTv,
} from "@/lib/tv-spotlight";
import {
  createTestEvent,
  createTestGuests,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseTestEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// The TV spotlight (tv-spotlight) against the local DB, on the suite's own event (multi-tenant-events: one spotlight
// per event); the guests a test creates are deleted again.
describe.skipIf(!hasLocalDb)("TV spotlight", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const guestIds: number[] = [];

  async function rowCount(): Promise<number> {
    const { count, error } = await db
      .from("tv_spotlight")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    if (error) {
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterEach(async () => {
    await deleteTestGuests(db, guestIds.splice(0));
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
  });

  it("shows a question, replaces it with a topic and hides it; every show is a new TV version", async () => {
    await hideTvSpotlight(db, event.id);
    const plan = await getTvScreen(db, event.id);
    expect(plan.spotlight).toBeNull();
    expect(plan.version.endsWith(".0")).toBe(true);
    expect(await getTvScreenVersion(db, event.id)).toBe(plan.version);

    const question = await showOnTv(db, event.id, "question", "  Co  było najlepsze w tym roku?  ");
    expect(question).toMatchObject({
      status: "shown",
      spotlight: { kind: "question", text: "Co było najlepsze w tym roku?" },
    });
    const withQuestion = await getTvScreen(db, event.id);
    expect(withQuestion.spotlight).toEqual(question.status === "shown" ? question.spotlight : null);
    expect(withQuestion.version).not.toBe(plan.version);
    expect(await getTvScreenVersion(db, event.id)).toBe(withQuestion.version);
    // The seating part of the token is untouched.
    expect(withQuestion.version.split(".").slice(0, 2)).toEqual(plan.version.split(".").slice(0, 2));

    await showOnTv(db, event.id, "topic", "Najdziwniejsze jedzenie z podróży");
    const withTopic = await getTvScreen(db, event.id);
    expect(withTopic.spotlight).toMatchObject({ kind: "topic", text: "Najdziwniejsze jedzenie z podróży" });
    expect(withTopic.version).not.toBe(withQuestion.version);
    expect(await rowCount()).toBe(1);

    // The same text again is still a new show.
    await showOnTv(db, event.id, "topic", "Najdziwniejsze jedzenie z podróży");
    expect(await getTvScreenVersion(db, event.id)).not.toBe(withTopic.version);

    await hideTvSpotlight(db, event.id);
    expect(await getTvSpotlight(db, event.id)).toBeNull();
    expect(await rowCount()).toBe(0);
    expect(await getTvScreenVersion(db, event.id)).toBe(plan.version);
  });

  it("refuses an empty or too long text and keeps what was shown", async () => {
    await showOnTv(db, event.id, "question", "Zostaje na ekranie?");
    expect(await showOnTv(db, event.id, "question", " \n ")).toEqual({ status: "invalid" });
    expect(await showOnTv(db, event.id, "topic", "a".repeat(301))).toEqual({ status: "invalid" });
    expect(await getTvSpotlight(db, event.id)).toMatchObject({ kind: "question", text: "Zostaje na ekranie?" });
  });

  it("draws only present guests and never the person on the TV right now", async () => {
    const { ids, names } = await createTestGuests(db, event.id, testTag(), 2);
    guestIds.push(...ids);
    const [, absentId] = ids;
    await updateGuest(db, event.id, absentId, { isAbsent: true });
    const { data: present, error } = await db
      .from("guest")
      .select("display_name")
      .eq("event_id", event.id)
      .eq("is_absent", false);
    if (error) {
      throw new Error(error.message);
    }
    const presentNames = new Set(present.map((guest) => guest.display_name));
    expect(presentNames.has(names[1] ?? "")).toBe(false);

    let previous: string | null = null;
    for (let draw = 0; draw < 15; draw++) {
      const result = await drawPersonOnTv(db, event.id);
      if (result.status !== "shown") {
        throw new Error("expected a drawn guest");
      }
      expect(result.spotlight.kind).toBe("person");
      expect(presentNames.has(result.spotlight.text)).toBe(true);
      if (presentNames.size > 1) {
        expect(result.spotlight.text).not.toBe(previous);
      }
      previous = result.spotlight.text;
    }
    expect(await rowCount()).toBe(1);
  });

  it("gives browser roles nothing", async () => {
    await showOnTv(db, event.id, "question", "Widać mnie bez klucza?");
    for (const headers of [{}, { apikey: "anything" }] as Record<string, string>[]) {
      const rows = await fetch(`${restUrl}/tv_spotlight?select=*`, { headers });
      if (rows.ok) {
        expect(await rows.json()).toEqual([]);
      }
      const insert = await fetch(`${restUrl}/tv_spotlight`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "question", text: "Wstrzyknięte" }),
      });
      expect(insert.ok).toBe(false);
    }
  });
});
