import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffAccount, getSession, issueStaffToken, logout, redeemStaffToken } from "@/lib/auth";
import type { StaffSession } from "@/lib/auth/types";
import { createEvent, createRestaurant } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import {
  beginSupport,
  endSupport,
  getSupportLog,
  listActiveSupport,
  recordSupportAccess,
  SUPPORT_LOG_LIMIT,
  SUPPORT_MINUTES,
} from "@/lib/support";
import { hasLocalDb, localDb, testTag } from "./helpers";

// admin-support-log (S-13): the platform admin's support grant and the owner's append-only log. Every refusal writes
// nothing; every admitted access writes its row in the same call. Every restaurant and account used here is the
// test's own; their events are deleted first (event → restaurant does not cascade), then the restaurants (their log
// rows go with them — the one delete the log allows), then the accounts.

const PASSWORD = "haslo-wsparcia-123";
const GET = { method: "GET", path: "/panel/restauracje/1" };

describe.skipIf(!hasLocalDb)("admin support access (integration)", () => {
  let db: DbClient;
  const tag = testTag();
  const restaurantIds: number[] = [];
  const eventIds: number[] = [];
  const accountIds: number[] = [];
  let counter = 0;

  async function restaurant(label: string): Promise<{ id: number; eventId: number; eventName: string }> {
    const created = await createRestaurant(db, `Wsparcie ${label} ${tag}`);
    restaurantIds.push(created.id);
    const eventName = `Wydarzenie ${label} ${tag}`;
    const event = await createEvent(db, { restaurantId: created.id, name: eventName });
    if (event.status !== "created") throw new Error(event.status);
    eventIds.push(event.event.id);
    return { id: created.id, eventId: event.event.id, eventName };
  }

  // A new account with a password and a login session (a platform admin unless `admin: false`).
  async function login(label: string, admin = true): Promise<{ id: number; email: string; session: StaffSession }> {
    counter++;
    const email = `${label}-${String(counter)}-${tag}@test.stolik`;
    const created = await createStaffAccount(db, { email, displayName: `Wsparcie ${label}`, isPlatformAdmin: admin });
    if (created.status !== "created") throw new Error(created.status);
    accountIds.push(created.id);
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") throw new Error("link");
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    if (redeemed.status !== "ok") throw new Error(redeemed.status);
    const session = await getSession(db, redeemed.session.token);
    if (!session) throw new Error("session");
    return { id: created.id, email, session };
  }

  async function logRows(restaurantId: number) {
    const { data, error } = await db
      .from("support_log")
      .select("kind, admin_email, admin_name, reason, method, path, event_id, event_name, grant_id")
      .eq("restaurant_id", restaurantId)
      .order("id");
    if (error) throw new Error(error.message);
    return data;
  }

  async function grants(sessionId: number) {
    const { data, error } = await db.from("support_grant").select("id, restaurant_id").eq("session_id", sessionId);
    if (error) throw new Error(error.message);
    return data;
  }

  beforeAll(() => {
    db = localDb();
  });

  afterAll(async () => {
    if (eventIds.length > 0) {
      await db.from("event").delete().in("id", eventIds);
    }
    if (restaurantIds.length > 0) {
      await db.from("restaurant").delete().in("id", restaurantIds);
    }
    if (accountIds.length > 0) {
      await db.from("staff_account").delete().in("id", accountIds);
    }
  });

  it("refuses a non-admin, an expired login and an unknown restaurant, writing nothing", async () => {
    const r = await restaurant("odmowy");
    const owner = await login("wlasciciel", false);
    expect(await beginSupport(db, owner.session, r.id, "Powód testu")).toEqual({ status: "not-found" });
    const admin = await login("admin-wygasly");
    expect(await beginSupport(db, admin.session, 2_000_000_000, "Powód testu")).toEqual({ status: "not-found" });
    await db
      .from("staff_session")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", admin.session.sessionId);
    expect(await beginSupport(db, admin.session, r.id, "Powód testu")).toEqual({ status: "not-found" });
    expect(await logRows(r.id)).toEqual([]);
    expect(await grants(admin.session.sessionId)).toEqual([]);
  });

  it("enters for 60 minutes and logs who and why; every admitted read is logged with its path and event", async () => {
    const r = await restaurant("wejscie");
    const admin = await login("admin");
    const before = Date.now();
    const entered = await beginSupport(db, admin.session, r.id, "Prośba właściciela");
    if (entered.status !== "entered") throw new Error(entered.status);
    expect(entered.grant.restaurantId).toBe(r.id);
    expect(entered.grant.path).toBe(`/panel/restauracje/${String(r.id)}`);
    const minutes = (Date.parse(entered.grant.expiresAt) - before) / 60_000;
    expect(minutes).toBeGreaterThan(SUPPORT_MINUTES - 1);
    expect(minutes).toBeLessThan(SUPPORT_MINUTES + 1);

    const access = await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET);
    expect(access?.restaurant).toEqual({ id: r.id, name: `Wsparcie wejscie ${tag}` });
    expect(access?.event).toBeNull();
    expect(access?.support).toMatchObject({
      restaurantId: r.id,
      reason: "Prośba właściciela",
      restaurantDisabled: false,
    });
    const eventPath = { method: "get", path: `/api/panel/events/${String(r.eventId)}` };
    const eventAccess = await recordSupportAccess(db, admin.session.sessionId, { eventId: r.eventId }, eventPath);
    expect(eventAccess?.event).toEqual({ id: r.eventId, name: r.eventName, restaurantId: r.id });

    const rows = await logRows(r.id);
    expect(rows.map((row) => row.kind)).toEqual(["enter", "access", "access"]);
    expect(rows[0]).toMatchObject({
      admin_email: admin.email,
      admin_name: "Wsparcie admin",
      reason: "Prośba właściciela",
      method: null,
      path: null,
    });
    expect(rows[1]).toMatchObject({ method: "GET", path: GET.path, event_id: null, event_name: null });
    expect(rows[2]).toMatchObject({
      method: "GET",
      path: eventPath.path,
      event_id: r.eventId,
      event_name: r.eventName,
    });
    expect(new Set(rows.map((row) => row.grant_id)).size).toBe(1);
    expect(await listActiveSupport(db, admin.session.sessionId)).toEqual([entered.grant]);
  });

  it("opens nothing and writes nothing outside a live grant of this login for this restaurant", async () => {
    const r = await restaurant("granice");
    const other = await restaurant("inna");
    const admin = await login("admin-granice");
    const secondLogin = await login("admin-drugi");
    // No grant yet.
    expect(await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET)).toBeNull();
    const entered = await beginSupport(db, admin.session, r.id, "Granice wsparcia");
    expect(entered.status).toBe("entered");
    // Another restaurant, an event of another restaurant, an unknown event, another login.
    expect(await recordSupportAccess(db, admin.session.sessionId, { restaurantId: other.id }, GET)).toBeNull();
    expect(await recordSupportAccess(db, admin.session.sessionId, { eventId: other.eventId }, GET)).toBeNull();
    expect(await recordSupportAccess(db, admin.session.sessionId, { eventId: 2_000_000_000 }, GET)).toBeNull();
    expect(await recordSupportAccess(db, secondLogin.session.sessionId, { restaurantId: r.id }, GET)).toBeNull();
    expect((await logRows(r.id)).map((row) => row.kind)).toEqual(["enter"]);
    expect(await logRows(other.id)).toEqual([]);

    // Expired grant.
    await db
      .from("support_grant")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("session_id", admin.session.sessionId);
    expect(await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET)).toBeNull();
    expect(await listActiveSupport(db, admin.session.sessionId)).toEqual([]);

    // A live grant, then the admin flag goes.
    expect((await beginSupport(db, admin.session, r.id, "Jeszcze raz")).status).toBe("entered");
    expect(await grants(admin.session.sessionId)).toHaveLength(1);
    await db.from("staff_account").update({ is_platform_admin: false }).eq("id", admin.id);
    expect(await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET)).toBeNull();
    expect((await logRows(r.id)).map((row) => row.kind)).toEqual(["enter", "enter"]);
  });

  it("opens a switched-off restaurant too", async () => {
    const r = await restaurant("wylaczona");
    await db.from("restaurant").update({ disabled_at: new Date().toISOString() }).eq("id", r.id);
    const admin = await login("admin-wylaczona");
    expect((await beginSupport(db, admin.session, r.id, "Pomoc przy wyłączeniu")).status).toBe("entered");
    const access = await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET);
    expect(access?.support.restaurantDisabled).toBe(true);
  });

  it("re-entry replaces the grant; exit is logged once; logout ends it and keeps the log", async () => {
    const r = await restaurant("koniec");
    const admin = await login("admin-koniec");
    expect((await beginSupport(db, admin.session, r.id, "Pierwszy powód")).status).toBe("entered");
    expect((await beginSupport(db, admin.session, r.id, "Drugi powód")).status).toBe("entered");
    expect(await grants(admin.session.sessionId)).toHaveLength(1);
    expect(await endSupport(db, admin.session.sessionId, r.id)).toBe(true);
    expect(await endSupport(db, admin.session.sessionId, r.id)).toBe(false);
    expect(await recordSupportAccess(db, admin.session.sessionId, { restaurantId: r.id }, GET)).toBeNull();
    expect((await logRows(r.id)).map((row) => [row.kind, row.reason])).toEqual([
      ["enter", "Pierwszy powód"],
      ["enter", "Drugi powód"],
      ["exit", null],
    ]);

    expect((await beginSupport(db, admin.session, r.id, "Przed wylogowaniem")).status).toBe("entered");
    await logout(db, admin.session);
    expect(await grants(admin.session.sessionId)).toEqual([]);
    expect(await logRows(r.id)).toHaveLength(4);
  });

  it("keeps the log append-only; deleting the restaurant takes its rows", async () => {
    const r = await restaurant("dopisywanie");
    const admin = await login("admin-dopisywanie");
    expect((await beginSupport(db, admin.session, r.id, "Dziennik tylko do dopisywania")).status).toBe("entered");
    const updated = await db.from("support_log").update({ reason: "zmienione" }).eq("restaurant_id", r.id);
    expect(updated.error?.message).toContain("SUPPORT_LOG_APPEND_ONLY");
    const deleted = await db.from("support_log").delete().eq("restaurant_id", r.id);
    expect(deleted.error?.message).toContain("SUPPORT_LOG_APPEND_ONLY");
    expect(await logRows(r.id)).toHaveLength(1);

    await db.from("event").delete().eq("id", r.eventId);
    const gone = await db.from("restaurant").delete().eq("id", r.id);
    expect(gone.error).toBeNull();
    expect(await logRows(r.id)).toEqual([]);
  });

  it("reads the newest entries first, up to the limit", async () => {
    const r = await restaurant("odczyt");
    const admin = await login("admin-odczyt");
    expect((await beginSupport(db, admin.session, r.id, "Odczyt dziennika")).status).toBe("entered");
    for (let index = 0; index < SUPPORT_LOG_LIMIT; index++) {
      await recordSupportAccess(
        db,
        admin.session.sessionId,
        { restaurantId: r.id },
        { method: "GET", path: `/p/${String(index)}` },
      );
    }
    const log = await getSupportLog(db, r.id);
    expect(log.restaurantId).toBe(r.id);
    expect(log.entries).toHaveLength(SUPPORT_LOG_LIMIT);
    expect(log.truncated).toBe(true);
    expect(log.entries[0]).toMatchObject({ kind: "access", path: `/p/${String(SUPPORT_LOG_LIMIT - 1)}` });
    expect(log.entries[0]?.admin).toEqual({ email: admin.email, name: "Wsparcie admin-odczyt" });
    expect(log.entries.every((entry, index) => index === 0 || entry.id < (log.entries[index - 1]?.id ?? 0))).toBe(true);
    const empty = await getSupportLog(db, (await restaurant("pusty")).id);
    expect(empty).toEqual({ restaurantId: empty.restaurantId, entries: [], truncated: false });
  });
});
