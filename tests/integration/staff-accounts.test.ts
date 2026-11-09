import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addRestaurantMember,
  changePassword,
  createStaffAccount,
  findEventMembership,
  findRestaurantMembership,
  generateSecretToken,
  getMemberships,
  getSession,
  getTokenInfo,
  hashSecretToken,
  issueStaffToken,
  login,
  LOGIN_FAILURE_LIMIT,
  loginKeyHash,
  logout,
  redeemStaffToken,
  type StaffSession,
} from "@/lib/auth";
import type { DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, testTag, type TestEvent } from "./helpers";

// staff-accounts (F-03): accounts, one-time links, login with throttling, sessions, password change and memberships
// on the local DB. Every account, restaurant and login_attempt key used here is the test's own and is deleted after.

const PASSWORD = "pierwsze-haslo-123";
const NEW_PASSWORD = "drugie-haslo-456";

describe.skipIf(!hasLocalDb)("staff accounts (integration)", () => {
  let db: DbClient;
  let eventA: TestEvent | undefined;
  let eventB: TestEvent | undefined;
  const tag = testTag();
  const accountIds: number[] = [];
  const emails: string[] = [];

  function email(label: string): string {
    const address = `${label}-${tag}@test.stolik`;
    emails.push(address);
    return address;
  }

  async function account(label: string, isPlatformAdmin = false): Promise<{ id: number; email: string }> {
    const address = email(label);
    const created = await createStaffAccount(db, { email: address, isPlatformAdmin });
    if (created.status !== "created") {
      throw new Error(`konto ${address}: ${created.status}`);
    }
    accountIds.push(created.id);
    return { id: created.id, email: address };
  }

  // An account with a password set through its invitation; returns the first session's token.
  async function activeAccount(label: string): Promise<{ id: number; email: string; token: string }> {
    const created = await account(label);
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") {
      throw new Error("link");
    }
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    if (redeemed.status !== "ok") {
      throw new Error(`redeem: ${redeemed.status}`);
    }
    return { ...created, token: redeemed.session.token };
  }

  async function sessionOf(token: string): Promise<StaffSession> {
    const session = await getSession(db, token);
    if (!session) {
      throw new Error("brak sesji");
    }
    return session;
  }

  beforeAll(async () => {
    db = localDb();
    eventA = await createTestEvent(db, "konta A");
    eventB = await createTestEvent(db, "konta B");
  });

  afterAll(async () => {
    if (accountIds.length > 0) {
      await db.from("staff_account").delete().in("id", accountIds);
    }
    await db
      .from("login_attempt")
      .delete()
      .in(
        "key_hash",
        emails.map((address) => loginKeyHash(address)),
      );
    await releaseTestEvent(db, eventA);
    await releaseTestEvent(db, eventB);
  });

  it("creates an account once per e-mail (case-insensitive) and refuses odd addresses", async () => {
    const created = await account("Nowa");
    const again = await createStaffAccount(db, { email: created.email.toUpperCase() });
    expect(again).toEqual({ status: "exists", id: created.id });
    expect(await createStaffAccount(db, { email: "bez-malpy" })).toEqual({ status: "invalid-email" });
  });

  it("an invitation link shows its account, sets the password once and logs the person in", async () => {
    const created = await account("zaproszenie");
    const link = await issueStaffToken(db, created.id, "invite");
    expect(link.status).toBe("issued");
    if (link.status !== "issued") return;
    expect(await getTokenInfo(db, link.token)).toEqual({ kind: "invite", email: created.email });

    expect(await redeemStaffToken(db, link.token, { password: "krotkie", repeat: "krotkie" })).toEqual({
      status: "too-short",
    });
    expect(await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: `${PASSWORD}x` })).toEqual({
      status: "mismatch",
    });
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    expect(redeemed.status).toBe("ok");
    if (redeemed.status !== "ok") return;
    const session = await sessionOf(redeemed.session.token);
    expect(session).toMatchObject({ accountId: created.id, email: created.email, isPlatformAdmin: false });

    expect(await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD })).toEqual({
      status: "invalid-token",
    });
    expect(await getTokenInfo(db, link.token)).toBeNull();
  });

  it("refuses unknown, malformed, expired and superseded links alike", async () => {
    const created = await account("wygasly");
    const expiredToken = generateSecretToken();
    const inserted = await db.from("staff_token").insert({
      account_id: created.id,
      kind: "invite",
      token_hash: hashSecretToken(expiredToken),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(inserted.error).toBeNull();
    const first = await issueStaffToken(db, created.id, "invite");
    const second = await issueStaffToken(db, created.id, "reset");
    if (first.status !== "issued" || second.status !== "issued") throw new Error("link");

    for (const token of [expiredToken, first.token, generateSecretToken(), "garbage"]) {
      expect(await getTokenInfo(db, token)).toBeNull();
      expect(await redeemStaffToken(db, token, { password: PASSWORD, repeat: PASSWORD })).toEqual({
        status: "invalid-token",
      });
    }
    expect(await getTokenInfo(db, second.token)).toEqual({ kind: "reset", email: created.email });
    expect(await issueStaffToken(db, 2_000_000_000, "invite")).toEqual({ status: "not-found" });
  });

  it("a password reset ends every earlier session", async () => {
    const person = await activeAccount("reset");
    const loggedIn = await login(db, { email: person.email, password: PASSWORD });
    if (loggedIn.status !== "ok") throw new Error("login");
    const reset = await issueStaffToken(db, person.id, "reset");
    if (reset.status !== "issued") throw new Error("link");
    const redeemed = await redeemStaffToken(db, reset.token, { password: NEW_PASSWORD, repeat: NEW_PASSWORD });
    expect(redeemed.status).toBe("ok");
    expect(await getSession(db, person.token)).toBeNull();
    expect(await getSession(db, loggedIn.session.token)).toBeNull();
    expect((await login(db, { email: person.email, password: PASSWORD })).status).toBe("invalid");
    expect((await login(db, { email: person.email, password: NEW_PASSWORD })).status).toBe("ok");
  });

  it("logs in with the right password only; unknown e-mail and an account without a password look the same", async () => {
    const person = await activeAccount("logowanie");
    const pending = await account("bez-hasla");
    const ok = await login(db, { email: ` ${person.email.toUpperCase()} `, password: PASSWORD });
    expect(ok.status).toBe("ok");
    if (ok.status !== "ok") return;
    expect(ok.accountId).toBe(person.id);
    expect((await sessionOf(ok.session.token)).accountId).toBe(person.id);
    expect(new Date(ok.session.expiresAt).getTime() - Date.now()).toBeGreaterThan(29.9 * 24 * 3600 * 1000);

    expect(await login(db, { email: person.email, password: `${PASSWORD}!` })).toEqual({ status: "invalid" });
    expect(await login(db, { email: email("nieznany"), password: PASSWORD })).toEqual({ status: "invalid" });
    expect(await login(db, { email: pending.email, password: PASSWORD })).toEqual({ status: "invalid" });
    expect(await login(db, { email: "to nie e-mail", password: PASSWORD })).toEqual({ status: "invalid" });
  });

  it("a few typos never block; a success clears them", async () => {
    const person = await activeAccount("literowki");
    for (let round = 0; round < 3; round++) {
      for (let typo = 0; typo < LOGIN_FAILURE_LIMIT - 1; typo++) {
        expect((await login(db, { email: person.email, password: "zle-haslo-000" })).status).toBe("invalid");
      }
      expect((await login(db, { email: person.email, password: PASSWORD })).status).toBe("ok");
    }
  });

  it("after the limit even the right password is refused, the same for an unknown e-mail", async () => {
    const person = await activeAccount("zgadywanie");
    const stranger = email("obcy");
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt++) {
      expect((await login(db, { email: person.email, password: `proba-${String(attempt)}-xyz` })).status).toBe(
        "invalid",
      );
      expect((await login(db, { email: stranger, password: `proba-${String(attempt)}-xyz` })).status).toBe("invalid");
    }
    const refused = await login(db, { email: person.email.toUpperCase(), password: PASSWORD });
    expect(refused.status).toBe("throttled");
    if (refused.status === "throttled") {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(900);
    }
    expect((await login(db, { email: stranger, password: PASSWORD })).status).toBe("throttled");
    // The person's existing session is untouched.
    expect(await getSession(db, person.token)).not.toBeNull();
  });

  it("expired and garbage session tokens resolve to nobody", async () => {
    const person = await activeAccount("wygasla-sesja");
    const token = generateSecretToken();
    const inserted = await db.from("staff_session").insert({
      account_id: person.id,
      token_hash: hashSecretToken(token),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(inserted.error).toBeNull();
    expect(await getSession(db, token)).toBeNull();
    expect(await getSession(db, generateSecretToken())).toBeNull();
    expect(await getSession(db, "garbage")).toBeNull();
    expect(await getSession(db, null)).toBeNull();
  });

  it("a password change keeps this session and ends the others", async () => {
    const person = await activeAccount("zmiana");
    const other = await login(db, { email: person.email, password: PASSWORD });
    if (other.status !== "ok") throw new Error("login");
    const current = await sessionOf(person.token);

    expect(
      await changePassword(db, current, { current: "zle-obecne-haslo", password: NEW_PASSWORD, repeat: NEW_PASSWORD }),
    ).toEqual({ status: "wrong-current" });
    expect(await changePassword(db, current, { current: PASSWORD, password: "krotkie", repeat: "krotkie" })).toEqual({
      status: "too-short",
    });
    expect(await getSession(db, other.session.token)).not.toBeNull();

    expect(
      await changePassword(db, current, { current: PASSWORD, password: NEW_PASSWORD, repeat: NEW_PASSWORD }),
    ).toEqual({ status: "ok" });
    expect(await getSession(db, person.token)).not.toBeNull();
    expect(await getSession(db, other.session.token)).toBeNull();
    expect((await login(db, { email: person.email, password: PASSWORD })).status).toBe("invalid");
    expect((await login(db, { email: person.email, password: NEW_PASSWORD })).status).toBe("ok");
  });

  it("logs out this device, or every device", async () => {
    const person = await activeAccount("wyloguj");
    const second = await login(db, { email: person.email, password: PASSWORD });
    const third = await login(db, { email: person.email, password: PASSWORD });
    if (second.status !== "ok" || third.status !== "ok") throw new Error("login");

    await logout(db, await sessionOf(person.token));
    expect(await getSession(db, person.token)).toBeNull();
    expect(await getSession(db, second.session.token)).not.toBeNull();

    await logout(db, await sessionOf(second.session.token), { everywhere: true });
    expect(await getSession(db, second.session.token)).toBeNull();
    expect(await getSession(db, third.session.token)).toBeNull();
  });

  it("finds memberships only in the person's own restaurants", async () => {
    if (!eventA || !eventB) throw new Error("events");
    const owner = await account("wlasciciel");
    const waiter = await account("kelner");
    const admin = await account("admin", true);
    await addRestaurantMember(db, eventA.restaurantId, owner.id, "owner");
    await addRestaurantMember(db, eventA.restaurantId, waiter.id, "waiter");

    const memberships = await getMemberships(db, owner.id);
    expect(memberships).toEqual([
      { restaurantId: eventA.restaurantId, restaurantName: expect.any(String) as string, role: "owner" },
    ]);
    expect(await findRestaurantMembership(db, owner.id, eventA.restaurantId)).toMatchObject({
      restaurant: { id: eventA.restaurantId },
      role: "owner",
    });
    expect(await findRestaurantMembership(db, owner.id, eventB.restaurantId)).toBeNull();
    expect(await findRestaurantMembership(db, owner.id, 2_000_000_000)).toBeNull();
    expect(await findRestaurantMembership(db, admin.id, eventA.restaurantId)).toBeNull();

    expect(await findEventMembership(db, owner.id, eventA.id)).toMatchObject({
      event: { id: eventA.id, restaurantId: eventA.restaurantId },
      role: "owner",
    });
    expect(await findEventMembership(db, waiter.id, eventA.id)).toMatchObject({ role: "waiter" });
    expect(await findEventMembership(db, owner.id, eventB.id)).toBeNull();
    expect(await findEventMembership(db, owner.id, 2_000_000_000)).toBeNull();
  });

  it("deleting an account removes its sessions, links and memberships; deleting a restaurant its memberships", async () => {
    if (!eventA) throw new Error("events");
    const person = await activeAccount("usuwany");
    await addRestaurantMember(db, eventA.restaurantId, person.id, "manager");
    await issueStaffToken(db, person.id, "reset");
    const deleted = await db.from("staff_account").delete().eq("id", person.id);
    expect(deleted.error).toBeNull();
    for (const table of ["staff_session", "staff_token", "restaurant_member"] as const) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq("account_id", person.id);
      expect(count).toBe(0);
    }

    const restaurant = await db
      .from("restaurant")
      .insert({ name: `Restauracja konta ${tag}` })
      .select("id")
      .single();
    if (restaurant.error) throw new Error(restaurant.error.message);
    const member = await account("czlonek");
    await addRestaurantMember(db, restaurant.data.id, member.id, "waiter");
    await db.from("restaurant").delete().eq("id", restaurant.data.id);
    expect(await getMemberships(db, member.id)).toEqual([]);
  });
});
