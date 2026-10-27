import { describe, expect, it } from "vitest";
import { deniedIn } from "./bounds";

describe("content bounds", () => {
  it("catches what it should and spares lookalikes", () => {
    expect(deniedIn("Czy rząd powinien…?")).toEqual(["rząd"]);
    expect(deniedIn("Czy bogaty człowiek ma porządek?")).toEqual([]);
    expect(deniedIn("Kto przy tym stole zarabia najwięcej?")).toContain("przy tym stole");
    expect(deniedIn("Ile zarabiasz?")).toContain("ile zarabiasz");
    expect(deniedIn("Czy powinno się zdrowo jeść?")).toEqual(["zdrowo"]);
  });

  it("ignores letter case and finds several hits", () => {
    expect(deniedIn("RELIGIA i Polityka?")).toEqual(["religia", "polityka"]);
  });

  it("finds nothing in a harmless topic", () => {
    expect(deniedIn("Jaką supermoc wybierasz na jeden dzień w pracy i dlaczego?")).toEqual([]);
  });
});
