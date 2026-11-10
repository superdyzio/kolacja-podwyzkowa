import { setPasswordPath } from "@/lib/auth/paths";
import { issueStaffToken } from "@/lib/auth/service";
import { tokenTtlMs } from "@/lib/auth/limits";
import { generateSecretToken, hashSecretToken } from "@/lib/auth/tokens";
import { isStaffRole, type StaffRole } from "@/lib/auth/types";
import type { DbClient } from "@/lib/supabase-client";
import type { StaffLinkDto, TeamDto, TeamInviteResultDto, TeamMemberDto } from "@/types";
import { canManageTeam, sortTeam } from "./rules";

// The restaurant team in the database (restaurant-team, S-12). Called only after the central guard opened the
// restaurant for the person (panelRestaurantApi / findPanelRestaurant with TEAM_ROLES); every write goes through a DB
// function that re-checks the person's role and the target's role under a lock on the restaurant row, so the role
// matrix and the last-owner rule hold even when two people act at once. Results are status unions; Supabase errors
// throw. Server only: links use node:crypto.

export class TeamError extends Error {
  constructor(action: string, message: string) {
    super(`Zespół lokalu (${action}): ${message}`);
    this.name = "TeamError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new TeamError(action, error.message);
}

// The DB functions' "not yours" answers: one status, so the routes give the identical 404.
function isDenial(message: string): boolean {
  return ["RESTAURANT_NOT_FOUND", "NOT_ALLOWED", "MEMBER_NOT_FOUND", "INVALID_ROLE"].some((code) =>
    message.includes(code),
  );
}

export interface TeamViewer {
  accountId: number;
  role: StaffRole;
}

// The whole team of the restaurant for an owner or a manager (`you` = the person looking).
export async function getTeam(db: DbClient, restaurantId: number, you: TeamViewer): Promise<TeamDto> {
  const { data, error } = await db
    .from("restaurant_member")
    .select("account_id, role, staff_account(email, display_name, password_hash)")
    .eq("restaurant_id", restaurantId);
  if (error) {
    fail("odczyt zespołu", error);
  }
  const members: TeamMemberDto[] = data
    .filter((row) => isStaffRole(row.role))
    .map((row) => ({
      accountId: row.account_id,
      email: row.staff_account.email,
      displayName: row.staff_account.display_name,
      role: row.role as StaffRole,
      hasPassword: row.staff_account.password_hash !== null,
    }));
  return { restaurantId, you: { accountId: you.accountId, role: you.role }, members: sortTeam(members) };
}

// The team as the person sees it after a change, re-reading their own membership: null when they are no longer in
// the restaurant or no longer an owner or a manager (removed themself, gave up the role).
export async function teamFor(db: DbClient, restaurantId: number, accountId: number): Promise<TeamDto | null> {
  const { data, error } = await db
    .from("restaurant_member")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    fail("odczyt roli", error);
  }
  if (!data || !isStaffRole(data.role) || !canManageTeam(data.role)) {
    return null;
  }
  return getTeam(db, restaurantId, { accountId, role: data.role });
}

export interface MemberInput {
  // Already normalized by parseOwnerInput (trimmed, lowercase).
  email: string;
  displayName: string | null;
  role: StaffRole;
}

export type InviteResult =
  { status: "invited"; member: TeamInviteResultDto } | { status: "not-found" } | { status: "already-member" };

// The e-mail joins the team (add_restaurant_member); a new account — or one without a password that belongs to this
// restaurant alone — gets a 7-day invitation. An account of another restaurant or a platform administrator never gets
// a link from here (it would let the inviter set the password of rights elsewhere).
export async function inviteMember(
  db: DbClient,
  restaurantId: number,
  actorId: number,
  input: MemberInput,
): Promise<InviteResult> {
  const { data, error } = await db.rpc("add_restaurant_member", {
    p_restaurant_id: restaurantId,
    p_actor_id: actorId,
    p_email: input.email,
    p_display_name: input.displayName,
    p_role: input.role,
  });
  if (error) {
    if (error.message.includes("ALREADY_MEMBER")) {
      return { status: "already-member" };
    }
    if (isDenial(error.message)) {
      return { status: "not-found" };
    }
    fail("zaproszenie", error);
  }
  const row = data.at(0);
  if (!row) {
    throw new TeamError("zaproszenie", "brak odpowiedzi bazy");
  }
  let link: StaffLinkDto | null = null;
  if (!row.member_has_password && row.member_exclusive) {
    const issued = await issueStaffToken(db, row.member_account_id, "invite", actorId);
    if (issued.status !== "issued") {
      throw new TeamError("zaproszenie", "konto zniknęło");
    }
    link = { kind: "invite", path: setPasswordPath(issued.token), expiresAt: issued.expiresAt };
  }
  return {
    status: "invited",
    member: {
      accountId: row.member_account_id,
      email: input.email,
      role: input.role,
      created: row.member_created,
      hasPassword: row.member_has_password,
      link,
    },
  };
}

export type MemberChangeResult = "done" | "not-found" | "last-owner";

function changeResult(action: string, error: { message: string } | null): MemberChangeResult {
  if (!error) {
    return "done";
  }
  if (error.message.includes("LAST_OWNER")) {
    return "last-owner";
  }
  if (isDenial(error.message)) {
    return "not-found";
  }
  fail(action, error);
}

// A member's new role within the person's scope; the last owner keeps theirs.
export async function setMemberRole(
  db: DbClient,
  restaurantId: number,
  actorId: number,
  accountId: number,
  role: StaffRole,
): Promise<MemberChangeResult> {
  const { error } = await db.rpc("set_restaurant_member_role", {
    p_restaurant_id: restaurantId,
    p_actor_id: actorId,
    p_account_id: accountId,
    p_role: role,
  });
  return changeResult("zmiana roli", error);
}

// Removes a member within the person's scope (never the last owner). Only the membership goes: the person's sessions
// and other restaurants stay, this restaurant closes to them on their next request.
export async function removeMember(
  db: DbClient,
  restaurantId: number,
  actorId: number,
  accountId: number,
): Promise<MemberChangeResult> {
  const { error } = await db.rpc("remove_restaurant_member", {
    p_restaurant_id: restaurantId,
    p_actor_id: actorId,
    p_account_id: accountId,
  });
  return changeResult("usuwanie z zespołu", error);
}

export type MemberLinkResult =
  { status: "issued"; link: StaffLinkDto } | { status: "not-found" } | { status: "elsewhere" };

// A fresh one-time link for a member within the person's scope: an invitation while the account has no password, else
// a password reset; the member's earlier unused link dies. `elsewhere` for an account that also belongs to another
// restaurant or is a platform administrator.
export async function issueMemberLink(
  db: DbClient,
  restaurantId: number,
  actorId: number,
  accountId: number,
): Promise<MemberLinkResult> {
  const token = generateSecretToken();
  const now = Date.now();
  const { data, error } = await db.rpc("issue_member_link", {
    p_restaurant_id: restaurantId,
    p_actor_id: actorId,
    p_account_id: accountId,
    p_token_hash: hashSecretToken(token),
    p_invite_expires_at: new Date(now + tokenTtlMs("invite")).toISOString(),
    p_reset_expires_at: new Date(now + tokenTtlMs("reset")).toISOString(),
  });
  if (error) {
    if (error.message.includes("ELSEWHERE")) {
      return { status: "elsewhere" };
    }
    if (isDenial(error.message)) {
      return { status: "not-found" };
    }
    fail("link dla członka zespołu", error);
  }
  const row = data.at(0);
  if (!row || (row.link_kind !== "invite" && row.link_kind !== "reset")) {
    throw new TeamError("link dla członka zespołu", "brak odpowiedzi bazy");
  }
  return {
    status: "issued",
    link: {
      kind: row.link_kind,
      path: setPasswordPath(token),
      expiresAt: new Date(row.link_expires_at).toISOString(),
    },
  };
}
