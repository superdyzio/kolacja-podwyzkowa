// Room prints (room-prints, S-24; FR-038), pure: the four prints and their format choices. Formats are query
// parameters of the print page, read leniently — an unknown, empty or repeated-but-odd value falls back to the default
// (never a 400) — and written back canonically (defaults left out) for the toolbar's links.

export const PRINT_KINDS = ["tablica", "karty-stolow", "winietki", "lista-obslugi"] as const;
export type PrintKind = (typeof PRINT_KINDS)[number];

export function isPrintKind(value: unknown): value is PrintKind {
  return typeof value === "string" && (PRINT_KINDS as readonly string[]).includes(value);
}

// The paper of a sheet (mm, portrait).
export interface PaperSize {
  widthMm: number;
  heightMm: number;
  // The CSS `@page { size }` keyword.
  page: "A4" | "A3";
}

export const A4: PaperSize = { widthMm: 210, heightMm: 297, page: "A4" };
export const A3: PaperSize = { widthMm: 297, heightMm: 420, page: "A3" };

// „Znajdź swój stolik”: A4, or the same layout as an A3 poster (every size × √2, so the pagination is identical).
export const BOARD_FORMATS = ["a4", "a3"] as const;
export type BoardFormat = (typeof BOARD_FORMATS)[number];
export const BOARD_PAPER: Record<BoardFormat, { paper: PaperSize; scale: number }> = {
  a4: { paper: A4, scale: 1 },
  a3: { paper: A3, scale: Math.SQRT2 },
};

// Table cards: `tent` = one table per A4 sheet folded across the middle (two 210 × 148.5 faces, the top one turned
// 180° so the name reads from both sides of the table); `flat` = two tables per A4 sheet, cut across the middle.
export const TABLE_CARD_FORMATS = ["tent", "flat"] as const;
export type TableCardFormat = (typeof TABLE_CARD_FORMATS)[number];

// Place cards („winietki”): the size of the finished card; a folded one is printed twice as tall with a fold line.
export const PLACE_CARD_FORMATS = ["tent-90x45", "tent-95x70", "flat-90x50"] as const;
export type PlaceCardFormat = (typeof PLACE_CARD_FORMATS)[number];
export const PLACE_CARD_SIZES: Record<PlaceCardFormat, { widthMm: number; heightMm: number; folded: boolean }> = {
  "tent-90x45": { widthMm: 90, heightMm: 45, folded: true },
  "tent-95x70": { widthMm: 95, heightMm: 70, folded: true },
  "flat-90x50": { widthMm: 90, heightMm: 50, folded: false },
};

export type PrintOptions =
  | { kind: "tablica"; format: BoardFormat }
  | { kind: "karty-stolow"; format: TableCardFormat; names: boolean }
  | { kind: "winietki"; format: PlaceCardFormat }
  | { kind: "lista-obslugi" };

function pick<T extends string>(values: readonly T[], raw: string | null): T {
  return values.find((value) => value === raw) ?? values[0];
}

export function parsePrintOptions(kind: PrintKind, params: URLSearchParams): PrintOptions {
  const format = params.get("format");
  switch (kind) {
    case "tablica":
      return { kind, format: pick(BOARD_FORMATS, format) };
    case "karty-stolow":
      return { kind, format: pick(TABLE_CARD_FORMATS, format), names: params.get("names") === "1" };
    case "winietki":
      return { kind, format: pick(PLACE_CARD_FORMATS, format) };
    case "lista-obslugi":
      return { kind };
  }
}

// The options' format ("a4", "tent", …) or null for a print without one.
export function printFormat(options: PrintOptions): string | null {
  return options.kind === "lista-obslugi" ? null : options.format;
}

// The canonical query of the options ("" for the defaults), with `extra` parameters (e.g. lang) appended.
export function printQuery(options: PrintOptions, extra: Readonly<Record<string, string>> = {}): string {
  const params = new URLSearchParams();
  switch (options.kind) {
    case "tablica":
      if (options.format !== BOARD_FORMATS[0]) params.set("format", options.format);
      break;
    case "karty-stolow":
      if (options.format !== TABLE_CARD_FORMATS[0]) params.set("format", options.format);
      if (options.names) params.set("names", "1");
      break;
    case "winietki":
      if (options.format !== PLACE_CARD_FORMATS[0]) params.set("format", options.format);
      break;
    case "lista-obslugi":
      break;
  }
  for (const [name, value] of Object.entries(extra)) {
    params.set(name, value);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

// The paper a print uses (every print is A4 portrait except the A3 board poster).
export function printPaper(options: PrintOptions): PaperSize {
  return options.kind === "tablica" ? BOARD_PAPER[options.format].paper : A4;
}
