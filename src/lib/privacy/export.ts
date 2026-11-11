import { courseLabel } from "@/lib/menu/rules";
import { dietMessages } from "@/lib/diets/messages";
import { formatAmountInput } from "@/lib/guesses/amount";
import type { Locale } from "@/lib/i18n/locale";
import type { EventExportDto } from "@/types";
import { exportMessages } from "./messages";

// The event export's files (privacy-retention, S-26): the format of a request, the file names and the two CSV files.
// Pure. CSV for spreadsheets set to Polish: `;` between cells, CRLF lines, a UTF-8 BOM (so Polish letters survive),
// cells quoted when needed, amounts like „1499,99”, and a guard against formula injection (a cell that would start a
// formula — = + - @, a tab or a CR — gets a leading apostrophe; guest names and notes are typed by people).

export const EXPORT_FORMATS = ["json", "guests-csv", "orders-csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// The query parameter `format`: missing = json; anything unknown → null (400).
export function parseExportFormat(value: string | null): ExportFormat | null {
  if (value === null || value === "") {
    return "json";
  }
  return (EXPORT_FORMATS as readonly string[]).includes(value) ? (value as ExportFormat) : null;
}

export function exportPath(eventId: number, format: ExportFormat): string {
  return `/api/panel/events/${String(eventId)}/export?format=${format}`;
}

// wydarzenie-<id>-<date>.json, …-goscie.csv, …-zamowienia.csv (ASCII only, safe in Content-Disposition).
export function exportFileName(eventId: number, date: string, format: ExportFormat): string {
  const base = `wydarzenie-${String(eventId)}-${date}`;
  switch (format) {
    case "json":
      return `${base}.json`;
    case "guests-csv":
      return `${base}-goscie.csv`;
    case "orders-csv":
      return `${base}-zamowienia.csv`;
  }
}

export function exportContentType(format: ExportFormat): string {
  return format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8";
}

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

// One cell: guarded against formulas, quoted when it holds a separator, a quote or a line break.
export function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const CSV_BOM = "﻿";

export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return CSV_BOM + rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function money(grosze: number): string {
  return formatAmountInput(grosze);
}

// One row per guest, in the export's order (Polish alphabetical).
export function exportGuestsCsv(data: EventExportDto, locale: Locale = "pl"): string {
  const t = exportMessages(locale);
  const diets = dietMessages(locale).labels;
  const rows = data.guests.map((guest) => [
    guest.name,
    guest.absent ? t.absent : t.present,
    guest.group,
    guest.diets.map((tag) => diets[tag]).join(", "),
    guest.dietNote,
    guest.rsvp ? (guest.rsvp.attending === null ? t.noAnswer : guest.rsvp.attending ? t.coming : t.notComing) : null,
    guest.rsvp?.dish ?? null,
    guest.rsvp ? (guest.rsvp.byOrganizer ? t.byOrganizer : guest.rsvp.answeredAt ? t.byGuest : null) : null,
    guest.seat?.room ?? null,
    guest.seat?.table ?? null,
    guest.seat?.seat ?? null,
    guest.guess ? money(guest.guess.amountGrosze) : null,
    guest.guess?.predictedPlace ?? null,
  ]);
  return toCsv([t.guestsHeader, ...rows]);
}

// The order lines, then the drinks on the bill, then the totals (dishes, drinks, the bill).
export function exportOrdersCsv(data: EventExportDto, locale: Locale = "pl"): string {
  const t = exportMessages(locale);
  const lines = data.orders.lines.map((line) => [
    t.dish,
    line.name,
    line.course ? courseLabel(line.course, locale) : null,
    line.note,
    line.quantity,
    money(line.unitPriceGrosze),
    money(line.totalGrosze),
    line.deliveredPieces,
    line.place ? ("guest" in line.place ? line.place.guest : t.tableMiddle(line.place.table)) : null,
  ]);
  const drinks = data.orders.drinks.map((drink) => [
    t.drink,
    drink.name,
    null,
    null,
    drink.quantity,
    money(drink.unitPriceGrosze),
    money(drink.totalGrosze),
    null,
    null,
  ]);
  const totals = [
    [t.dishesTotal, null, null, null, null, null, money(data.orders.dishesGrosze), null, null],
    [t.drinksTotal, null, null, null, null, null, money(data.orders.drinksGrosze), null, null],
    [t.billTotal, null, null, null, null, null, money(data.orders.billGrosze), null, null],
  ];
  return toCsv([t.ordersHeader, ...lines, ...drinks, ...totals]);
}
