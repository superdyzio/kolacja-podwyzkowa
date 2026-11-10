import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addRestaurantMember,
  createStaffAccount,
  findEventMembership,
  findRestaurantMembership,
  getMemberships,
  getTokenInfo,
  issueStaffToken,
  redeemStaffToken,
} from "@/lib/auth";
import {
  addRestaurantOwner,
  createRestaurantWithOwner,
  issueOwnerLink,
  listPlatformRestaurants,
  setRestaurantDisabled,
} from "@/lib/platform";
import type { DbClient } from "@/lib/supabase-client";
import { getTeam } from "@/lib/team";
import { createTestEvent, hasLocalDb, localDb, releaseTestEvent, testTag, type TestEvent } from "./helpers";

// platform-restaurants (S-10): restaurants with owners, the list with counters, owner links and the on/off switch on
// the local DB. Every restaurant and account used here is the test's own and is deleted after.

const PASSWORD = "haslo-platformy-123";

function tokenOf(path: string): string {
  return path.replace("/haslo/", "");
}

describe.skipIf(!hasLocalDb)("platform restaurants (integration)", () => {
  let db: DbClient;
  let event: TestEvent | undefined;
  const tag = testTag();
  const restaurantIds: number[] = [];
  const accountIds: number[] = [];

  function email(label: string): string {
    return `${label}-${tag}@test.stolik`;
  }

  async function activeAccount(label: string): Promise<{ id: number; email: string }> {
    const address = email(label);
    const created = await createStaffAccount(db, { email: address });
    if (created.status !== "created") throw new Error(created.status);
    accountIds.push(created.id);
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") throw new Error("link");
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    if (redeemed.status !== "ok") throw new Error(redeemed.status);
    return { id: created.id, email: address };
  }

  async function created(label: string, ownerLabel: string) {
    const result = await createRestaurantWithOwner(
      db,
      { name: `Restauracja ${label} ${tag}`, owner: { email: email(ownerLabel), displayName: `Właściciel ${label}` } },
      null,
    );
    restaurantIds.push(result.restaurantId);
    accountIds.push(result.owner.accountId);
    return result;
  }

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "platforma");
  });

  afterAll(async () => {
    if (restaurantIds.length > 0) {
      await db.from("restaurant").delete().in("id", restaurantIds);
    }
    if (accountIds.length > 0) {
      await db.from("staff_account").delete().in("id", accountIds);
    }
    await releaseTestEvent(db, event);
  });

  it("creates a restaurant with a new owner (no password) and an invitation for them", async () => {
    const result = await created("nowa", "wlasciciel-nowej");
    expect(result.owner).toMatchObject({ email: email("wlasciciel-nowej"), created: true, hasPassword: false });
    expect(result.owner.link?.kind).toBe("invite");
    expect(result.owner.link?.path).toMatch(/^\/haslo\/[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(result.owner.link?.path ?? "");
    expect(await getTokenInfo(db, token)).toEqual({ kind: "invite", email: email("wlasciciel-nowej") });

    const membership = await findRestaurantMembership(db, result.owner.accountId, result.restaurantId);
    expect(membership).toMatchObject({ restaurant: { id: result.restaurantId }, role: "owner" });
  });

  it("gives no link to an owner whose account already has a password", async () => {
    const person = await activeAccount("z-haslem");
    const result = await createRestaurantWithOwner(
      db,
      { name: `Restauracja z hasłem ${tag}`, owner: { email: person.email, displayName: null } },
      person.id,
    );
    restaurantIds.push(result.restaurantId);
    expect(result.owner).toEqual({
      accountId: person.id,
      email: person.email,
      created: false,
      hasPassword: true,
      link: null,
    });
    expect((await getMemberships(db, person.id)).map((m) => m.restaurantId)).toContain(result.restaurantId);
  });

  it("adds owners to an existing restaurant; a waiter becomes owner; an unknown restaurant is not found", async () => {
    const result = await created("dodawanie", "pierwszy");
    const waiter = await activeAccount("kelner");
    await addRestaurantMember(db, result.restaurantId, waiter.id, "waiter");
    const promoted = await addRestaurantOwner(
      db,
      result.restaurantId,
      { email: waiter.email, displayName: null },
      null,
    );
    expect(promoted).toMatchObject({ status: "added", owner: { accountId: waiter.id, hasPassword: true, link: null } });
    expect(await findRestaurantMembership(db, waiter.id, result.restaurantId)).toMatchObject({ role: "owner" });

    expect(await addRestaurantOwner(db, 2_000_000_000, { email: email("nikt"), displayName: null }, null)).toEqual({
      status: "not-found",
    });
    const { count } = await db
      .from("staff_account")
      .select("id", { count: "exact", head: true })
      .eq("email", email("nikt"));
    expect(count).toBe(0);
  });

  it("lists every restaurant with its counters and owners", async () => {
    if (!event) throw new Error("event");
    const result = await created("lista", "wlasciciel-listy");
    const manager = await activeAccount("menedzer");
    await addRestaurantMember(db, result.restaurantId, manager.id, "manager");

    const list = await listPlatformRestaurants(db);
    const { data: all } = await db.from("restaurant").select("id");
    expect(list.map((r) => r.id).sort((a, b) => a - b)).toEqual((all ?? []).map((r) => r.id).sort((a, b) => a - b));

    const mine = list.find((r) => r.id === result.restaurantId);
    expect(mine).toEqual({
      id: result.restaurantId,
      name: `Restauracja lista ${tag}`,
      disabled: false,
      eventCount: 0,
      memberCount: 2,
      owners: [
        {
          accountId: result.owner.accountId,
          email: email("wlasciciel-listy"),
          displayName: "Właściciel lista",
          hasPassword: false,
        },
      ],
    });
    const withEvent = list.find((r) => r.id === event?.restaurantId);
    expect(withEvent).toMatchObject({ eventCount: 1, memberCount: 0, owners: [] });
  });

  it("issues owner links: an invitation before the password, a reset after, never for a non-owner", async () => {
    const result = await created("linki", "wlasciciel-linkow");
    const first = await issueOwnerLink(db, result.restaurantId, result.owner.accountId, null);
    expect(first).toMatchObject({ status: "issued", link: { kind: "invite" } });
    if (first.status !== "issued") return;
    // The fresh link supersedes the creation's invitation.
    expect(await getTokenInfo(db, tokenOf(result.owner.link?.path ?? ""))).toBeNull();

    const redeemed = await redeemStaffToken(db, tokenOf(first.link.path), { password: PASSWORD, repeat: PASSWORD });
    expect(redeemed.status).toBe("ok");
    const reset = await issueOwnerLink(db, result.restaurantId, result.owner.accountId, null);
    expect(reset).toMatchObject({ status: "issued", link: { kind: "reset" } });

    const waiter = await activeAccount("kelner-linki");
    await addRestaurantMember(db, result.restaurantId, waiter.id, "waiter");
    expect(await issueOwnerLink(db, result.restaurantId, waiter.id, null)).toEqual({ status: "not-found" });
    const other = await created("inna", "wlasciciel-innej");
    expect(await issueOwnerLink(db, result.restaurantId, other.owner.accountId, null)).toEqual({
      status: "not-found",
    });
    expect(await issueOwnerLink(db, 2_000_000_000, result.owner.accountId, null)).toEqual({ status: "not-found" });
  });

  it("a disabled restaurant opens nothing through the membership lookups and is listed as disabled", async () => {
    if (!event) throw new Error("event");
    const owner = await activeAccount("wlasciciel-wylaczanej");
    await addRestaurantMember(db, event.restaurantId, owner.id, "owner");
    expect(await findEventMembership(db, owner.id, event.id)).not.toBeNull();

    expect(await setRestaurantDisabled(db, event.restaurantId, true)).toBe("updated");
    expect(await findRestaurantMembership(db, owner.id, event.restaurantId)).toBeNull();
    expect(await findEventMembership(db, owner.id, event.id)).toBeNull();
    expect(await getMemberships(db, owner.id)).toEqual([
      { restaurantId: event.restaurantId, restaurantName: expect.any(String) as string, role: "owner", disabled: true },
    ]);
    const { data: first } = await db.from("restaurant").select("disabled_at").eq("id", event.restaurantId).single();
    expect(await setRestaurantDisabled(db, event.restaurantId, true)).toBe("updated");
    const { data: again } = await db.from("restaurant").select("disabled_at").eq("id", event.restaurantId).single();
    expect(again?.disabled_at).toBe(first?.disabled_at);
    expect((await listPlatformRestaurants(db)).find((r) => r.id === event?.restaurantId)?.disabled).toBe(true);

    expect(await setRestaurantDisabled(db, event.restaurantId, false)).toBe("updated");
    expect(await findEventMembership(db, owner.id, event.id)).toMatchObject({ role: "owner" });
    expect(await setRestaurantDisabled(db, 2_000_000_000, true)).toBe("not-found");
  });

  it("the team (restaurant-team getTeam) orders the members by role with their account ids", async () => {
    if (!event) throw new Error("event");
    const waiter = await activeAccount("a-kelner");
    const manager = await activeAccount("b-menedzer");
    const owner = await activeAccount("c-wlasciciel");
    await addRestaurantMember(db, event.restaurantId, waiter.id, "waiter");
    await addRestaurantMember(db, event.restaurantId, manager.id, "manager");
    await addRestaurantMember(db, event.restaurantId, owner.id, "owner");
    const team = await getTeam(db, event.restaurantId, { accountId: owner.id, role: "owner" });
    expect(team.you).toEqual({ accountId: owner.id, role: "owner" });
    const roles = team.members.map((m) => m.role);
    expect(roles.indexOf("owner")).toBeLessThan(roles.indexOf("manager"));
    expect(roles.indexOf("manager")).toBeLessThan(roles.indexOf("waiter"));
    expect(team.members.find((m) => m.email === waiter.email)).toEqual({
      accountId: waiter.id,
      email: waiter.email,
      displayName: null,
      role: "waiter",
      hasPassword: true,
    });
  });
});
