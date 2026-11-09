import { createHash, randomBytes } from "node:crypto";

// Secret tokens of staff accounts (staff-accounts, F-03): the session cookie and the one-time links (invitation,
// password reset). 32 random bytes in base64url (43 characters); the database stores only their SHA-256, so a leaked
// row opens nothing. scripts/lib/platform.mjs repeats hashSecretToken for the scripts (tests/scripts pin them equal).
// Server only (node:crypto).

const SECRET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedSecretToken(value: unknown): value is string {
  return typeof value === "string" && SECRET_TOKEN_PATTERN.test(value);
}

// SHA-256 as 64 lowercase hex characters (the format the database checks).
export function hashSecretToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
