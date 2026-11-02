import { describe, expect, it } from "vitest";
import {
  EXAMPLE_NAMES,
  cornerPoint,
  formatChairPitch,
  fromPercent,
  moveOutline,
  nudgeTable,
  outlineFromCorners,
  previewSeats,
  resizeOutline,
  rotationTowards,
  snapRotation,
  stageToFraction,
  toPercent,
} from "./editor";

describe("stageToFraction", () => {
  it("maps a stage point to pin fractions and clamps it to the plan", () => {
    expect(stageToFraction({ x: 250, y: 250 }, 2)).toEqual({ x: 0.25, y: 0.5 });
    expect(stageToFraction({ x: -40, y: 900 }, 2)).toEqual({ x: 0, y: 1 });
    expect(stageToFraction({ x: 333.33333, y: 0 }, 2)).toEqual({ x: 0.3333, y: 0 });
  });
});

describe("rotation", () => {
  const centre = { x: 100, y: 100 };

  it("points the top of the table at the handle, clockwise from up", () => {
    expect(rotationTowards(centre, { x: 100, y: 0 }, false)).toBe(0);
    expect(rotationTowards(centre, { x: 200, y: 100 }, false)).toBe(90);
    expect(rotationTowards(centre, { x: 100, y: 200 }, false)).toBe(180);
    expect(rotationTowards(centre, { x: 0, y: 100 }, false)).toBe(270);
    expect(rotationTowards(centre, centre, false)).toBe(0);
  });

  it("snaps to 15° unless free", () => {
    // 20° clockwise from up.
    const angle = (20 * Math.PI) / 180;
    const point = { x: 100 + Math.sin(angle) * 50, y: 100 - Math.cos(angle) * 50 };
    expect(rotationTowards(centre, point, false)).toBe(15);
    expect(rotationTowards(centre, point, true)).toBe(20);
    expect(snapRotation(353)).toBe(0);
    expect(snapRotation(-8)).toBe(345);
  });
});

describe("outlines", () => {
  it("builds a normalized outline from two corners in any order", () => {
    expect(outlineFromCorners({ x: 0.6, y: 0.7 }, { x: 0.1, y: 0.2 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.5,
    });
    expect(outlineFromCorners({ x: -0.2, y: 0.5 }, { x: 0.3, y: 1.4 })).toEqual({
      x: 0,
      y: 0.5,
      width: 0.3,
      height: 0.5,
    });
  });

  it("treats a tiny drag as a click", () => {
    expect(outlineFromCorners({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.6 })).toBeNull();
  });

  it("moves an outline without leaving the plan", () => {
    const outline = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
    expect(moveOutline(outline, 0.2, 0.1)).toEqual({ x: 0.3, y: 0.2, width: 0.3, height: 0.2 });
    expect(moveOutline(outline, 0.9, -0.5)).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.2 });
  });

  it("resizes by one corner and keeps the opposite one", () => {
    const outline = { x: 0.1, y: 0.1, width: 0.3, height: 0.2 };
    expect(cornerPoint(outline, "se")).toEqual({ x: 0.4, y: 0.30000000000000004 });
    expect(resizeOutline(outline, "se", { x: 0.5, y: 0.5 })).toEqual({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 });
    // Dragged past the opposite corner: the rectangle flips and stays normalized.
    expect(resizeOutline(outline, "nw", { x: 0.6, y: 0.6 })).toEqual({ x: 0.4, y: 0.3, width: 0.2, height: 0.3 });
    // Collapsed: unchanged.
    expect(resizeOutline(outline, "ne", { x: 0.1, y: 0.3 })).toEqual(outline);
  });
});

describe("nudgeTable", () => {
  const geometry = { x: 0.5, y: 0.5, rotation: 0 };

  it("moves with arrows and rotates with brackets, Shift for the other step", () => {
    expect(nudgeTable(geometry, "ArrowRight", false)).toEqual({ x: 0.505, y: 0.5, rotation: 0 });
    expect(nudgeTable(geometry, "ArrowUp", true)).toEqual({ x: 0.5, y: 0.48, rotation: 0 });
    expect(nudgeTable(geometry, "[", false)).toEqual({ x: 0.5, y: 0.5, rotation: 345 });
    expect(nudgeTable(geometry, "}", true)).toEqual({ x: 0.5, y: 0.5, rotation: 1 });
    expect(nudgeTable({ x: 0, y: 1, rotation: 0 }, "ArrowLeft", true)).toEqual({ x: 0, y: 1, rotation: 0 });
    expect(nudgeTable(geometry, "a", false)).toBeNull();
  });
});

describe("percent fields", () => {
  it("round-trips fractions and refuses anything off the plan", () => {
    expect(toPercent(0.1234)).toBe("12.3");
    expect(fromPercent("12,5")).toBe(0.125);
    expect(fromPercent("100")).toBe(1);
    expect(fromPercent("")).toBeNull();
    expect(fromPercent("101")).toBeNull();
    expect(fromPercent("abc")).toBeNull();
    expect(formatChairPitch(0.035)).toBe("3,5%");
    expect(formatChairPitch(0.1)).toBe("10,0%");
  });
});

describe("previewSeats", () => {
  const tables = [
    { id: 1, seatCount: 3 },
    { id: 2, seatCount: 2 },
  ];

  it("shows who sits where in the working arrangement", () => {
    const seats = previewSeats(tables, [
      { tableId: 2, seat: 2, guestName: "Ola" },
      { tableId: 9, seat: 1, guestName: "Nikt" },
    ]);
    expect(seats.get(2)).toEqual([{ seat: 2, name: "Ola" }]);
    expect(seats.has(1)).toBe(false);
  });

  it("fills every chair with example names when nobody is seated", () => {
    const seats = previewSeats(tables, []);
    expect(seats.get(1)?.map((seat) => seat.name)).toEqual(EXAMPLE_NAMES.slice(0, 3));
    expect(seats.get(2)?.map((seat) => seat.seat)).toEqual([1, 2]);
  });
});
