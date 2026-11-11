import type { StaffRole } from "@/lib/auth/types";

// The restaurant team's role matrix (restaurant-team, S-12; PRD v2 FR-023 and the Access Control table). Pure: the
// islands and the routes share it. The database checks the same matrix under a lock on the restaurant row
// (supabase/migrations/20261110140000_restaurant_team.sql, team_role_manages / team_role_invites) and decides; this
// copy drives what the UI offers. tests/integration/restaurant-team.test.ts compares the two.
//
//   owner   acts on every member (also other owners and themself) and gives any role; invites managers and waiters
//   manager acts on waiters only and invites waiters only
//   waiter  sees no team
//
// A restaurant never loses its last owner (the database refuses). Restaurant settings (S-18 branding, S-26 retention)
// and deleting a restaurant are for owners only: managers never get them.

// Who sees and manages the team (the guard's roles for every team route).
export const TEAM_ROLES: readonly StaffRole[] = ["owner", "manager"];

// The roles each role may act on (role change, removal, a one-time link) and give in a role change.
export const MANAGED_ROLES: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
  owner: ["owner", "manager", "waiter"],
  manager: ["waiter"],
  waiter: [],
};

// The roles each role may invite as (owners come from the platform administrator or a promotion).
export const INVITE_ROLES: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
  owner: ["manager", "waiter"],
  manager: ["waiter"],
  waiter: [],
};

export function canManageTeam(role: StaffRole): boolean {
  return TEAM_ROLES.includes(role);
}

export function canManageMember(actor: StaffRole, target: StaffRole): boolean {
  return MANAGED_ROLES[actor].includes(target);
}

export function assignableRoles(actor: StaffRole): readonly StaffRole[] {
  return MANAGED_ROLES[actor];
}

export function inviteRoles(actor: StaffRole): readonly StaffRole[] {
  return INVITE_ROLES[actor];
}

interface MemberLike {
  accountId: number;
  email: string;
  role: StaffRole;
}

export function ownerCount(members: readonly Pick<MemberLike, "role">[]): number {
  return members.filter((member) => member.role === "owner").length;
}

// True for the restaurant's only owner: they can be neither demoted nor removed.
export function isLastOwner(members: readonly Pick<MemberLike, "accountId" | "role">[], accountId: number): boolean {
  const member = members.find((candidate) => candidate.accountId === accountId);
  return member?.role === "owner" && ownerCount(members) <= 1;
}

const ROLE_ORDER: Record<StaffRole, number> = { owner: 0, manager: 1, waiter: 2 };

// Owners first, then managers, then waiters; inside a role by e-mail in Polish order, then account id.
export function sortTeam<T extends MemberLike>(members: readonly T[]): T[] {
  return [...members].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.email.localeCompare(b.email, "pl") || a.accountId - b.accountId,
  );
}
