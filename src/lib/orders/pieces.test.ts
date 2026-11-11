import { describe, expect, it } from "vitest";
import {
  deliveredCount,
  guestOrdersKey,
  isLineDelivered,
  isPieceDelivered,
  toGuestOrderLines,
  toPieceMarks,
} from "./pieces";
import { organizerPrepList } from "./prep";
import type { OrderItemDto } from "@/types";

// Delivered pieces (guest-delivered): counting, the organizer's marks and what a guest's phone gets.

const GUEST = 7;

describe("counting pieces", () => {
  it("counts only the pieces that exist and knows when a line is complete", () => {
    expect(deliveredCount({ quantity: 2, deliveredPieces: [2] })).toBe(1);
    expect(deliveredCount({ quantity: 2, deliveredPieces: [1, 2, 3] })).toBe(2);
    expect(isLineDelivered({ quantity: 2, deliveredPieces: [2] })).toBe(false);
    expect(isLineDelivered({ quantity: 2, deliveredPieces: [1, 2] })).toBe(true);
    expect(isPieceDelivered({ quantity: 2, deliveredPieces: [2] }, 2)).toBe(true);
    expect(isPieceDelivered({ quantity: 2, deliveredPieces: [2] }, 1)).toBe(false);
  });

  it("leaves only the undelivered pieces to serve on the prep list", () => {
    const line: OrderItemDto = {
      id: 1,
      name: "Rosół",
      course: null,
      note: null,
      quantity: 2,
      unitPriceGrosze: 1_000,
      guestId: null,
      tableId: null,
      delivered: false,
      deliveredPieces: [2],
      marks: [{ piece: 2, by: "guest", guestId: GUEST }],
    };
    expect(organizerPrepList([line])).toEqual([
      { course: null, name: "Rosół", quantity: 2, toServe: 1, notes: [], totalGrosze: 2_000 },
    ]);
  });

  it("maps DB rows to marks in piece order, a guest's id only on a guest's mark", () => {
    expect(
      toPieceMarks([
        { piece: 2, marked_by: "guest", guest_id: GUEST },
        { piece: 1, marked_by: "organizer", guest_id: null },
      ]),
    ).toEqual({
      marks: [
        { piece: 1, by: "organizer", guestId: null },
        { piece: 2, by: "guest", guestId: GUEST },
      ],
      deliveredPieces: [1, 2],
    });
  });
});

describe("toGuestOrderLines", () => {
  const raw = [
    {
      id: 11,
      name: "Schabowy",
      note: "bez cebuli",
      quantity: 3,
      own: true,
      pieces: [
        { piece: 1, markedBy: "guest", guestId: GUEST },
        { piece: 3, markedBy: "organizer", guestId: null },
      ],
    },
    {
      id: 12,
      name: "Woda",
      note: null,
      quantity: 1,
      own: false,
      pieces: [{ piece: 1, markedBy: "guest", guestId: 99 }],
    },
    {
      id: 13,
      name: "Chleb",
      note: null,
      quantity: 1,
      own: false,
      pieces: [{ piece: 1, markedBy: "guest", guestId: null }],
    },
  ];

  it("lists every piece with who marked it from the guest's point of view, never anyone's id", () => {
    const lines = toGuestOrderLines(raw, GUEST);
    expect(lines).toEqual([
      {
        lineId: 11,
        name: "Schabowy",
        note: "bez cebuli",
        quantity: 3,
        kind: "own",
        pieces: [
          { piece: 1, deliveredBy: "you" },
          { piece: 2, deliveredBy: null },
          { piece: 3, deliveredBy: "organizer" },
        ],
      },
      {
        lineId: 12,
        name: "Woda",
        note: null,
        quantity: 1,
        kind: "table",
        pieces: [{ piece: 1, deliveredBy: "guest" }],
      },
      // A deleted guest's mark is still a guest's.
      {
        lineId: 13,
        name: "Chleb",
        note: null,
        quantity: 1,
        kind: "table",
        pieces: [{ piece: 1, deliveredBy: "guest" }],
      },
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/guestId|99|price|Grosze/);
  });

  it("refuses an answer that breaks the contract", () => {
    expect(() => toGuestOrderLines(null, GUEST)).toThrow();
    expect(() => toGuestOrderLines([{ ...raw[0], quantity: 0 }], GUEST)).toThrow();
    expect(() => toGuestOrderLines([{ ...raw[0], pieces: [{ piece: "1" }] }], GUEST)).toThrow();
    expect(toGuestOrderLines([], GUEST)).toEqual([]);
  });

  it("gives a key that changes with any mark", () => {
    const lines = toGuestOrderLines(raw, GUEST);
    const other = toGuestOrderLines([{ ...raw[0], pieces: [] }, raw[1], raw[2]], GUEST);
    expect(guestOrdersKey(lines)).toBe(guestOrdersKey(toGuestOrderLines(raw, GUEST)));
    expect(guestOrdersKey(other)).not.toBe(guestOrdersKey(lines));
  });
});
