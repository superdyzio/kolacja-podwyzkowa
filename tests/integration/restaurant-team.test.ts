import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addRestaurantMember,
  createStaffAccount,
  findRestaurantMembership,
  getSession,
  getTokenInfo,
  issueStaffToken,
  redeemStaffToken,
} from "@/lib/auth";
import type { StaffRole } from "@/lib/auth/types";
import { createRestaurantWithOwner } from "@/lib/platform";
import type { DbClient } from "@/lib/supabase-client";
import {
  canManageMember,
  getTeam,
  inviteMember,
  inviteRoles,
  issueMemberLink,
  removeMember,
  setMemberRole,
  teamFor,
} from "@/lib/team";
import { hasLocalDb, localDb, testTag } from "./helpers";

// restaurant-team (S-12): invitations, role changes, removal and one-time links within the role matrix, checked by the
// database under a lock on the restaurant row. Every restaurant and account used here is the test's own and is deleted
// after.

const PASSWORD = "haslo-zespolu-123";
const ROLES: StaffRole[] = ["owner", "manager", "waiter"];

function tokenOf(path: string): string {
  return path.replace("/haslo/", "");
}

describe.skipIf(!hasLocalDb)("restaurant team (integration)", () => {
  let db: DbClient;
  const tag = testTag();
  const restaurantIds: number[] = [];
  const accountIds: number[] = [];
  let counter = 0;

  function email(label: string): string {
    counter++;
    return `${label}-${String(counter)}-${tag}@test.stolik`;
  }

  async function restaurant(label: string): Promise<{ id: number; ownerId: number }> {
    const result = await createRestaurantWithOwner(
      db,
      { name: `Zespół ${label} ${tag}`, owner: { email: email(`wl-${label}`), displayName: null } },
      null,
    );
    restaurantIds.push(result.restaurantId);
    accountIds.push(result.owner.accountId);
    return { id: result.restaurantId, ownerId: result.owner.accountId };
  }

  // A new account, optionally with a password (then also a session token) and a platform-admin flag.
  async function account(
    label: string,
    { active = false, admin = false }: { active?: boolean; admin?: boolean } = {},
  ): Promise<{ id: number; email: string; session: string | null }> {
    const address = email(label);
    const created = await createStaffAccount(db, { email: address, isPlatformAdmin: admin });
    if (created.status !== "created") throw new Error(created.status);
    accountIds.push(created.id);
    if (!active) {
      return { id: created.id, email: address, session: null };
    }
    const link = await issueStaffToken(db, created.id, "invite");
    if (link.status !== "issued") throw new Error("link");
    const redeemed = await redeemStaffToken(db, link.token, { password: PASSWORD, repeat: PASSWORD });
    if (redeemed.status !== "ok") throw new Error(redeemed.status);
    return { id: created.id, email: address, session: redeemed.session.token };
  }

  async function member(restaurantId: number, label: string, role: StaffRole, active = false) {
    const person = await account(label, { active });
    await addRestaurantMember(db, restaurantId, person.id, role);
    return person;
  }

  async function roleIn(restaurantId: number, accountId: number): Promise<StaffRole | null> {
    return (await findRestaurantMembership(db, accountId, restaurantId))?.role ?? null;
  }

  beforeAll(() => {
    db = localDb();
  });

  afterAll(async () => {
    if (restaurantIds.length > 0) {
      await db.from("restaurant").delete().in("id", restaurantIds);
    }
    if (accountIds.length > 0) {
      await db.from("staff_account").delete().in("id", accountIds);
    }
  });

  it("invites a new person with a 7-day invitation that redeems; a member again → already-member", async () => {
    const r = await restaurant("zaproszenie");
    const address = email("kelner");
    const invited = await inviteMember(db, r.id, r.ownerId, {
      email: address,
      displayName: "Kelner Jan",
      role: "waiter",
    });
    if (invited.status !== "invited") throw new Error(invited.status);
    accountIds.push(invited.member.accountId);
    expect(invited.member).toMatchObject({ email: address, role: "waiter", created: true, hasPassword: false });
    expect(invited.member.link?.kind).toBe("invite");
    const days = (Date.parse(invited.member.link?.expiresAt ?? "") - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    const token = tokenOf(invited.member.link?.path ?? "");
    expect(await getTokenInfo(db, token)).toEqual({ kind: "invite", email: address });
    const redeemed = await redeemStaffToken(db, token, { password: PASSWORD, repeat: PASSWORD });
    expect(redeemed.status).toBe("ok");
    expect(await roleIn(r.id, invited.member.accountId)).toBe("waiter");

    expect(await inviteMember(db, r.id, r.ownerId, { email: address, displayName: null, role: "manager" })).toEqual({
      status: "already-member",
    });
    const team = await getTeam(db, r.id, { accountId: r.ownerId, role: "owner" });
    expect(team.members.find((m) => m.accountId === invited.member.accountId)).toEqual({
      accountId: invited.member.accountId,
      email: address,
      displayName: "Kelner Jan",
      role: "waiter",
      hasPassword: true,
    });
  });

  it("refuses invitations outside the scope: a manager inviting a manager or an owner, a waiter, a stranger", async () => {
    const r = await restaurant("zakres");
    const manager = await member(r.id, "menedzer", "manager");
    const waiter = await member(r.id, "kelner", "waiter");
    const stranger = await account("obcy");
    const tries: [number, StaffRole][] = [
      [manager.id, "manager"],
      [manager.id, "owner"],
      [r.ownerId, "owner"],
      [waiter.id, "waiter"],
      [stranger.id, "waiter"],
    ];
    for (const [actor, role] of tries) {
      expect(await inviteMember(db, r.id, actor, { email: email("nikt"), displayName: null, role })).toEqual({
        status: "not-found",
      });
    }
    expect(
      await inviteMember(db, 2_000_000_000, r.ownerId, { email: email("x"), displayName: null, role: "waiter" }),
    ).toEqual({ status: "not-found" });
    expect((await getTeam(db, r.id, { accountId: r.ownerId, role: "owner" })).members).toHaveLength(3);
    const byManager = await inviteMember(db, r.id, manager.id, {
      email: email("kelner2"),
      displayName: null,
      role: "waiter",
    });
    if (byManager.status !== "invited") throw new Error(byManager.status);
    accountIds.push(byManager.member.accountId);
    expect(byManager.member.link?.kind).toBe("invite");
  });

  it("an existing account with a password joins without a link; one without a password elsewhere is refused", async () => {
    const r = await restaurant("istniejace");
    const other = await restaurant("inna");
    const active = await account("aktywny", { active: true });
    const withPassword = await inviteMember(db, r.id, r.ownerId, {
      email: active.email,
      displayName: "Inne imię",
      role: "manager",
    });
    expect(withPassword).toMatchObject({
      status: "invited",
      member: { accountId: active.id, created: false, hasPassword: true, link: null },
    });

    // Invited by the other restaurant's owner and not redeemed yet: joining here would leave the person with no way to
    // set a password, so it is refused and their invitation stays.
    const invitedThere = await inviteMember(db, other.id, other.ownerId, {
      email: email("oczekujacy"),
      displayName: null,
      role: "waiter",
    });
    if (invitedThere.status !== "invited" || !invitedThere.member.link) throw new Error("invite");
    accountIds.push(invitedThere.member.accountId);
    expect(
      await inviteMember(db, r.id, r.ownerId, {
        email: invitedThere.member.email,
        displayName: null,
        role: "waiter",
      }),
    ).toEqual({ status: "pending-elsewhere" });
    expect(await roleIn(r.id, invitedThere.member.accountId)).toBeNull();
    expect(await getTokenInfo(db, tokenOf(invitedThere.member.link.path))).toEqual({
      kind: "invite",
      email: invitedThere.member.email,
    });

    const admin = await account("admin", { admin: true, active: true });
    expect(
      await inviteMember(db, r.id, r.ownerId, { email: admin.email, displayName: null, role: "waiter" }),
    ).toMatchObject({ status: "invited", member: { hasPassword: true, link: null } });
    const pendingAdmin = await account("admin-bez-hasla", { admin: true });
    expect(
      await inviteMember(db, r.id, r.ownerId, { email: pendingAdmin.email, displayName: null, role: "waiter" }),
    ).toEqual({ status: "pending-elsewhere" });
  });

  it("a team's unused links die when the account joins a second restaurant; operator and admin links stay", async () => {
    const r = await restaurant("drugie-czlonkostwo");
    const other = await restaurant("drugie-czlonkostwo-inna");
    const third = await restaurant("drugie-czlonkostwo-trzecia");
    const manager = await member(r.id, "menedzer", "manager", true);
    // A manager's reset link for their waiter, then the waiter joins the other restaurant (any path).
    const waiter = await member(r.id, "kelner", "waiter", true);
    const reset = await issueMemberLink(db, r.id, manager.id, waiter.id);
    if (reset.status !== "issued") throw new Error(reset.status);
    const joined = await inviteMember(db, other.id, other.ownerId, {
      email: waiter.email,
      displayName: null,
      role: "waiter",
    });
    expect(joined).toMatchObject({ status: "invited", member: { link: null } });
    expect(await getTokenInfo(db, tokenOf(reset.link.path))).toBeNull();
    expect(
      await redeemStaffToken(db, tokenOf(reset.link.path), { password: `${PASSWORD}-x`, repeat: `${PASSWORD}-x` }),
    ).toMatchObject({ status: "invalid-token" });
    expect(await getSession(db, waiter.session)).not.toBeNull();

    // The same through a direct membership (platform panel, CLI): the trigger, not the team function, decides.
    const invited = await inviteMember(db, r.id, r.ownerId, {
      email: email("zaproszony"),
      displayName: null,
      role: "waiter",
    });
    if (invited.status !== "invited" || !invited.member.link) throw new Error("invite");
    accountIds.push(invited.member.accountId);
    await addRestaurantMember(db, other.id, invited.member.accountId, "owner");
    expect(await getTokenInfo(db, tokenOf(invited.member.link.path))).toBeNull();

    // An operator's link (created_by null) and a platform administrator's survive a second membership.
    const operated = await member(r.id, "operator", "waiter");
    const operatorLink = await issueStaffToken(db, operated.id, "invite");
    if (operatorLink.status !== "issued") throw new Error("link");
    await addRestaurantMember(db, other.id, operated.id, "waiter");
    expect(await getTokenInfo(db, operatorLink.token)).toEqual({ kind: "invite", email: operated.email });
    const admin = await account("admin", { admin: true, active: true });
    const ownerThere = await member(third.id, "wlasciciel", "owner");
    const adminLink = await issueStaffToken(db, ownerThere.id, "invite", admin.id);
    if (adminLink.status !== "issued") throw new Error("link");
    await addRestaurantMember(db, other.id, ownerThere.id, "owner");
    expect(await getTokenInfo(db, adminLink.token)).toEqual({ kind: "invite", email: ownerThere.email });
  });

  it("role changes follow the matrix and never demote the last owner", async () => {
    const r = await restaurant("role");
    expect(await setMemberRole(db, r.id, r.ownerId, r.ownerId, "manager")).toBe("last-owner");
    expect(await removeMember(db, r.id, r.ownerId, r.ownerId)).toBe("last-owner");
    expect(await roleIn(r.id, r.ownerId)).toBe("owner");

    const second = await member(r.id, "drugi", "manager");
    expect(await setMemberRole(db, r.id, r.ownerId, second.id, "owner")).toBe("done");
    expect(await setMemberRole(db, r.id, r.ownerId, r.ownerId, "manager")).toBe("done");
    expect(await teamFor(db, r.id, r.ownerId)).toMatchObject({ you: { role: "manager" } });
    // Now a manager: the owner is out of reach, and the remaining owner is the last one.
    expect(await setMemberRole(db, r.id, r.ownerId, second.id, "manager")).toBe("not-found");
    expect(await setMemberRole(db, r.id, second.id, second.id, "waiter")).toBe("last-owner");

    const waiter = await member(r.id, "kelner", "waiter");
    expect(await setMemberRole(db, r.id, r.ownerId, waiter.id, "waiter")).toBe("done");
    expect(await setMemberRole(db, r.id, r.ownerId, waiter.id, "manager")).toBe("not-found");
    expect(await roleIn(r.id, waiter.id)).toBe("waiter");
    // Demoted to a waiter: no team any more.
    expect(await setMemberRole(db, r.id, second.id, r.ownerId, "waiter")).toBe("done");
    expect(await teamFor(db, r.id, r.ownerId)).toBeNull();
    expect(await setMemberRole(db, r.id, second.id, 2_000_000_000, "waiter")).toBe("not-found");
  });

  it("removal keeps the person's other restaurants and sessions; an account with nothing left loses its links", async () => {
    const r = await restaurant("usuwanie");
    const other = await restaurant("usuwanie-inna");
    const both = await member(r.id, "dwie", "waiter", true);
    await addRestaurantMember(db, other.id, both.id, "waiter");
    const reset = await issueStaffToken(db, both.id, "reset");
    if (reset.status !== "issued") throw new Error("link");
    expect(await removeMember(db, r.id, r.ownerId, both.id)).toBe("done");
    expect(await roleIn(r.id, both.id)).toBeNull();
    expect(await roleIn(other.id, both.id)).toBe("waiter");
    expect(await getSession(db, both.session)).not.toBeNull();
    expect(await getTokenInfo(db, reset.token)).toEqual({ kind: "reset", email: both.email });
    expect(await removeMember(db, r.id, r.ownerId, both.id)).toBe("not-found");

    const invited = await inviteMember(db, r.id, r.ownerId, {
      email: email("zaproszony"),
      displayName: null,
      role: "waiter",
    });
    if (invited.status !== "invited" || !invited.member.link) throw new Error("invite");
    accountIds.push(invited.member.accountId);
    expect(await removeMember(db, r.id, r.ownerId, invited.member.accountId)).toBe("done");
    expect(await getTokenInfo(db, tokenOf(invited.member.link.path))).toBeNull();
  });

  it("links: invitation without a password, reset with one (ends sessions once used), elsewhere for two restaurants or an admin", async () => {
    const r = await restaurant("linki");
    const other = await restaurant("linki-inna");
    const pending = await member(r.id, "bez-hasla", "waiter");
    const pendingLink = await issueMemberLink(db, r.id, r.ownerId, pending.id);
    expect(pendingLink).toMatchObject({ status: "issued", link: { kind: "invite" } });

    const active = await member(r.id, "z-haslem", "manager", true);
    const resetLink = await issueMemberLink(db, r.id, r.ownerId, active.id);
    if (resetLink.status !== "issued") throw new Error(resetLink.status);
    expect(resetLink.link.kind).toBe("reset");
    const hours = (Date.parse(resetLink.link.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
    const redeemed = await redeemStaffToken(db, tokenOf(resetLink.link.path), {
      password: `${PASSWORD}-nowe`,
      repeat: `${PASSWORD}-nowe`,
    });
    expect(redeemed.status).toBe("ok");
    expect(await getSession(db, active.session)).toBeNull();

    const both = await member(r.id, "dwie", "waiter");
    await addRestaurantMember(db, other.id, both.id, "waiter");
    expect(await issueMemberLink(db, r.id, r.ownerId, both.id)).toEqual({ status: "elsewhere" });
    const admin = await account("admin", { admin: true });
    await addRestaurantMember(db, r.id, admin.id, "waiter");
    expect(await issueMemberLink(db, r.id, r.ownerId, admin.id)).toEqual({ status: "elsewhere" });

    expect(await issueMemberLink(db, r.id, active.id, pending.id)).toMatchObject({ status: "issued" });
    expect(await issueMemberLink(db, r.id, active.id, r.ownerId)).toEqual({ status: "not-found" });
    expect(await issueMemberLink(db, r.id, r.ownerId, 2_000_000_000)).toEqual({ status: "not-found" });
    expect(await issueMemberLink(db, other.id, r.ownerId, pending.id)).toEqual({ status: "not-found" });
  });

  it("the database refuses exactly what the TS matrix refuses (every actor role × target role)", async () => {
    const r = await restaurant("macierz");
    const actors: Record<StaffRole, number> = {
      owner: r.ownerId,
      manager: (await member(r.id, "a-menedzer", "manager")).id,
      waiter: (await member(r.id, "a-kelner", "waiter")).id,
    };
    // A second owner, so no action below meets the last-owner rule.
    await member(r.id, "a-wlasciciel", "owner");
    const mismatches: string[] = [];
    for (const actor of ROLES) {
      for (const target of ROLES) {
        const allowed = canManageMember(actor, target);
        const person = await member(r.id, `t-${actor}-${target}`, target);
        const role = await setMemberRole(db, r.id, actors[actor], person.id, target);
        const link = await issueMemberLink(db, r.id, actors[actor], person.id);
        const removed = await removeMember(db, r.id, actors[actor], person.id);
        if ((role === "done") !== allowed) mismatches.push(`${actor} role ${target}: ${role}`);
        if ((link.status === "issued") !== allowed) mismatches.push(`${actor} link ${target}: ${link.status}`);
        if ((removed === "done") !== allowed) mismatches.push(`${actor} remove ${target}: ${removed}`);
      }
      for (const role of ROLES) {
        const invited = await inviteMember(db, r.id, actors[actor], { email: email("m"), displayName: null, role });
        if (invited.status === "invited") accountIds.push(invited.member.accountId);
        if ((invited.status === "invited") !== inviteRoles(actor).includes(role)) {
          mismatches.push(`${actor} invite ${role}: ${invited.status}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("two owners removing each other at once leave exactly one owner", async () => {
    const r = await restaurant("wyscig");
    const second = await member(r.id, "drugi", "owner");
    const results = await Promise.all([
      removeMember(db, r.id, r.ownerId, second.id),
      removeMember(db, r.id, second.id, r.ownerId),
    ]);
    expect([...results].sort()).toEqual(["done", "not-found"]);
    const team = await getTeam(db, r.id, { accountId: r.ownerId, role: "owner" });
    expect(team.members.filter((m) => m.role === "owner")).toHaveLength(1);
  });
});
