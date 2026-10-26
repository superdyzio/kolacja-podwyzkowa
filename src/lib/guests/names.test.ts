import { describe, expect, it } from "vitest";
import {
  MAX_DISPLAY_NAME_LENGTH,
  describeDisplayNameProblem,
  describeGuestListProblem,
  displayNameKey,
  displayNameLength,
  isValidGroupSize,
  normalizeDisplayName,
  parseGuestList,
  quoteNames,
  validateDisplayName,
} from "./names";

describe("normalizeDisplayName", () => {
  it("trims and collapses whitespace, tabs and line breaks into single spaces", () => {
    expect(normalizeDisplayName("  Ania \t  Kowalska \n")).toBe("Ania Kowalska");
    expect(normalizeDisplayName("Ania  Nowak")).toBe("Ania Nowak");
  });

  it("drops invisible characters (BOM, zero-width, soft hyphen)", () => {
    expect(normalizeDisplayName("﻿An​ia­")).toBe("Ania");
  });

  it("composes Polish letters to NFC", () => {
    expect(normalizeDisplayName("Żaneta")).toBe("Żaneta");
    expect(normalizeDisplayName("Świętosław")).toBe("Świętosław");
  });

  it("keeps an empty string empty", () => {
    expect(normalizeDisplayName(" \t​ ")).toBe("");
  });
});

describe("displayNameKey", () => {
  it("ignores letter case, including Polish letters, and whitespace differences", () => {
    expect(displayNameKey("ŁUCJA")).toBe(displayNameKey("łucja"));
    expect(displayNameKey("Ania  Nowak ")).toBe(displayNameKey("ania nowak"));
    expect(displayNameKey("Ania")).not.toBe(displayNameKey("Ania M."));
  });
});

describe("validateDisplayName", () => {
  it("accepts 1 to 40 characters", () => {
    expect(validateDisplayName("A")).toBeNull();
    expect(validateDisplayName("x".repeat(MAX_DISPLAY_NAME_LENGTH))).toBeNull();
  });

  it("rejects empty and too-long names", () => {
    expect(validateDisplayName("")).toBe("empty");
    expect(validateDisplayName("x".repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toBe("too-long");
  });

  it("counts an emoji as one character, like Postgres char_length", () => {
    const name = `${"x".repeat(MAX_DISPLAY_NAME_LENGTH - 1)}🎉`;
    expect(name.length).toBe(MAX_DISPLAY_NAME_LENGTH + 1);
    expect(displayNameLength(name)).toBe(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(name)).toBeNull();
  });
});

describe("parseGuestList", () => {
  it("turns 40 lines into 40 guests (US-01)", () => {
    const lines = Array.from({ length: 40 }, (_, index) => `Gość ${index + 1}`);
    const parsed = parseGuestList(lines.join("\n"));
    expect(parsed.names).toEqual(lines);
    expect(parsed.problems).toEqual([]);
  });

  it("handles CRLF, CR, a BOM, blank lines and spreadsheet tabs", () => {
    const parsed = parseGuestList("﻿Ania\r\n\r\nKuba\rOla\tNowak\n   \n​\n");
    expect(parsed.names).toEqual(["Ania", "Kuba", "Ola Nowak"]);
    expect(parsed.problems).toEqual([]);
  });

  it("strips list markers but keeps names that only look like them", () => {
    const parsed = parseGuestList(
      ["- Ania", "* Kuba", "• Ola", "– Ewa", "1. Lena", "12) Marek", "2Pac", "-Zenek"].join("\n"),
    );
    expect(parsed.names).toEqual(["Ania", "Kuba", "Ola", "Ewa", "Lena", "Marek", "2Pac", "-Zenek"]);
  });

  it("keeps Polish letters", () => {
    expect(parseGuestList("Łucja\nŻaneta\nŚwiętosław").names).toEqual(["Łucja", "Żaneta", "Świętosław"]);
  });

  it("reports too-long lines with 1-based line numbers counting blank lines", () => {
    const long = "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    const parsed = parseGuestList(`Ania\n\n${long}\nKuba`);
    expect(parsed.names).toEqual(["Ania", "Kuba"]);
    expect(parsed.problems).toEqual([{ line: 3, text: long, reason: "too-long" }]);
  });

  it("keeps the first occurrence of a repeated name and reports the later ones", () => {
    const parsed = parseGuestList("Kasia\nKuba\n  kasia \nKASIA\nKasia M.");
    expect(parsed.names).toEqual(["Kasia", "Kuba", "Kasia M."]);
    expect(parsed.problems).toEqual([
      { line: 3, text: "kasia", reason: "duplicate", firstLine: 1 },
      { line: 4, text: "KASIA", reason: "duplicate", firstLine: 1 },
    ]);
  });

  it("treats a marker-stripped name as the same name", () => {
    const parsed = parseGuestList("Ania\n- ania");
    expect(parsed.names).toEqual(["Ania"]);
    expect(parsed.problems).toEqual([{ line: 2, text: "ania", reason: "duplicate", firstLine: 1 }]);
  });

  it("returns nothing for blank input", () => {
    expect(parseGuestList("")).toEqual({ names: [], problems: [] });
    expect(parseGuestList(" \n\t\n")).toEqual({ names: [], problems: [] });
  });
});

describe("messages", () => {
  it("describes paste problems in Polish", () => {
    expect(describeGuestListProblem({ line: 7, text: "Kasia", reason: "duplicate", firstLine: 2 })).toBe(
      "Linia 7: „Kasia” — powtarza linię 2.",
    );
    expect(describeGuestListProblem({ line: 3, text: "Ania", reason: "too-long" })).toBe(
      "Linia 3: „Ania” — za długa nazwa (najwyżej 40 znaków).",
    );
  });

  it("shortens a very long line in the message", () => {
    const message = describeGuestListProblem({ line: 1, text: "y".repeat(500), reason: "too-long" });
    expect(message).toContain(`„${"y".repeat(50)}…”`);
  });

  it("describes name problems and quotes name lists", () => {
    expect(describeDisplayNameProblem("empty")).toBe("Wpisz imię lub ksywkę.");
    expect(describeDisplayNameProblem("too-long")).toBe("Nazwa może mieć najwyżej 40 znaków.");
    expect(quoteNames(["Ania", "Kuba"])).toBe("„Ania”, „Kuba”");
  });
});

describe("isValidGroupSize", () => {
  it("accepts 2 to 5 members", () => {
    expect([1, 2, 3, 4, 5, 6].map(isValidGroupSize)).toEqual([false, true, true, true, true, false]);
    expect(isValidGroupSize(2.5)).toBe(false);
  });
});
