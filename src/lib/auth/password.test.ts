import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./limits";
import { checkNewPassword, hashPassword, parsePasswordHash, verifyPassword } from "./password";

// Small cost so the tests stay fast; the stored string carries its parameters.
const FAST = { N: 1024, r: 8, p: 1 };

describe("hashPassword / verifyPassword", () => {
  it("stores scrypt with its parameters and a fresh salt", async () => {
    const a = await hashPassword("correct horse battery", FAST);
    const b = await hashPassword("correct horse battery", FAST);
    expect(a).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(parsePasswordHash(a)?.params).toEqual(FAST);
  });

  it("accepts the right password and refuses a wrong one", async () => {
    const stored = await hashPassword("correct horse battery", FAST);
    await expect(verifyPassword("correct horse battery", stored)).resolves.toBe(true);
    await expect(verifyPassword("correct horse batterY", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("treats Unicode forms alike (NFC)", async () => {
    const stored = await hashPassword("zażółć gęślą", FAST);
    await expect(verifyPassword("zażółć gęślą".normalize("NFD"), stored)).resolves.toBe(true);
  });

  it("refuses without a usable stored hash (still running scrypt)", async () => {
    await expect(verifyPassword("anything at all", null)).resolves.toBe(false);
    await expect(verifyPassword("anything at all", "scrypt$garbage")).resolves.toBe(false);
    await expect(verifyPassword("anything at all", "bcrypt$1$2$3$4$5")).resolves.toBe(false);
  });

  it("rejects malformed or oversized parameters", () => {
    expect(parsePasswordHash("scrypt$1000$8$1$c2FsdHNhbHQ=$a2V5")).toBeNull();
    expect(parsePasswordHash(`scrypt$${String(2 ** 22)}$8$1$c2FsdHNhbHRzYWx0$${"a".repeat(44)}`)).toBeNull();
    expect(parsePasswordHash("scrypt$1024$8$1$$")).toBeNull();
  });
});

describe("checkNewPassword", () => {
  it("checks the length in code points, then the repeat", () => {
    const min = "x".repeat(PASSWORD_MIN_LENGTH);
    expect(checkNewPassword(min.slice(1), min.slice(1))).toBe("too-short");
    expect(checkNewPassword(min, min)).toBe("ok");
    expect(checkNewPassword("😀".repeat(PASSWORD_MIN_LENGTH), "😀".repeat(PASSWORD_MIN_LENGTH))).toBe("ok");
    expect(checkNewPassword("x".repeat(PASSWORD_MAX_LENGTH + 1), "")).toBe("too-long");
    expect(checkNewPassword(min, `${min}!`)).toBe("mismatch");
  });
});
