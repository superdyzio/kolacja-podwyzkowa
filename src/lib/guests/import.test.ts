import { describe, expect, it } from "vitest";
import {
  checkImportAgainstList,
  describeImportProblem,
  detectSeparator,
  MAX_IMPORT_RECORDS,
  parseGuestImport,
  splitRecords,
  toImportPreview,
} from "./import";
import { MAX_GUESTS } from "./names";

describe("detectSeparator", () => {
  it("prefers a tab, then the more frequent of ; and , outside quotes (; on a tie), else one column", () => {
    expect(detectSeparator("Ania\twege\tuwagi")).toBe("tab");
    expect(detectSeparator("Imię;Dieta;Uwagi")).toBe("semicolon");
    expect(detectSeparator("Name,Diet,Notes")).toBe("comma");
    expect(detectSeparator('"Kowalska, Anna";wege')).toBe("semicolon");
    expect(detectSeparator("a;b,c")).toBe("semicolon");
    expect(detectSeparator("\n\nAnia\nKuba")).toBe("none");
    expect(detectSeparator("")).toBe("none");
  });
});

describe("splitRecords", () => {
  it("handles quotes, doubled quotes, separators and line breaks inside quotes, CRLF", () => {
    expect(splitRecords('a;"b;c";"say ""hi"""\r\n"multi\r\nline";x\r\n', ";")).toEqual([
      { line: 1, cells: ["a", "b;c", 'say "hi"'] },
      { line: 2, cells: ["multi\nline", "x"] },
    ]);
  });

  it("keeps blank lines as records (filtered later) and counts lines", () => {
    expect(splitRecords("a\n\nb", null)).toEqual([
      { line: 1, cells: ["a"] },
      { line: 2, cells: [""] },
      { line: 3, cells: ["b"] },
    ]);
  });
});

describe("parseGuestImport", () => {
  it("reads a Polish Excel export: BOM, ;, a header and diets", () => {
    const parsed = parseGuestImport(
      "﻿Imię;Dieta;Uwagi\r\nAnia Kowalska;wegetariańska;\r\nKuba;bez glutenu, bez laktozy;nie je cebuli\r\nOla;;\r\n",
    );
    expect(parsed.header).toBe(true);
    expect(parsed.separator).toBe("semicolon");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      { line: 2, name: "Ania Kowalska", diets: ["vegetarian"], note: null },
      { line: 3, name: "Kuba", diets: ["gluten-free", "lactose-free"], note: "nie je cebuli" },
      { line: 4, name: "Ola", diets: [], note: null },
    ]);
  });

  it("finds the columns of a header in any order and ignores the others", () => {
    const parsed = parseGuestImport("Notes,Table,Name,Diet\nno onion,1,Anna,vegan\n,2,Jake,\n");
    expect(parsed.separator).toBe("comma");
    expect(parsed.rows).toEqual([
      { line: 2, name: "Anna", diets: ["vegan"], note: "no onion" },
      { line: 3, name: "Jake", diets: [], note: null },
    ]);
  });

  it("reads columns by position without a header and keeps quoted commas", () => {
    const parsed = parseGuestImport('"Kowalska, Anna",wege,"alergia na seler, gorczycę"\nJan,,\n');
    expect(parsed.header).toBe(false);
    expect(parsed.rows).toEqual([
      { line: 1, name: "Kowalska, Anna", diets: ["vegetarian"], note: "alergia na seler, gorczycę" },
      { line: 2, name: "Jan", diets: [], note: null },
    ]);
  });

  it("reads a tab paste from a spreadsheet", () => {
    const parsed = parseGuestImport("Ania\twegańska\t\nKuba\t\tVIP\n");
    expect(parsed.separator).toBe("tab");
    expect(parsed.rows.map((row) => [row.name, row.diets, row.note])).toEqual([
      ["Ania", ["vegan"], null],
      ["Kuba", [], "VIP"],
    ]);
  });

  it("treats one column as a plain list (list markers dropped, blank lines skipped)", () => {
    const parsed = parseGuestImport("- Ania\n\n2. Kuba\nOla\n");
    expect(parsed.separator).toBe("none");
    expect(parsed.rows.map((row) => row.name)).toEqual(["Ania", "Kuba", "Ola"]);
  });

  it("joins a quoted line break in a cell into one line and keeps counting lines", () => {
    const parsed = parseGuestImport('Ania;"wege\nbez glutenu";\nKuba;keto;\n');
    expect(parsed.rows[0]).toEqual({ line: 1, name: "Ania", diets: ["vegetarian", "gluten-free"], note: null });
    expect(parsed.problems).toEqual([{ reason: "unknown-diet", line: 3, text: "Kuba", words: ["keto"] }]);
  });

  it("reports every problem with its line", () => {
    const parsed = parseGuestImport(
      [
        "Imię;Dieta;Uwagi",
        "Ania;wege;",
        ";wege;bez imienia",
        `${"x".repeat(41)};;`,
        "ANIA;;",
        "Ola;keto, wege;",
        `Ewa;;${"u".repeat(121)}`,
        ";;",
      ].join("\n"),
    );
    expect(parsed.problems).toEqual([
      { reason: "name-missing", line: 3 },
      { reason: "too-long", line: 4, text: "x".repeat(41) },
      { reason: "duplicate", line: 5, text: "ANIA", firstLine: 2 },
      { reason: "unknown-diet", line: 6, text: "Ola", words: ["keto"] },
      { reason: "note-too-long", line: 7, text: "Ewa" },
    ]);
    expect(parsed.rows.map((row) => row.name)).toEqual(["Ania"]);
  });

  it("stops at the record limit with one problem", () => {
    const text = Array.from({ length: MAX_IMPORT_RECORDS + 5 }, (_, index) => `Gość ${index + 1}`).join("\n");
    const parsed = parseGuestImport(text);
    expect(parsed.rows).toHaveLength(MAX_IMPORT_RECORDS);
    expect(parsed.problems).toEqual([{ reason: "too-many-lines" }]);
  });
});

describe("checkImportAgainstList", () => {
  it("refuses names already on the list (any letter case) and keeps the rest", () => {
    const checked = checkImportAgainstList(parseGuestImport("Ania;wege\nKuba;\n"), ["ania", "Ola"]);
    expect(checked.problems).toEqual([{ reason: "on-list", line: 1, text: "Ania" }]);
    expect(checked.rows.map((row) => row.name)).toEqual(["Kuba"]);
  });

  it("refuses an import over the guest limit", () => {
    const existing = Array.from({ length: MAX_GUESTS - 1 }, (_, index) => `Gość ${index + 1}`);
    const checked = checkImportAgainstList(parseGuestImport("Nowy 1\nNowy 2\n"), existing);
    expect(checked.problems).toEqual([{ reason: "too-many", existing: MAX_GUESTS - 1, rows: 2 }]);
  });

  it("says there is nothing to add for an empty text", () => {
    expect(checkImportAgainstList(parseGuestImport("\n  \n"), []).problems).toEqual([{ reason: "empty" }]);
  });
});

describe("toImportPreview", () => {
  it("is ready only without problems and with rows; problems are localized lines", () => {
    const ok = toImportPreview(checkImportAgainstList(parseGuestImport("Ania;wege"), []), 0);
    expect(ok).toMatchObject({ ready: true, existing: 0, separator: "semicolon", header: false });
    const bad = toImportPreview(checkImportAgainstList(parseGuestImport("Ania;keto"), []), 3, "en");
    expect(bad.ready).toBe(false);
    expect(bad.problems).toEqual([
      "Line 1: “Ania” — unknown diet: “keto”. Use a diet from the list or put it in the notes column.",
    ]);
    expect(describeImportProblem({ reason: "on-list", line: 4, text: "Ola" })).toBe(
      "Linia 4: „Ola” — już jest na liście gości.",
    );
  });
});
