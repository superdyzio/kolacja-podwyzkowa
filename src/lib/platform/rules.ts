import { normalizeEmail } from "@/lib/auth/email-format";
import { normalizeDisplayName } from "@/lib/guests/names";

// Input rules of the platform panel (platform-restaurants, S-10), shared by the API routes and the island. Pure: no
// DB, no node:crypto, no `astro:*`. Lengths are counted in code points like Postgres char_length().

export const RESTAURANT_NAME_MAX = 80;
export const OWNER_NAME_MAX = 80;

function codePoints(text: string): number {
  return Array.from(text).length;
}

export type RestaurantNameResult = { ok: true; name: string } | { ok: false; reason: "empty" | "too-long" };

// A restaurant's name: normalized like guest names (NFC, no invisible characters, single spaces, trimmed), 1–80.
export function parseRestaurantName(raw: string): RestaurantNameResult {
  const name = normalizeDisplayName(raw);
  if (name === "") {
    return { ok: false, reason: "empty" };
  }
  if (codePoints(name) > RESTAURANT_NAME_MAX) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, name };
}

export type OwnerInputResult =
  { ok: true; email: string; displayName: string | null } | { ok: false; reason: "email" | "name-too-long" };

// An owner to invite: the e-mail (trimmed, lowercase, shape-checked) and an optional name (empty → none).
export function parseOwnerInput(input: { email: string; name?: string | null }): OwnerInputResult {
  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, reason: "email" };
  }
  const name = normalizeDisplayName(input.name ?? "");
  if (codePoints(name) > OWNER_NAME_MAX) {
    return { ok: false, reason: "name-too-long" };
  }
  return { ok: true, email, displayName: name === "" ? null : name };
}
