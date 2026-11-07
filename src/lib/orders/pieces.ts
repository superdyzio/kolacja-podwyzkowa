import type { GuestOrderLineDto, GuestPieceMarker, OrderPieceMarkDto } from "@/types";

// Delivered pieces (guest-delivered), pure. Every piece of an order line (1 … quantity) is marked on its own — by the
// organizer or by a guest on their phone — so the counts, the prep list, the restaurant and the serving highlight
// read the pieces, not the line. A line is delivered when all of its pieces are.

export interface PieceLine {
  quantity: number;
  deliveredPieces: readonly number[];
}

// The line's delivered pieces; none for an answer of a server older than guest-delivered (a browser that loaded the
// new page while an old instance still answers during a deploy), so the page keeps working instead of crashing.
export function deliveredPiecesOf(line: PieceLine): readonly number[] {
  const pieces: unknown = line.deliveredPieces;
  return Array.isArray(pieces) ? line.deliveredPieces : [];
}

// The delivered pieces that still exist (a mark above the quantity is never counted).
export function deliveredCount(line: PieceLine): number {
  return deliveredPiecesOf(line).filter((piece) => piece >= 1 && piece <= line.quantity).length;
}

// piece: 1-based.
export function isPieceDelivered(line: PieceLine, piece: number): boolean {
  return deliveredPiecesOf(line).includes(piece);
}

export function isLineDelivered(line: PieceLine): boolean {
  return deliveredCount(line) >= line.quantity;
}

export interface PieceMarkRow {
  piece: number;
  marked_by: string;
  guest_id: number | null;
}

// The DB rows of one line's marks → the DTO marks (ascending piece) and the delivered piece numbers.
export function toPieceMarks(rows: readonly PieceMarkRow[]): { marks: OrderPieceMarkDto[]; deliveredPieces: number[] } {
  const marks = rows
    .map((row) => ({
      piece: row.piece,
      by: row.marked_by === "guest" ? ("guest" as const) : ("organizer" as const),
      guestId: row.marked_by === "guest" ? row.guest_id : null,
    }))
    .sort((a, b) => a.piece - b.piece);
  return { marks, deliveredPieces: marks.map((mark) => mark.piece) };
}

// --- The guest's phone ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

// Who marked a piece, as the guest sees it: themselves, another guest (never named: the marker may sit elsewhere by
// now) or the organizer.
function markerFor(mark: Record<string, unknown>, guestId: number): GuestPieceMarker {
  if (mark.markedBy !== "guest") {
    return "organizer";
  }
  return mark.guestId === guestId ? "you" : "guest";
}

// The answer of the DB function guest_order_lines (JSON) → what the phone shows: every piece 1 … quantity in order,
// the marker ids mapped away. Anything malformed is an error (a DB contract break, not a user mistake).
export function toGuestOrderLines(raw: unknown, guestId: number): GuestOrderLineDto[] {
  if (!Array.isArray(raw)) {
    throw new Error("guest_order_lines: not an array");
  }
  return raw.map((line): GuestOrderLineDto => {
    if (
      !isRecord(line) ||
      !isPositiveInteger(line.id) ||
      typeof line.name !== "string" ||
      !(line.note === null || typeof line.note === "string") ||
      !isPositiveInteger(line.quantity) ||
      typeof line.own !== "boolean" ||
      !Array.isArray(line.pieces)
    ) {
      throw new Error("guest_order_lines: malformed line");
    }
    const marks = new Map<number, GuestPieceMarker>();
    for (const mark of line.pieces) {
      if (!isRecord(mark) || !isPositiveInteger(mark.piece)) {
        throw new Error("guest_order_lines: malformed piece");
      }
      marks.set(mark.piece, markerFor(mark, guestId));
    }
    const quantity = line.quantity;
    return {
      lineId: line.id,
      name: line.name,
      note: line.note,
      quantity,
      kind: line.own ? "own" : "table",
      pieces: Array.from({ length: quantity }, (_, index) => ({
        piece: index + 1,
        deliveredBy: marks.get(index + 1) ?? null,
      })),
    };
  });
}

// The part of the guest's polling token that changes with any line or mark the phone shows (fed to a hash).
export function guestOrdersKey(lines: readonly GuestOrderLineDto[]): string {
  return JSON.stringify(lines);
}
