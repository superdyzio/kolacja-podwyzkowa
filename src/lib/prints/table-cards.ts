import type { PublishedSeatingDto, TableCardDto } from "@/types";
import { boardShowsRooms } from "./board";
import { fitFontPt } from "./fit";
import type { TableCardFormat } from "./options";

// Table cards (room-prints, S-24; FR-038), pure: one card per published table — empty tables too (a table is set
// before anyone sits at it) — in the published order (room, then table name), with the names seated there in seat
// order for the `names=1` variant. A `tent` sheet holds one table (folded: both faces show it), a `flat` sheet two.

export function tableCards(published: PublishedSeatingDto | null): TableCardDto[] {
  if (!published) {
    return [];
  }
  const rooms = boardShowsRooms(published);
  return published.tables.map((table) => ({
    name: table.name,
    room: rooms ? table.room : null,
    guests: [...table.seats].sort((a, b) => a.seat - b.seat).map((seat) => seat.name),
  }));
}

export const TABLE_CARDS_PER_SHEET: Record<TableCardFormat, number> = { tent: 1, flat: 2 };

export function tableCardSheets(cards: readonly TableCardDto[], format: TableCardFormat): TableCardDto[][] {
  const perSheet = TABLE_CARDS_PER_SHEET[format];
  const sheets: TableCardDto[][] = [];
  for (let index = 0; index < cards.length; index += perSheet) {
    sheets.push(cards.slice(index, index + perSheet));
  }
  return sheets;
}

// The table's name as large as a 210 × 148.5 mm face allows (smaller when the names share the face).
export function tableNameSizePt(name: string, withNames: boolean): number {
  return withNames ? fitFontPt(name, 72, 28, 12) : fitFontPt(name, 110, 32, 8);
}
