import { describe, expect, it } from "vitest";
import type { TableShape } from "@/types";
import {
  STAGE_WIDTH,
  boxesOverlap,
  chairPositions,
  fitTableFont,
  fromStage,
  labelBox,
  labelBoxes,
  stageHeight,
  tableBody,
  tableExtent,
  toStage,
  type Chair,
} from "./drawing";
import { oppositeSeat, sideALength, sideNeighbours } from "./seats";

const PITCH = 0.035;
const ASPECT = 2;

function table(shape: TableShape, seatCount: number, rotation = 0) {
  return { shape, seatCount, x: 0.5, y: 0.5, rotation };
}

function distance(a: Chair, b: Chair): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const centre = toStage(0.5, 0.5, ASPECT);

describe("stage units", () => {
  it("keeps the image's aspect ratio and maps back", () => {
    expect(stageHeight(2)).toBe(STAGE_WIDTH / 2);
    expect(toStage(0.25, 0.5, 2)).toEqual({ x: 250, y: 250 });
    expect(fromStage({ x: 250, y: 250 }, 2)).toEqual({ x: 0.25, y: 0.5 });
    // An unknown aspect falls back to 16:9.
    expect(stageHeight(0)).toBeCloseTo(562.5);
  });
});

describe("round tables", () => {
  it("puts seat 1 at the top and goes clockwise", () => {
    const chairs = chairPositions(table("round", 4), PITCH, ASPECT);
    expect(chairs.map((chair) => chair.seat)).toEqual([1, 2, 3, 4]);
    const [top, right, bottom, left] = chairs;
    expect(top.x).toBeCloseTo(centre.x);
    expect(top.y).toBeLessThan(centre.y);
    expect(right.x).toBeGreaterThan(centre.x);
    expect(right.y).toBeCloseTo(centre.y);
    expect(bottom.y).toBeGreaterThan(centre.y);
    expect(left.x).toBeLessThan(centre.x);
    expect(top.normalY).toBeCloseTo(-1);
    expect(right.normalX).toBeCloseTo(1);
  });

  it("grows with the seat count and keeps a minimum size", () => {
    const small = tableBody(table("round", 2), PITCH, ASPECT);
    const large = tableBody(table("round", 20), PITCH, ASPECT);
    expect(small.shape === "round" && large.shape === "round" && large.r > small.r).toBe(true);
    expect(small.shape === "round" && small.r).toBeGreaterThan(0);
  });

  it("stays circular on a non-square stage", () => {
    const chairs = chairPositions(table("round", 8), PITCH, ASPECT);
    const radii = chairs.map((chair) => Math.hypot(chair.x - centre.x, chair.y - centre.y));
    for (const radius of radii) {
      expect(radius).toBeCloseTo(radii[0]);
    }
  });
});

describe("rectangular tables", () => {
  it("puts side A on top left → right and side B below in the same direction", () => {
    const chairs = chairPositions(table("rectangular", 6), PITCH, ASPECT);
    const a = chairs.slice(0, 3);
    const b = chairs.slice(3);
    expect(a.every((chair) => chair.y < centre.y && chair.normalY === -1)).toBe(true);
    expect(b.every((chair) => chair.y > centre.y && chair.normalY === 1)).toBe(true);
    expect(a[0].x).toBeLessThan(a[1].x);
    expect(b[0].x).toBeLessThan(b[1].x);
    // Seat p faces seat a + p.
    for (let p = 0; p < 3; p++) {
      expect(b[p].x).toBeCloseTo(a[p].x);
    }
  });

  it("leaves the last seat of side A without an opposite chair for an odd count", () => {
    const chairs = chairPositions(table("rectangular", 5), PITCH, ASPECT);
    expect(chairs.slice(3).map((chair) => chair.x)).toEqual([chairs[0].x, chairs[1].x]);
    expect(chairs.some((chair, index) => index >= 3 && Math.abs(chair.x - chairs[2].x) < 1e-9)).toBe(false);
  });

  it("draws a table for two as two facing chairs", () => {
    const [one, two] = chairPositions(table("rectangular", 2), PITCH, ASPECT);
    expect(one.x).toBeCloseTo(two.x);
    expect(one.y).toBeLessThan(two.y);
  });
});

describe("rotation", () => {
  it("turns the top to the right at 90° (clockwise)", () => {
    const [top] = chairPositions(table("round", 4, 90), PITCH, ASPECT);
    expect(top.x).toBeGreaterThan(centre.x);
    expect(top.y).toBeCloseTo(centre.y);
    expect(top.normalX).toBeCloseTo(1);
    const rect = chairPositions(table("rectangular", 4, 90), PITCH, ASPECT);
    expect(rect[0].x).toBeGreaterThan(centre.x);
    expect(rect[2].x).toBeLessThan(centre.x);
  });
});

describe("chairs agree with the seat contract (seats.ts)", () => {
  it("places side neighbours next to each other and opposite seats across, for 2..20 seats", () => {
    for (const shape of ["round", "rectangular"] as const) {
      for (let n = 2; n <= 20; n++) {
        const chairs = chairPositions(table(shape, n, 30), PITCH, ASPECT);
        const bySeat = new Map(chairs.map((chair) => [chair.seat, chair]));
        // Seats 1 and 2 are side neighbours everywhere except at a rectangular table for two.
        const step = distance(chairs[0], chairs[1]);
        for (const chair of chairs) {
          for (const other of sideNeighbours(shape, n, chair.seat)) {
            const otherChair = bySeat.get(other);
            expect(otherChair && distance(chair, otherChair)).toBeCloseTo(step);
          }
          const opposite = oppositeSeat(shape, n, chair.seat);
          if (opposite !== null) {
            const otherChair = bySeat.get(opposite);
            // Facing: the line between them is the table's normal.
            expect(otherChair && Math.abs(otherChair.normalX + chair.normalX)).toBeLessThan(1e-9);
            const dx = (otherChair?.x ?? 0) - chair.x;
            const dy = (otherChair?.y ?? 0) - chair.y;
            expect(Math.abs(dx * chair.normalY - dy * chair.normalX)).toBeLessThan(1e-6);
          }
        }
        if (shape === "rectangular") {
          expect(chairs.filter((chair) => chair.normalY < 0 || chair.normalX > 0).length).toBe(sideALength(n));
        }
      }
    }
  });
});

describe("names", () => {
  const options = { offset: 10, lineHeight: 1.2 };

  it("centres a name above a top chair and starts it at a right chair", () => {
    const top: Chair = { seat: 1, x: 100, y: 100, normalX: 0, normalY: -1 };
    expect(labelBox(top, 10, 60, 12)).toEqual({ cx: 100, cy: 84, width: 60, height: 12 });
    const right: Chair = { seat: 2, x: 100, y: 100, normalX: 1, normalY: 0 };
    expect(labelBox(right, 10, 60, 12)).toEqual({ cx: 140, cy: 100, width: 60, height: 12 });
  });

  it("leaves empty chairs without a box", () => {
    const chairs = chairPositions(table("round", 4), PITCH, ASPECT);
    expect(labelBoxes(chairs, [3, 0, 3, 0], 10, false, options).map((box) => box !== null)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("keeps the largest font when short names fit", () => {
    const chairs = chairPositions(table("round", 6), PITCH, ASPECT);
    expect(
      fitTableFont(
        chairs,
        chairs.map(() => 1),
        20,
        8,
        options,
      ),
    ).toEqual({ font: 20, stagger: false });
  });

  it("shrinks (or staggers) long names at a dense side so they do not overlap, never below the minimum", () => {
    const chairs = chairPositions(table("rectangular", 12), PITCH, ASPECT);
    const widths = chairs.map(() => 4);
    const fitted = fitTableFont(chairs, widths, 20, 6, options);
    expect(fitted.font).toBeLessThan(20);
    const boxes = labelBoxes(chairs, widths, fitted.font, fitted.stagger, options).filter((box) => box !== null);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
      }
    }
    const impossible = fitTableFont(
      chairs,
      chairs.map(() => 100),
      20,
      6,
      options,
    );
    expect(impossible.font).toBe(6);
  });
});

describe("tableExtent", () => {
  it("covers the body and every chair", () => {
    const extent = tableExtent(table("rectangular", 8, 45), PITCH, ASPECT);
    for (const chair of chairPositions(table("rectangular", 8, 45), PITCH, ASPECT)) {
      expect(chair.x).toBeGreaterThan(extent.left);
      expect(chair.x).toBeLessThan(extent.right);
      expect(chair.y).toBeGreaterThan(extent.top);
      expect(chair.y).toBeLessThan(extent.bottom);
    }
  });
});
