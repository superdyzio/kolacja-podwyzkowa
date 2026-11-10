import { issueStaffToken } from "@/lib/auth/service";
import { tokenTtlMs } from "@/lib/auth/limits";
import { setPasswordPath } from "@/lib/auth/paths";
import { generateSecretToken, hashSecretToken } from "@/lib/auth/tokens";
import type { DbClient } from "@/lib/supabase-client";
import type { OwnerResultDto, PlatformOwnerDto, PlatformRestaurantDto, StaffLinkDto } from "@/types";

// The platform administrator's side of restaurants (platform-restaurants, S-10): the list with counters, a new
// restaurant with its owner, more owners, the on/off switch and fresh one-time links for owners. Results are status
// unions; Supabase errors throw. Never reads a restaurant's events, guests or keys — only counts (S-13 brings support
// access with its log). Server only: issuing links uses node:crypto.

export class PlatformError extends Error {
  constructor(action: string, message: string) {
    super(`Panel platformy (${action}): ${message}`);
    this.name = "PlatformError";
  }
}

function fail(action: string, error: { message: string }): never {
  throw new PlatformError(action, error.message);
}

function isOwner(value: unknown): value is PlatformOwnerDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const owner = value as Record<string, unknown>;
  return (
    typeof owner.accountId === "number" &&
    typeof owner.email === "string" &&
    (owner.displayName === null || typeof owner.displayName === "string") &&
    typeof owner.hasPassword === "boolean"
  );
}

// Every restaurant (also the default one from multi-tenant-events), by name in Polish order, then id.
export async function listPlatformRestaurants(db: DbClient): Promise<PlatformRestaurantDto[]> {
  const { data, error } = await db.rpc("platform_restaurant_list");
  if (error) {
    fail("lista restauracji", error);
  }
  return data
    .map((row) => ({
      id: row.id,
      name: row.name,
      disabled: row.disabled_at !== null,
      eventCount: row.event_count,
      memberCount: row.member_count,
      owners: Array.isArray(row.owners) ? (row.owners as unknown[]).filter(isOwner) : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id);
}

interface OwnerRow {
  owner_account_id: number;
  owner_created: boolean;
  owner_has_password: boolean;
}

export interface OwnerInput {
  email: string;
  displayName: string | null;
}

// An invitation for an owner who has no password yet; none for an account that already has one (the restaurant
// shows up in their panel after logging in — a working password is never reset just to add a restaurant).
async function ownerResult(
  db: DbClient,
  row: OwnerRow,
  email: string,
  createdBy: number | null,
): Promise<OwnerResultDto> {
  let link: StaffLinkDto | null = null;
  if (!row.owner_has_password) {
    const issued = await issueStaffToken(db, row.owner_account_id, "invite", createdBy);
    if (issued.status !== "issued") {
      throw new PlatformError("zaproszenie", "konto właściciela zniknęło");
    }
    link = { kind: "invite", path: setPasswordPath(issued.token), expiresAt: issued.expiresAt };
  }
  return {
    accountId: row.owner_account_id,
    email,
    created: row.owner_created,
    hasPassword: row.owner_has_password,
    link,
  };
}

export interface CreateRestaurantResult {
  status: "created";
  restaurantId: number;
  owner: OwnerResultDto;
}

// A new restaurant and its owner in one transaction (create_restaurant_with_owner), then the owner's invitation.
// `name` and `owner` are already validated (./rules).
export async function createRestaurantWithOwner(
  db: DbClient,
  input: { name: string; owner: OwnerInput },
  createdBy: number | null,
): Promise<CreateRestaurantResult> {
  const { data, error } = await db.rpc("create_restaurant_with_owner", {
    p_name: input.name,
    p_email: input.owner.email,
    p_display_name: input.owner.displayName,
  });
  if (error) {
    fail("zakładanie restauracji", error);
  }
  const row = data.at(0);
  if (!row) {
    throw new PlatformError("zakładanie restauracji", "brak odpowiedzi bazy");
  }
  return {
    status: "created",
    restaurantId: row.new_restaurant_id,
    owner: await ownerResult(db, row, input.owner.email, createdBy),
  };
}

export type AddOwnerResult = { status: "added"; owner: OwnerResultDto } | { status: "not-found" };

// One more owner of an existing restaurant (an existing member becomes owner).
export async function addRestaurantOwner(
  db: DbClient,
  restaurantId: number,
  owner: OwnerInput,
  createdBy: number | null,
): Promise<AddOwnerResult> {
  const { data, error } = await db.rpc("add_restaurant_owner", {
    p_restaurant_id: restaurantId,
    p_email: owner.email,
    p_display_name: owner.displayName,
  });
  if (error) {
    if (error.message.includes("RESTAURANT_NOT_FOUND")) {
      return { status: "not-found" };
    }
    fail("dodawanie właściciela", error);
  }
  const row = data.at(0);
  if (!row) {
    throw new PlatformError("dodawanie właściciela", "brak odpowiedzi bazy");
  }
  return { status: "added", owner: await ownerResult(db, row, owner.email, createdBy) };
}

// Switches a restaurant off (its staff lose access; an earlier switch-off time is kept) or on again.
export async function setRestaurantDisabled(
  db: DbClient,
  restaurantId: number,
  disabled: boolean,
): Promise<"updated" | "not-found"> {
  const { data, error } = await db.from("restaurant").select("disabled_at").eq("id", restaurantId).maybeSingle();
  if (error) {
    fail("włącznik restauracji", error);
  }
  if (!data) {
    return "not-found";
  }
  if (disabled === (data.disabled_at !== null)) {
    return "updated";
  }
  const { error: updateError } = await db
    .from("restaurant")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("id", restaurantId);
  if (updateError) {
    fail("włącznik restauracji", updateError);
  }
  return "updated";
}

export type OwnerLinkResult = { status: "issued"; link: StaffLinkDto } | { status: "not-found" };

// A fresh one-time link for an OWNER of the restaurant (US-05: a lost password never locks the restaurant out): an
// invitation while the account has no password (e.g. the first one expired), else a password-reset link. Their
// earlier unused link stops working. Anyone who is not an owner of that restaurant → not-found. A reset link logs
// whoever opens it in AS the owner, so the DB function writes a 'link' row to the support log of every restaurant the
// account belongs to, in the same transaction as the token (review-fixes; PRD FR-021, NFR-012: the owner sees every
// way of the platform administrator into the restaurant's data). `adminId` must be a platform administrator.
export async function issueOwnerLink(
  db: DbClient,
  restaurantId: number,
  accountId: number,
  adminId: number,
): Promise<OwnerLinkResult> {
  const token = generateSecretToken();
  const now = Date.now();
  const { data, error } = await db.rpc("issue_owner_link", {
    p_restaurant_id: restaurantId,
    p_admin_id: adminId,
    p_account_id: accountId,
    p_token_hash: hashSecretToken(token),
    p_invite_expires_at: new Date(now + tokenTtlMs("invite")).toISOString(),
    p_reset_expires_at: new Date(now + tokenTtlMs("reset")).toISOString(),
  });
  if (error) {
    if (error.message.includes("OWNER_NOT_FOUND") || error.message.includes("NOT_ADMIN")) {
      return { status: "not-found" };
    }
    fail("link dla właściciela", error);
  }
  const row = data.at(0);
  if (!row || (row.link_kind !== "invite" && row.link_kind !== "reset")) {
    throw new PlatformError("link dla właściciela", "brak odpowiedzi bazy");
  }
  return {
    status: "issued",
    link: { kind: row.link_kind, path: setPasswordPath(token), expiresAt: new Date(row.link_expires_at).toISOString() },
  };
}
