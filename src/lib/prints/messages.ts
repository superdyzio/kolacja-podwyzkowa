import { defineMessages } from "@/lib/i18n/locale";
import { pluralEn, pluralPl } from "@/lib/i18n/plural";
import type { BoardFormat, PlaceCardFormat, PrintKind, TableCardFormat } from "./options";

// Texts of the room prints (room-prints, S-24; FR-038), both languages (i18n): the prints' names and descriptions, the
// hub, the shell card, the panel's section, the floors' link, the screen toolbar, the notes and the printed sheets.
// Guest, table and room names are DB content and never translated.

export const printMessages = defineMessages(
  {
    kinds: {
      tablica: "Tablica „Znajdź swój stolik”",
      "karty-stolow": "Karty stołów",
      winietki: "Winietki",
      "lista-obslugi": "Lista dla obsługi",
    } satisfies Record<PrintKind, string>,
    descriptions: {
      tablica: "Goście alfabetycznie z numerem stolika i salą — na wejście. A4 albo plakat A3.",
      "karty-stolow": "Nazwa stolika dużymi literami, opcjonalnie z nazwiskami osób przy nim.",
      winietki: "Imię gościa na jego miejsce: składane lub płaskie, kilka na arkuszu A4 z liniami cięcia.",
      "lista-obslugi": "Dla kuchni i kelnerów: przy każdym stoliku miejsce, gość, dieta i uwagi.",
    } satisfies Record<PrintKind, string>,
    boardFormats: { a4: "A4", a3: "Plakat A3" } satisfies Record<BoardFormat, string>,
    tableCardFormats: {
      tent: "Składana (1 na A4)",
      flat: "Płaska (2 na A4)",
    } satisfies Record<TableCardFormat, string>,
    placeCardFormats: {
      "tent-90x45": "Składana 9 × 4,5 cm (6 na A4)",
      "tent-95x70": "Składana 9,5 × 7 cm (4 na A4)",
      "flat-90x50": "Płaska 9 × 5 cm (10 na A4)",
    } satisfies Record<PlaceCardFormat, string>,
    namesOn: "Z nazwiskami",
    namesOff: "Bez nazwisk",
    // The hub (/o/<key>/wydruki), the shell card and the panel's section.
    hubTitle: "Wydruki dla sali",
    hubIntro:
      "Wszystkie wydruki pokazują opublikowane rozsadzenie — to, które widzą TV i goście. Diety są tylko na liście dla obsługi.",
    shellCardText: "Tablica „Znajdź swój stolik”, karty stołów, winietki i lista dla obsługi z dietami.",
    panelIntro:
      "Tablica „Znajdź swój stolik”, karty stołów, winietki i lista dla obsługi z dietami — z opublikowanego rozsadzenia.",
    formatsLabel: "Formaty:",
    open: "Otwórz",
    qrCardsTitle: "Karteczki z kodami QR",
    qrCardsText: "Osobisty link każdego gościa (na stronie linków gości).",
    backToShell: "← Wróć do wydarzenia",
    floorLink: "Lista dla obsługi do druku",
    // The screen toolbar of a print page.
    backToPrints: "← Wydruki dla sali",
    backToEvent: "← Karta wydarzenia",
    backToFloor: "← Wróć na salę",
    pageTitle: (print: string, event: string) => `${print} · ${event}`,
    print: "Drukuj",
    printHint:
      "Drukuj w skali 100 %, bez marginesów i bez nagłówków i stopek przeglądarki. Linia przerywana — cięcie, kropkowana — zgięcie.",
    formatLegend: "Format",
    namesLegend: "Nazwiska przy stolikach",
    languageLegend: "Język wydruku",
    publishedAt: (when: string) => `Opublikowane rozsadzenie z ${when}.`,
    // Notes (screen only).
    unpublished:
      "Rozsadzenie zmieniło się od ostatniej publikacji. Wydruk pokazuje opublikowaną wersję — tę, którą widzą TV i goście. Opublikuj zmiany, żeby je wydrukować.",
    toSeating: "Przejdź do rozsadzenia",
    notPublished: "Rozsadzenie nie jest jeszcze opublikowane. Wydruki pokażą gości po pierwszej publikacji.",
    purged: "Dane gości tego wydarzenia zostały usunięte po terminie przechowywania — nie ma czego drukować.",
    nobody: "Nikt nie siedzi przy stoliku w opublikowanym rozsadzeniu.",
    noTables: "Opublikowane rozsadzenie nie ma stolików.",
    // The sheets.
    boardTitle: "Znajdź swój stolik",
    boardGuest: "Gość",
    boardTable: "Stolik",
    continued: "(cd.)",
    pageOf: (page: number, total: number) => `Strona ${String(page)} z ${String(total)}`,
    sheetLabel: (page: number, total: number) => `Arkusz ${String(page)} z ${String(total)}`,
    people: (count: number) => `${String(count)} ${pluralPl(count, "osoba", "osoby", "osób")}`,
    staffTitle: "Lista dla obsługi",
    staffIntro: "Tylko dla kuchni i obsługi — diety i alergie gości przy ich miejscach.",
    staffSeat: "Miejsce",
    staffGuest: "Gość",
    staffDiet: "Dieta i uwagi",
    staffSummary: "Diety i alergie",
    staffWithDiets: (count: number) =>
      `${String(count)} ${pluralPl(count, "gość ma", "gości ma", "gości ma")} dietę lub uwagi`,
    staffNoDiets: "Nikt nie ma diety ani uwag.",
    staffUnplaced: "Z dietą, ale bez miejsca na planie",
    tableCount: (label: string, count: number) => `${label}: ${String(count)}`,
  },
  {
    kinds: {
      tablica: "“Find your table” board",
      "karty-stolow": "Table cards",
      winietki: "Place cards",
      "lista-obslugi": "Staff list",
    },
    descriptions: {
      tablica: "Guests in alphabetical order with their table and room — for the entrance. A4 or an A3 poster.",
      "karty-stolow": "The table's name in large letters, optionally with the names of the people at it.",
      winietki: "Each guest's name for their seat: folded or flat, several per A4 sheet with cut lines.",
      "lista-obslugi": "For the kitchen and the waiters: per table the seat, the guest, the diet and notes.",
    },
    boardFormats: { a4: "A4", a3: "A3 poster" },
    tableCardFormats: { tent: "Folded (1 per A4)", flat: "Flat (2 per A4)" },
    placeCardFormats: {
      "tent-90x45": "Folded 9 × 4.5 cm (6 per A4)",
      "tent-95x70": "Folded 9.5 × 7 cm (4 per A4)",
      "flat-90x50": "Flat 9 × 5 cm (10 per A4)",
    },
    namesOn: "With names",
    namesOff: "Without names",
    hubTitle: "Room prints",
    hubIntro:
      "Every print shows the published seating — the one the TV and the guests see. Diets appear only on the staff list.",
    shellCardText: "The “Find your table” board, table cards, place cards and the staff list with diets.",
    panelIntro:
      "The “Find your table” board, table cards, place cards and the staff list with diets — from the published seating.",
    formatsLabel: "Formats:",
    open: "Open",
    qrCardsTitle: "QR code cards",
    qrCardsText: "Each guest's personal link (on the guest links page).",
    backToShell: "← Back to the event",
    floorLink: "Print the staff list",
    backToPrints: "← Room prints",
    backToEvent: "← Event card",
    backToFloor: "← Back to the floor",
    pageTitle: (print: string, event: string) => `${print} · ${event}`,
    print: "Print",
    printHint:
      "Print at 100 % scale, without margins and without the browser's headers and footers. Dashed line — cut, dotted line — fold.",
    formatLegend: "Format",
    namesLegend: "Names at the tables",
    languageLegend: "Print language",
    publishedAt: (when: string) => `Published seating of ${when}.`,
    unpublished:
      "The seating has changed since the last publish. The print shows the published version — the one the TV and the guests see. Publish the changes to print them.",
    toSeating: "Go to the seating",
    notPublished: "The seating has not been published yet. The prints will show the guests after the first publish.",
    purged: "This event's guest data was deleted after the retention period — there is nothing to print.",
    nobody: "Nobody sits at a table in the published seating.",
    noTables: "The published seating has no tables.",
    boardTitle: "Find your table",
    boardGuest: "Guest",
    boardTable: "Table",
    continued: "(cont.)",
    pageOf: (page: number, total: number) => `Page ${String(page)} of ${String(total)}`,
    sheetLabel: (page: number, total: number) => `Sheet ${String(page)} of ${String(total)}`,
    people: (count: number) => `${String(count)} ${pluralEn(count, "person", "people")}`,
    staffTitle: "Staff list",
    staffIntro: "For the kitchen and the staff only — the guests' diets and allergies at their seats.",
    staffSeat: "Seat",
    staffGuest: "Guest",
    staffDiet: "Diet and notes",
    staffSummary: "Diets and allergies",
    staffWithDiets: (count: number) =>
      `${String(count)} ${pluralEn(count, "guest has", "guests have")} a diet or notes`,
    staffNoDiets: "Nobody has a diet or notes.",
    staffUnplaced: "With a diet but no seat on the plan",
    tableCount: (label: string, count: number) => `${label}: ${String(count)}`,
  },
);
