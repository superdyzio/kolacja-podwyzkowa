import { describe, expect, it } from "vitest";
import { guestPath, organizerPath, parseAccessPath, tvPath } from "./paths";

const KEY = "AbCdEfGhIjKlMnOpQrStUv-_";

describe("parseAccessPath", () => {
  it.each([
    [`/o/${KEY}`, "organizer", false],
    [`/o/${KEY}/`, "organizer", false],
    [`/o/${KEY}/goscie`, "organizer", false],
    [`/tv/${KEY}`, "tv", false],
    [`/g/${KEY}`, "guest", false],
    [`/api/o/${KEY}/guests`, "organizer", true],
    [`/api/tv/${KEY}/state`, "tv", true],
    [`/api/g/${KEY}`, "guest", true],
  ] as const)("maps %s to role %s (api: %s)", (pathname, role, isApi) => {
    expect(parseAccessPath(pathname)).toEqual({ role, key: KEY, isApi });
  });

  it("returns the raw key segment even when it is malformed (validation is separate)", () => {
    expect(parseAccessPath("/o/garbage")).toEqual({ role: "organizer", key: "garbage", isApi: false });
  });

  it.each([
    "/",
    "/o",
    "/o/",
    "/tv",
    "/tv/",
    "/api/o/",
    "/tvx/abc",
    "/org/abc",
    "/api/event",
    "/_astro/index.css",
    "/favicon.png",
    "/404",
    "/x/o/abc",
  ])("ignores non-access path %s", (pathname) => {
    expect(parseAccessPath(pathname)).toBeNull();
  });
});

describe("path builders", () => {
  it("build role paths that parse back to the same role and key", () => {
    expect(parseAccessPath(organizerPath(KEY))).toEqual({ role: "organizer", key: KEY, isApi: false });
    expect(parseAccessPath(tvPath(KEY))).toEqual({ role: "tv", key: KEY, isApi: false });
    expect(parseAccessPath(guestPath(KEY))).toEqual({ role: "guest", key: KEY, isApi: false });
  });
});
