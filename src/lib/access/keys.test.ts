import { describe, expect, it } from "vitest";
import { ACCESS_KEY_BYTES, ACCESS_KEY_LENGTH, generateAccessKey, isWellFormedAccessKey } from "./keys";

describe("generateAccessKey", () => {
  it("returns a 24-character base64url string", () => {
    const key = generateAccessKey();
    expect(key).toHaveLength(ACCESS_KEY_LENGTH);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("carries at least 128 bits of entropy", () => {
    expect(ACCESS_KEY_BYTES * 8).toBeGreaterThanOrEqual(128);
    // 24 base64url characters encode exactly 18 bytes.
    expect(ACCESS_KEY_LENGTH * 6).toBe(ACCESS_KEY_BYTES * 8);
  });

  it("produces keys that pass its own validator", () => {
    for (let i = 0; i < 200; i++) {
      expect(isWellFormedAccessKey(generateAccessKey())).toBe(true);
    }
  });

  it("does not repeat over 1000 keys", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateAccessKey()));
    expect(keys.size).toBe(1000);
  });

  it("uses the whole base64url alphabet over many keys (not a narrow encoding)", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateAccessKey()).join(""));
    expect(seen.size).toBe(64);
  });
});

describe("isWellFormedAccessKey", () => {
  const valid = "AbCdEfGhIjKlMnOpQrStUv-_";

  it("accepts a 24-character base64url key", () => {
    expect(isWellFormedAccessKey(valid)).toBe(true);
  });

  it.each([
    ["too short", valid.slice(0, 23)],
    ["too long", `${valid}A`],
    ["empty", ""],
    ["standard base64 plus", "AbCdEfGhIjKlMnOpQrStUv+A"],
    ["standard base64 slash", "AbCdEfGhIjKlMnOpQrStUv/A"],
    ["padding", "AbCdEfGhIjKlMnOpQrStUv=="],
    ["space", "AbCdEfGhIjKlMnOpQrStUv A"],
    ["non-ascii", "AbCdEfGhIjKlMnOpQrStUvóA"],
    ["path traversal", "../../../../../../etc/pa"],
  ])("rejects %s", (_label, value) => {
    expect(isWellFormedAccessKey(value)).toBe(false);
  });

  it.each([null, undefined, 123, {}, ["AbCdEfGhIjKlMnOpQrStUv-_"]])("rejects non-string %j", (value) => {
    expect(isWellFormedAccessKey(value)).toBe(false);
  });
});
