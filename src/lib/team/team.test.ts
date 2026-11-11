import { describe, expect, it } from "vitest";
import type { StaffRole } from "@/lib/auth/types";
import { InviteMemberBody, UpdateMemberBody } from "./api";
import { teamMessages } from "./messages";
import {
  assignableRoles,
  canManageMember,
  canManageTeam,
  inviteRoles,
  isLastOwner,
  ownerCount,
  sortTeam,
  TEAM_ROLES,
} from "./rules";

const ROLES: StaffRole[] = ["owner", "manager", "waiter"];

describe("the team matrix", () => {
  it("lets owners and managers see the team, never waiters", () => {
    expect(TEAM_ROLES).toEqual(["owner", "manager"]);
    expect(ROLES.filter(canManageTeam)).toEqual(["owner", "manager"]);
  });

  it("an owner acts on every role, a manager on waiters only, a waiter on nobody", () => {
    const allowed = ROLES.flatMap((actor) =>
      ROLES.filter((target) => canManageMember(actor, target)).map((target) => `${actor}→${target}`),
    );
    expect(allowed).toEqual(["owner→owner", "owner→manager", "owner→waiter", "manager→waiter"]);
  });

  it("gives the roles one manages; an owner invites managers and waiters, never owners", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "manager", "waiter"]);
    expect(assignableRoles("manager")).toEqual(["waiter"]);
    expect(assignableRoles("waiter")).toEqual([]);
    expect(inviteRoles("owner")).toEqual(["manager", "waiter"]);
    expect(inviteRoles("manager")).toEqual(["waiter"]);
    expect(inviteRoles("waiter")).toEqual([]);
  });
});

describe("owners", () => {
  const team = [
    { accountId: 1, email: "a@x.pl", role: "owner" as const },
    { accountId: 2, email: "b@x.pl", role: "manager" as const },
  ];

  it("counts owners and finds the last one", () => {
    expect(ownerCount(team)).toBe(1);
    expect(isLastOwner(team, 1)).toBe(true);
    expect(isLastOwner(team, 2)).toBe(false);
    expect(isLastOwner(team, 99)).toBe(false);
    const twoOwners = [...team, { accountId: 3, email: "c@x.pl", role: "owner" as const }];
    expect(isLastOwner(twoOwners, 1)).toBe(false);
  });
});

describe("sortTeam", () => {
  it("orders owners, managers, waiters, then by e-mail in Polish order and id", () => {
    const sorted = sortTeam([
      { accountId: 5, email: "zosia@x.pl", role: "waiter" as const },
      { accountId: 4, email: "łukasz@x.pl", role: "waiter" as const },
      { accountId: 3, email: "lena@x.pl", role: "waiter" as const },
      { accountId: 2, email: "bartek@x.pl", role: "manager" as const },
      { accountId: 1, email: "ola@x.pl", role: "owner" as const },
    ]);
    expect(sorted.map((member) => member.accountId)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("request bodies", () => {
  it("accept the known roles strictly", () => {
    expect(InviteMemberBody.safeParse({ email: "a@x.pl", role: "waiter" }).success).toBe(true);
    expect(InviteMemberBody.safeParse({ email: "a@x.pl", name: null, role: "manager" }).success).toBe(true);
    expect(InviteMemberBody.safeParse({ email: "a@x.pl", role: "chef" }).success).toBe(false);
    expect(InviteMemberBody.safeParse({ email: "a@x.pl", role: "waiter", restaurantId: 1 }).success).toBe(false);
    expect(UpdateMemberBody.safeParse({ role: "owner" }).success).toBe(true);
    expect(UpdateMemberBody.safeParse({}).success).toBe(false);
    expect(UpdateMemberBody.safeParse({ role: "owner", x: 1 }).success).toBe(false);
  });
});

describe("teamMessages", () => {
  it("has both languages with the same keys and filled texts", () => {
    const pl = teamMessages("pl");
    const en = teamMessages("en");
    expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
    expect(pl.lastOwner).not.toBe(en.lastOwner);
    expect(pl.confirmRemove("a@x.pl")).toContain("a@x.pl");
    expect(en.roleChanged("a@x.pl", "Waiter")).toContain("Waiter");
  });
});
