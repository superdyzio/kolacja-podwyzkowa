import { describe, expect, it } from "vitest";
import { localeSwitchTarget } from "./locale";

// What a browser does with the Location header: the origin it lands on.
const landsOn = (location: string) => new URL(location, "https://app.example").origin;

describe("localeSwitchTarget", () => {
  it("keeps an ordinary path and query", () => {
    expect(localeSwitchTarget("/panel", "")).toBe("/panel");
    expect(localeSwitchTarget("/r/abc", "?x=1")).toBe("/r/abc?x=1");
    expect(localeSwitchTarget("/", "")).toBe("/");
  });

  it("collapses leading slashes, backslashes and whitespace into one slash (never a scheme-relative address)", () => {
    for (const pathname of [
      "//evil.com/",
      "///evil.com/",
      "/\\evil.com/",
      "\\\\evil.com/",
      "/\t/evil.com/",
      "/ //evil.com/",
    ]) {
      const target = localeSwitchTarget(pathname, "?a=1");
      expect(target).toBe("/evil.com/?a=1");
      expect(landsOn(target)).toBe("https://app.example");
    }
    expect(localeSwitchTarget("", "")).toBe("/");
  });

  it("never decodes the path: encoded slashes and letters stay as they are, on the same origin", () => {
    expect(localeSwitchTarget("/%2F%2Fevil.com/", "")).toBe("/%2F%2Fevil.com/");
    expect(landsOn("/%2F%2Fevil.com/")).toBe("https://app.example");
    expect(localeSwitchTarget("/%70anel", "")).toBe("/%70anel");
    expect(localeSwitchTarget("/a%", "")).toBe("/a%");
  });

  it("leaves slashes inside the path alone", () => {
    expect(localeSwitchTarget("/o/key//x", "")).toBe("/o/key//x");
  });
});
