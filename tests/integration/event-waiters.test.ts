import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffAccount } from "@/lib/auth";
import { createEvent } from "@/lib/event";
import { addDays, eventTiming, platformToday } from "@/lib/events/dates";
import {
  addEventWaiter,
  deleteEventWaiter,
  findWaiterLink,
  getEventWaiters,
  getWaiterSession,
  logoutWaiter,
  MAX_EVENT_WAITERS,
  parseWaiterCode,
  redeemWaiterCode,
  redeemWaiterLink,
  waiterCodeKeyHash,
} from "@/lib/event-waiters";
import type { DbClient } from "@/lib/supabase-client";
import type { EventWaiterIssuedDto } from "@/types";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, testTag, type TestEvent } from "./helpers";

// event-waiter-access (S-21b): per-event waiters — the expiry instant, adding and its refusals, the one-time link and
// code (consumed together, only inside the floor window), the code throttle, the session, logout, revoke and the
// cascade. Every restaurant, event and account used here is the test's own and is deleted after.

function tokenOf(path: string): string {
  return path.replace("/kelner/", "");
}

describe.skipIf(!hasLocalDb)("per-event waiters (integration)", () => {
  let db: DbClient;
  let event: TestEvent | undefined;
  let other: TestEvent | undefined;
  let staffId = 0;
  const extraEvents: number[] = [];
  const tag = testTag();
  const now = new Date();
  const today = platformToday(now);

  async function eventOn(restaurantId: number, date: string, label: string): Promise<number> {
    const result = await createEvent(db, { restaurantId, name: `Kelnerzy ${label} ${tag}`, date });
    if (result.status !== "created") {
      throw new Error("Nie udało się utworzyć wydarzenia.");
    }
    extraEvents.push(result.event.id);
    return result.event.id;
  }

  async function add(eventId: number, name = "Kuba", restaurantId = event?.restaurantId ?? 0) {
    return addEventWaiter(db, { restaurantId, eventId, name, createdBy: staffId });
  }

  async function issued(eventId: number, name = "Kuba"): Promise<EventWaiterIssuedDto> {
    const result = await add(eventId, name);
    if (result.status !== "added") {
      throw new Error(`Nie dodano kelnera: ${result.status}`);
    }
    return result.issued;
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "kelnerzy");
    other = await createTestEvent(db, "kelnerzy-b");
    const account = await createStaffAccount(db, { email: `kelnerzy-${tag}@test.stolik` });
    if (account.status === "invalid-email") {
      throw new Error("Nie udało się założyć konta.");
    }
    staffId = account.id;
  });

  afterAll(async () => {
    if (extraEvents.length > 0) {
      await db.from("event").delete().in("id", extraEvents);
    }
    await releaseTestEvent(db, event);
    await releaseTestEvent(db, other);
    if (staffId) {
      await db.from("staff_account").delete().eq("id", staffId);
    }
  });

  it("expires at noon Europe/Warsaw of the day after the event (CET and CEST), the end of the floor window", async () => {
    for (const [date, expected] of [
      ["2026-12-15", "2026-12-16T11:00:00.000Z"],
      ["2027-07-15", "2027-07-16T10:00:00.000Z"],
    ] as const) {
      const eventId = await eventOn(event?.restaurantId ?? 0, date, date);
      const waiter = await issued(eventId);
      expect(waiter.expiresAt).toBe(expected);
      const end = new Date(expected);
      expect(eventTiming(date, new Date(end.getTime() - 1))).toBe("today");
      expect(eventTiming(date, end)).toBe("past");
    }
  });

  it("issues a link and a code once, lists the waiter without any secret and records who added it", async () => {
    const eventId = event?.id ?? 0;
    const waiter = await issued(eventId, "  Ola   Nowak ");
    expect(waiter.name).toBe("Ola Nowak");
    expect(waiter.path).toMatch(/^\/kelner\/[A-Za-z0-9_-]{43}$/);
    expect(waiter.code).toMatch(new RegExp(`^${String(waiter.id)}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$`));
    const list = await getEventWaiters(db, event?.restaurantId ?? 0, eventId, new Date());
    expect(list?.canAdd).toBe(true);
    const row = list?.waiters.find((entry) => entry.id === waiter.id);
    expect(row).toMatchObject({ name: "Ola Nowak", status: "unused" });
    const body = JSON.stringify(list);
    expect(body).not.toContain(tokenOf(waiter.path));
    expect(body).not.toContain(waiter.code);
    const stored = await db
      .from("event_waiter")
      .select("created_by, link_hash, code_hash")
      .eq("id", waiter.id)
      .single();
    expect(stored.data?.created_by).toBe(staffId);
    expect(stored.data?.link_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.data?.link_hash).not.toContain(tokenOf(waiter.path));
  });

  it("refuses an archived event, a past one, another restaurant's, a template and the limit", async () => {
    const restaurantId = event?.restaurantId ?? 0;
    const past = await eventOn(restaurantId, addDays(today, -2), "przeszłe");
    expect((await add(past)).status).toBe("closed");
    const archived = await eventOn(restaurantId, today, "archiwum");
    await db.from("event").update({ archived_at: new Date().toISOString() }).eq("id", archived);
    expect((await add(archived)).status).toBe("closed");
    expect((await add(other?.id ?? 0)).status).toBe("not-found");
    const template = await eventOn(restaurantId, today, "szablon");
    await db.from("event").update({ is_template: true }).eq("id", template);
    expect((await add(template)).status).toBe("not-found");
    expect(await getEventWaiters(db, restaurantId, template, new Date())).toBeNull();
    const full = await eventOn(restaurantId, today, "limit");
    for (let index = 0; index < MAX_EVENT_WAITERS; index++) {
      expect((await add(full, `K${String(index)}`)).status).toBe("added");
    }
    expect((await add(full, "Za dużo")).status).toBe("too-many");
  });

  it("redeems the link once: the link page uses nothing up, the redemption consumes the link and the code", async () => {
    const eventId = event?.id ?? 0;
    const waiter = await issued(eventId, "Link");
    const token = tokenOf(waiter.path);
    expect(await findWaiterLink(db, token, new Date())).toMatchObject({ name: "Link" });
    expect(await findWaiterLink(db, token, new Date())).not.toBeNull();
    const first = await redeemWaiterLink(db, token, new Date());
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.session.eventId).toBe(eventId);
    expect(first.session.expiresAt).toBe(waiter.expiresAt);
    expect((await redeemWaiterLink(db, token, new Date())).status).toBe("invalid");
    expect((await redeemWaiterCode(db, waiter.code, new Date())).status).toBe("invalid");
    expect(await findWaiterLink(db, token, new Date())).toBeNull();
    const session = await getWaiterSession(db, first.session.token);
    expect(session).toMatchObject({ waiterId: waiter.id, eventId, name: "Link" });
    const list = await getEventWaiters(db, event?.restaurantId ?? 0, eventId, new Date());
    expect(list?.waiters.find((entry) => entry.id === waiter.id)?.status).toBe("redeemed");
  });

  it("gives exactly one of two simultaneous redemptions the session", async () => {
    const waiter = await issued(event?.id ?? 0, "Wyścig");
    const token = tokenOf(waiter.path);
    const results = await Promise.all([
      redeemWaiterLink(db, token, new Date()),
      redeemWaiterCode(db, waiter.code, new Date()),
    ]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
  });

  it("redeems the code typed in lowercase with spaces, and logout ends the session", async () => {
    const waiter = await issued(event?.id ?? 0, "Kod");
    const typed = waiter.code.toLowerCase().replaceAll("-", " ");
    const result = await redeemWaiterCode(db, typed, new Date());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(await getWaiterSession(db, result.session.token)).not.toBeNull();
    await logoutWaiter(db, waiter.id);
    expect(await getWaiterSession(db, result.session.token)).toBeNull();
    expect((await redeemWaiterCode(db, waiter.code, new Date())).status).toBe("invalid");
  });

  it("never redeems outside the floor window and leaves the link unused", async () => {
    const tomorrow = await eventOn(event?.restaurantId ?? 0, addDays(today, 1), "jutro");
    const waiter = await issued(tomorrow, "Jutro");
    expect(await findWaiterLink(db, tokenOf(waiter.path), new Date())).toBeNull();
    expect((await redeemWaiterLink(db, tokenOf(waiter.path), new Date())).status).toBe("invalid");
    expect((await redeemWaiterCode(db, waiter.code, new Date())).status).toBe("invalid");
    const stored = await db.from("event_waiter").select("redeemed_at, link_hash").eq("id", waiter.id).single();
    expect(stored.data?.redeemed_at).toBeNull();
    expect(stored.data?.link_hash).not.toBeNull();
  });

  it("throttles a waiter's code after 10 tries, even the right one, and a malformed code costs nothing", async () => {
    const waiter = await issued(event?.id ?? 0, "Limit");
    const parsed = parseWaiterCode(waiter.code);
    if (!parsed) throw new Error("kod");
    const wrong = `${String(parsed.waiterId)}-2222-2222`;
    expect(waiter.code).not.toBe(wrong);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await redeemWaiterCode(db, wrong, new Date())).status).toBe("invalid");
    }
    const refused = await redeemWaiterCode(db, waiter.code, new Date());
    expect(refused.status).toBe("throttled");
    if (refused.status === "throttled") {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect((await redeemWaiterCode(db, "nie-kod", new Date())).status).toBe("invalid");
    await db.from("login_attempt").delete().eq("key_hash", waiterCodeKeyHash(parsed.waiterId));
    expect((await redeemWaiterCode(db, waiter.code, new Date())).status).toBe("ok");
  });

  it("revoking deletes the row and its session; another event's waiter id is unknown", async () => {
    const eventId = event?.id ?? 0;
    const waiter = await issued(eventId, "Cofnięty");
    const result = await redeemWaiterLink(db, tokenOf(waiter.path), new Date());
    if (result.status !== "ok") throw new Error("wejście");
    expect(await deleteEventWaiter(db, other?.restaurantId ?? 0, other?.id ?? 0, waiter.id)).toBe("not-found");
    expect(await getWaiterSession(db, result.session.token)).not.toBeNull();
    expect(await deleteEventWaiter(db, event?.restaurantId ?? 0, eventId, waiter.id)).toBe("deleted");
    expect(await getWaiterSession(db, result.session.token)).toBeNull();
    expect(await deleteEventWaiter(db, event?.restaurantId ?? 0, eventId, waiter.id)).toBe("not-found");
  });

  it("an expired waiter neither opens its link nor keeps its session", async () => {
    const waiter = await issued(event?.id ?? 0, "Wygasły");
    const result = await redeemWaiterLink(db, tokenOf(waiter.path), new Date());
    if (result.status !== "ok") throw new Error("wejście");
    const unused = await issued(event?.id ?? 0, "Wygasły 2");
    const past = new Date(Date.now() - 60_000).toISOString();
    await db.from("event_waiter").update({ expires_at: past }).in("id", [waiter.id, unused.id]);
    expect(await getWaiterSession(db, result.session.token)).toBeNull();
    expect(await findWaiterLink(db, tokenOf(unused.path), new Date())).toBeNull();
    expect((await redeemWaiterLink(db, tokenOf(unused.path), new Date())).status).toBe("invalid");
    const list = await getEventWaiters(db, event?.restaurantId ?? 0, event?.id ?? 0, new Date());
    expect(list?.waiters.find((entry) => entry.id === unused.id)?.status).toBe("expired");
  });

  it("goes with its event (cascade)", async () => {
    const eventId = await eventOn(event?.restaurantId ?? 0, today, "kaskada");
    const waiter = await issued(eventId, "Kaskada");
    await db.from("event").delete().eq("id", eventId);
    const rows = await db.from("event_waiter").select("id").eq("id", waiter.id);
    expect(rows.data).toEqual([]);
  });
});
