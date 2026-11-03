import { describe, expect, it } from "vitest";
import type { TableDto, VenueLayoutProposalAnswerDto } from "@/types";
import {
  EMPTY_SELECTION,
  PITCH_KEY,
  applyBody,
  describeCost,
  describePitch,
  describeRoomOutline,
  describeUpdate,
  editNewTable,
  isEmptyBody,
  isValidEdit,
  newTableKey,
  proposalGhost,
  roomKey,
  toggleLine,
} from "./draft";

const outline = { x: 0.1, y: 0.1, width: 0.4, height: 0.5 };
const answer: VenueLayoutProposalAnswerDto = {
  costNanoUsd: 21_000_000,
  proposal: {
    chairPitch: 0.04,
    previousChairPitch: 0.035,
    skipped: 0,
    updates: [
      { tableId: 3, name: "Stolik 3", x: 0.5, y: 0.5, rotation: 90, previous: { x: 0.2, y: 0.2, rotation: 0 } },
      { tableId: 4, name: "Okno", x: 0.6, y: 0.6, rotation: 0, previous: { x: 0.6, y: 0.6, rotation: 15 } },
    ],
    newTables: [{ roomId: 1, name: "Okno 2", shape: "round", seatCount: 8, x: 0.8, y: 0.8, rotation: 0 }],
    rooms: [{ roomId: 1, name: "Sala A", outline, previous: null }],
  },
};
const tables: TableDto[] = [
  { id: 3, roomId: 1, name: "Stolik 3", seatCount: 10, shape: "rectangular", x: 0.2, y: 0.2, rotation: 0 },
  { id: 4, roomId: 1, name: "Okno", seatCount: 6, shape: "round", x: 0.6, y: 0.6, rotation: 15 },
];

describe("layout proposal review", () => {
  it("describes every line in Polish", () => {
    expect(describeUpdate(answer.proposal.updates[0])).toBe("Stolik 3: przesunięty, obrót 90°");
    expect(describeUpdate(answer.proposal.updates[1])).toBe("Okno: obrót 0°");
    expect(describeRoomOutline("Sala A", null)).toBe("Sala A: kontur");
    expect(describeRoomOutline("Sala A", outline)).toBe("Sala A: nowy kontur");
    expect(describePitch(answer)).toBe("Skala krzeseł: 3,5% → 4,0%");
    expect(describeCost(21_000_000)).toBe("Koszt odczytu: ≈ 0,0210\u00a0USD (nie wlicza się do kosztu tematów AI).");
    expect(describeCost(null)).toBe("Koszt odczytu nieznany.");
  });

  it("words the lines in English", () => {
    expect(describeUpdate(answer.proposal.updates[0], "en")).toBe("Stolik 3: moved, rotated 90°");
    expect(describeRoomOutline("Sala A", null, "en")).toBe("Sala A: outline");
    expect(describePitch(answer, "en")).toBe("Chair scale: 3.5% → 4.0%");
    expect(describeCost(null, "en")).toBe("Cost of the read unknown.");
    expect(describeCost(21_000_000, "en")).toMatch(
      /^Cost of the read: ≈ .*USD \(not counted in the AI topics' cost\)\.$/,
    );
  });

  it("sends every line by default", () => {
    expect(applyBody(answer, EMPTY_SELECTION)).toEqual({
      tables: [
        { id: 3, x: 0.5, y: 0.5, rotation: 90 },
        { id: 4, x: 0.6, y: 0.6, rotation: 0 },
      ],
      newTables: [{ roomId: 1, name: "Okno 2", shape: "round", seatCount: 8, x: 0.8, y: 0.8, rotation: 0 }],
      rooms: [{ id: 1, outline }],
      chairPitch: 0.04,
    });
  });

  it("leaves out unticked lines and sends the edits of new tables", () => {
    let selection = toggleLine(EMPTY_SELECTION, "u3");
    selection = toggleLine(selection, roomKey(1));
    selection = toggleLine(selection, PITCH_KEY);
    selection = editNewTable(selection, 0, { name: "Taras", roomId: 2, seatCount: 4 });
    const body = applyBody(answer, selection);
    expect(body.tables.map((table) => table.id)).toEqual([4]);
    expect(body.rooms).toEqual([]);
    expect(body.chairPitch).toBeNull();
    expect(body.newTables[0]).toMatchObject({ name: "Taras", roomId: 2, seatCount: 4, x: 0.8 });
    // Ticking again brings the line back.
    expect(applyBody(answer, toggleLine(selection, "u3")).tables).toHaveLength(2);

    const none = [newTableKey(0), "u4"].reduce(toggleLine, selection);
    expect(isEmptyBody(applyBody(answer, none))).toBe(true);
  });

  it("checks the new tables' edits", () => {
    expect(isValidEdit({ name: "Taras", roomId: 1, seatCount: 4 })).toBe(true);
    expect(isValidEdit({ name: " ", roomId: 1, seatCount: 4 })).toBe(false);
    expect(isValidEdit({ name: "Taras", roomId: 1, seatCount: 21 })).toBe(false);
  });

  it("draws the kept lines as a ghost: moved tables keep their shape and seats", () => {
    const ghost = proposalGhost(answer, toggleLine(EMPTY_SELECTION, "u4"), tables);
    expect(ghost.tables).toEqual([
      { shape: "rectangular", seatCount: 10, x: 0.5, y: 0.5, rotation: 90 },
      { shape: "round", seatCount: 8, x: 0.8, y: 0.8, rotation: 0 },
    ]);
    expect(ghost.rooms).toEqual([outline]);
  });
});
