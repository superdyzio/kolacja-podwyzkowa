import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/auth/email";
import {
  generateSecretToken as appToken,
  hashSecretToken as appHash,
  isWellFormedSecretToken,
} from "@/lib/auth/tokens";
import { INVITE_TTL_DAYS, RESET_TTL_HOURS } from "@/lib/auth/limits";
import {
  generateSecretToken as scriptToken,
  hashSecretToken as scriptHash,
  normalizeStaffEmail,
} from "../../scripts/lib/platform.mjs";

// staff-accounts (F-03): the scripts (platform:admin, smoke, demo) create links the app must accept, so their token
// format, hash and e-mail rules must equal src/lib/auth.

describe("scripts/lib/platform.mjs staff helpers", () => {
  it("hash tokens exactly like the app", () => {
    for (const token of ["abc", "", appToken(), scriptToken(), "zażółć gęślą jaźń"]) {
      expect(scriptHash(token)).toBe(appHash(token));
    }
  });

  it("generate tokens of the app's format", () => {
    for (let index = 0; index < 20; index++) {
      expect(isWellFormedSecretToken(scriptToken())).toBe(true);
    }
  });

  it("normalize e-mails like the app", () => {
    for (const raw of [" Ania@Example.PL ", "ania@example", "a b@c.pl", "", `${"a".repeat(250)}@x.pl`, "x@y.z"]) {
      expect(normalizeStaffEmail(raw)).toBe(normalizeEmail(raw));
    }
  });

  it("keep the link lifetimes of src/lib/auth/limits.ts (7 days, 24 hours)", () => {
    expect(INVITE_TTL_DAYS).toBe(7);
    expect(RESET_TTL_HOURS).toBe(24);
  });
});
