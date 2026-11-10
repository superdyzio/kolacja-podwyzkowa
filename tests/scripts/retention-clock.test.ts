import { describe, expect, it } from "vitest";
import { clockSkewMs, clockSkewProblem, MAX_CLOCK_SKEW_MS } from "../../scripts/lib/platform.mjs";

// privacy-retention (S-26) + PR #4 review: `npm run retention -- --remote` sends this machine's time as `p_now`, and
// the database decides the term by it, so the script refuses a clock that disagrees with the server's `Date` header.

const SERVER = "Tue, 10 Nov 2026 18:30:00 GMT";
const SERVER_MS = Date.parse(SERVER);

describe("clockSkewMs", () => {
  it("is the local clock minus the server's Date header", () => {
    expect(clockSkewMs(SERVER_MS, SERVER)).toBe(0);
    expect(clockSkewMs(SERVER_MS + 1500, SERVER)).toBe(1500);
    expect(clockSkewMs(SERVER_MS - 90_000, SERVER)).toBe(-90_000);
  });

  it("is null without a readable header", () => {
    expect(clockSkewMs(SERVER_MS, null)).toBeNull();
    expect(clockSkewMs(SERVER_MS, "")).toBeNull();
    expect(clockSkewMs(SERVER_MS, "wczoraj")).toBeNull();
    expect(clockSkewMs(Number.NaN, SERVER)).toBeNull();
  });
});

describe("clockSkewProblem", () => {
  it("accepts a clock within the limit either way", () => {
    expect(MAX_CLOCK_SKEW_MS).toBe(5 * 60_000);
    expect(clockSkewProblem(0)).toBeNull();
    expect(clockSkewProblem(MAX_CLOCK_SKEW_MS)).toBeNull();
    expect(clockSkewProblem(-MAX_CLOCK_SKEW_MS)).toBeNull();
  });

  it("refuses a clock ahead of or behind the server by more, saying which way and that nothing was deleted", () => {
    const ahead = clockSkewProblem(MAX_CLOCK_SKEW_MS + 1);
    expect(ahead).toContain("spieszy się");
    expect(ahead).toContain("nic nie usunięto");
    const days = clockSkewProblem(-3 * 24 * 60 * 60_000);
    expect(days).toContain("spóźnia się");
    expect(days).toContain("4320 min");
  });

  it("refuses when the server's time is unknown", () => {
    expect(clockSkewProblem(null)).toContain("nic nie usunięto");
    expect(clockSkewProblem(Number.NaN)).toContain("nagłówek Date");
  });
});
