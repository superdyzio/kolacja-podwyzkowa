import { describe, expect, it } from "vitest";
import type { EventExportDto } from "@/types";
import {
  CSV_BOM,
  csvCell,
  exportContentType,
  exportFileName,
  exportGuestsCsv,
  exportOrdersCsv,
  exportPath,
  parseExportFormat,
  toCsv,
} from "./export";

// privacy-retention (S-26): the export's files — formats, names, CSV safety (separators, quotes, line breaks, formula
// injection), the BOM, headers in both languages and the bill's total.

const DATA: EventExportDto = {
  version: 1,
  exportedAt: "2026-11-10T11:00:00.000Z",
  event: {
    name: "Wigilia",
    date: "2026-12-20",
    restaurant: "Pod Lipą",
    archived: false,
    guestData: { retentionDays: 30, deleteAfter: "2027-01-19", purgedAt: null },
  },
  guests: [
    {
      name: "Ania Żółć",
      absent: false,
      group: 1,
      diets: ["vegan", "nut-allergy"],
      dietNote: '=HYPERLINK("x")',
      rsvp: { attending: true, dish: "Pierogi; ruskie", byOrganizer: false, answeredAt: "2026-12-01T10:00:00Z" },
      seat: { room: "Sala", table: "Stół 1", seat: 3 },
      guess: { amountGrosze: 149_999, predictedPlace: 2 },
    },
    {
      name: "Bartek",
      absent: true,
      group: null,
      diets: [],
      dietNote: null,
      rsvp: { attending: false, dish: null, byOrganizer: true, answeredAt: null },
      seat: null,
      guess: null,
    },
  ],
  groups: [["Ania Żółć", "Celina"]],
  rsvp: { deadline: "2026-12-10T22:59:00Z", open: false, options: [] },
  venue: { rooms: [] },
  seating: null,
  orders: {
    lines: [
      {
        name: "Zupa",
        course: "soup",
        note: "bez soli\ni pieprzu",
        quantity: 2,
        unitPriceGrosze: 1550,
        totalGrosze: 3100,
        deliveredPieces: 1,
        place: { guest: "Ania Żółć" },
      },
      {
        name: "Deska",
        course: null,
        note: null,
        quantity: 1,
        unitPriceGrosze: 6000,
        totalGrosze: 6000,
        deliveredPieces: 0,
        place: { table: "Stół 1" },
      },
    ],
    drinks: [{ name: "Woda", quantity: 3, unitPriceGrosze: 900, totalGrosze: 2700 }],
    dishesGrosze: 9100,
    drinksGrosze: 2700,
    billGrosze: 11_800,
  },
  guesses: { intakeOpen: false, correctAmountGrosze: null },
  quiz: { questions: [], standings: [] },
};

function rowsOf(csv: string): string[] {
  expect(csv.startsWith(CSV_BOM)).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv.slice(CSV_BOM.length, -2).split("\r\n");
}

describe("export formats", () => {
  it("parses the format, json by default", () => {
    expect(parseExportFormat(null)).toBe("json");
    expect(parseExportFormat("")).toBe("json");
    expect(parseExportFormat("guests-csv")).toBe("guests-csv");
    expect(parseExportFormat("orders-csv")).toBe("orders-csv");
    expect(parseExportFormat("xlsx")).toBeNull();
    expect(parseExportFormat("JSON")).toBeNull();
  });

  it("names the files and the types", () => {
    expect(exportFileName(7, "2026-12-20", "json")).toBe("wydarzenie-7-2026-12-20.json");
    expect(exportFileName(7, "2026-12-20", "guests-csv")).toBe("wydarzenie-7-2026-12-20-goscie.csv");
    expect(exportFileName(7, "2026-12-20", "orders-csv")).toBe("wydarzenie-7-2026-12-20-zamowienia.csv");
    expect(exportContentType("json")).toBe("application/json; charset=utf-8");
    expect(exportContentType("orders-csv")).toBe("text/csv; charset=utf-8");
    expect(exportPath(7, "guests-csv")).toBe("/api/panel/events/7/export?format=guests-csv");
  });
});

describe("CSV cells", () => {
  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell("zwykły tekst")).toBe("zwykły tekst");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('powiedział "tak"')).toBe('"powiedział ""tak"""');
    expect(csvCell("linia\nlinia")).toBe('"linia\nlinia"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("disarms formulas typed by people", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${start}1+1`).includes(`'${start}1+1`)).toBe(true);
    }
    expect(csvCell("=SUM(A1;A2)")).toBe(`"'=SUM(A1;A2)"`);
    expect(csvCell("Ania = gość")).toBe("Ania = gość");
  });

  it("joins rows with CRLF after a BOM", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c", null],
      ]),
    ).toBe(`${CSV_BOM}a;b\r\nc;\r\n`);
  });
});

describe("guests CSV", () => {
  it("lists every guest with diets, the answer, the seat and the guess (PL)", () => {
    const csv = exportGuestsCsv(DATA, "pl");
    const lines = rowsOf(csv);
    expect(lines[0]).toBe(
      "Gość;Obecność;Grupa;Diety i alergie;Uwagi dla kuchni;Odpowiedź na zaproszenie;Wybrane danie;Odpowiedź wpisał;Sala;Stolik;Miejsce;Strzał (zł);Typ miejsca w rankingu",
    );
    expect(lines[1]).toBe(
      `Ania Żółć;obecny;1;wegańska, alergia na orzechy;"'=HYPERLINK(""x"")";przyjdzie;"Pierogi; ruskie";gość;Sala;Stół 1;3;1499,99;2`,
    );
    expect(lines[2]).toBe("Bartek;nieobecny;;;;nie przyjdzie;;organizator;;;;;");
    expect(lines).toHaveLength(3);
  });

  it("has English headers and words", () => {
    const lines = rowsOf(exportGuestsCsv(DATA, "en"));
    expect(lines[0]?.startsWith("Guest;Attendance;Group;Diets and allergies;")).toBe(true);
    expect(lines[1]).toContain("present;1;vegan, nut allergy;");
    expect(lines[2]).toContain("absent");
  });
});

describe("orders CSV", () => {
  it("lists the lines, the drinks and ends with the bill (PL)", () => {
    const lines = rowsOf(exportOrdersCsv(DATA, "pl"));
    expect(lines[0]).toBe("Rodzaj;Pozycja;Kurs;Uwagi;Ilość;Cena jednostkowa (zł);Wartość (zł);Wydane sztuki;Dla");
    // The note's line break (LF) stays inside its quoted cell; rows end with CRLF.
    expect(lines[1]).toBe('danie;Zupa;Zupy;"bez soli\ni pieprzu";2;15,50;31;1;Ania Żółć');
    expect(lines[2]).toBe("danie;Deska;;;1;60;60;0;środek stołu: Stół 1");
    expect(lines[3]).toBe("napój do rachunku;Woda;;;3;9;27;;");
    expect(lines.slice(-3)).toEqual(["Dania razem;;;;;;91;;", "Napoje razem;;;;;;27;;", "Rachunek razem;;;;;;118;;"]);
  });

  it("has English headers and totals", () => {
    const lines = rowsOf(exportOrdersCsv(DATA, "en"));
    expect(lines[0]).toBe("Kind;Item;Course;Notes;Quantity;Unit price (PLN);Amount (PLN);Pieces served;For");
    expect(lines.at(-1)).toBe("Bill total;;;;;;118;;");
  });
});
