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

  it("spares harmless words that start like a denied one", () => {
    expect(deniedIn("Która premiera filmowa w tym roku Cię zaskoczyła?")).toEqual([]);
    expect(deniedIn("Wakacje w Chorwacji czy piwnica pełna gier planszowych?")).toEqual([]);
    expect(deniedIn("Choreografia na weselu: tak czy nie?")).toEqual([]);
    expect(deniedIn("Planszówka z kośćmi czy z kartami? Rzut kości decyduje.")).toEqual([]);
    expect(deniedIn("Czy premier powinien…?")).toEqual(["premier"]);
    expect(deniedIn("Chodzisz do kościoła?")).toEqual(["kościoła"]);
    expect(deniedIn("Wolisz piwo czy wódkę?")).toEqual(["piwo", "wódkę"]);
  });

  it("ignores letter case and finds several hits", () => {
    expect(deniedIn("RELIGIA i Polityka?")).toEqual(["religia", "polityka"]);
  });

  it("finds nothing in a harmless topic", () => {
    expect(deniedIn("Jaką supermoc wybierasz na jeden dzień w pracy i dlaczego?")).toEqual([]);
  });
});
