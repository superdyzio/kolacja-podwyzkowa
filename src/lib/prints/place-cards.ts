import type { PlaceCardDto, PlaceCardLayoutDto, PublishedSeatingDto } from "@/types";
import { boardShowsRooms } from "./board";
import { fitFontPt } from "./fit";
import { A4, PLACE_CARD_SIZES, type PlaceCardFormat } from "./options";

// Place cards („winietki”; room-prints, S-24; FR-038), pure: one card per published seat, in the order they are laid
// out on the tables (room, table, seat), and the sheet math — as many pieces of the format as fit on an A4 page inside
// PLACE_SHEET_MARGIN_MM on every side (printers cannot print at the very edge), the grid centred so the cut lines are
// symmetric. A folded card is printed twice as tall: the upper face turned 180°, a fold line in the middle.

export const PLACE_SHEET_MARGIN_MM = 8;

export function placeCards(published: PublishedSeatingDto | null): PlaceCardDto[] {
  if (!published) {
    return [];
  }
  const rooms = boardShowsRooms(published);
  return published.tables.flatMap((table) =>
    [...table.seats]
      .sort((a, b) => a.seat - b.seat)
      .map((seat) => ({ name: seat.name, table: table.name, room: rooms ? table.room : null })),
  );
}

export function placeCardLayout(format: PlaceCardFormat): PlaceCardLayoutDto {
  const size = PLACE_CARD_SIZES[format];
  const pieceHeightMm = size.folded ? size.heightMm * 2 : size.heightMm;
  const columns = Math.floor((A4.widthMm - 2 * PLACE_SHEET_MARGIN_MM) / size.widthMm);
  const rows = Math.floor((A4.heightMm - 2 * PLACE_SHEET_MARGIN_MM) / pieceHeightMm);
  return {
    pageWidthMm: A4.widthMm,
    pageHeightMm: A4.heightMm,
    cardWidthMm: size.widthMm,
    cardHeightMm: size.heightMm,
    pieceHeightMm,
    folded: size.folded,
    columns,
    rows,
    perPage: columns * rows,
    offsetXMm: (A4.widthMm - columns * size.widthMm) / 2,
    offsetYMm: (A4.heightMm - rows * pieceHeightMm) / 2,
  };
}

export function placeCardSheets(cards: readonly PlaceCardDto[], layout: PlaceCardLayoutDto): PlaceCardDto[][] {
  const sheets: PlaceCardDto[][] = [];
  for (let index = 0; index < cards.length; index += layout.perPage) {
    sheets.push(cards.slice(index, index + layout.perPage));
  }
  return sheets;
}

// The guest's name on a face of the format (base size up to `chars` characters, then smaller, wrapping at the minimum).
const NAME_FONT: Record<PlaceCardFormat, { basePt: number; minPt: number; chars: number }> = {
  "tent-90x45": { basePt: 22, minPt: 11, chars: 15 },
  "tent-95x70": { basePt: 28, minPt: 13, chars: 13 },
  "flat-90x50": { basePt: 22, minPt: 11, chars: 15 },
};

export function placeNameSizePt(name: string, format: PlaceCardFormat): number {
  const font = NAME_FONT[format];
  return fitFontPt(name, font.basePt, font.minPt, font.chars);
}
