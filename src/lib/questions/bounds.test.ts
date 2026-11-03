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

describe("content bounds in English (i18n)", () => {
  it("catches English topics that cross the bounds", () => {
    expect(deniedIn("Should the government lower taxes?", "en")).toEqual(["government", "taxes"]);
    expect(deniedIn("Do you go to church or pray?", "en")).toEqual(["church", "pray"]);
    expect(deniedIn("Beer or wine with dinner?", "en")).toEqual(["beer", "wine"]);
    expect(deniedIn("How much do you earn?", "en")).toContain("how much do you earn");
    expect(deniedIn("Who at this table earns the most?", "en")).toContain("at this table");
    expect(deniedIn("What do you fear about dying?", "en")).toEqual(["dying"]);
  });

  it("spares harmless English lookalikes and Polish-only prefixes", () => {
    expect(deniedIn("Which deadline made you work the hardest?", "en")).toEqual([]);
    expect(deniedIn("Would you take a taxi or walk an hour in the rain?", "en")).toEqual([]);
    expect(deniedIn("Which chorus do you sing along to every time?", "en")).toEqual([]);
    expect(deniedIn("What is the best premiere you have ever seen?", "en")).toEqual([]);
    expect(deniedIn("Which of your skills are you proud of?", "en")).toEqual([]);
    expect(deniedIn("Which of you cooks best?", "en")).toEqual(["which of you"]);
  });

  it("keeps the Polish list as the default", () => {
    expect(deniedIn("Should the government lower taxes?")).toEqual([]);
    expect(deniedIn("Która godzina jest najlepsza na kawę?", "en")).toEqual([]);
  });
});
