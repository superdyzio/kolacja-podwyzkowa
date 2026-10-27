import { describe, expect, it } from "vitest";
import { fractionStyle, planImagePath, pointToFraction } from "./pin";

const rect = { left: 100, top: 50, width: 800, height: 400 };

describe("pointToFraction", () => {
  it("measures from the top-left corner of the rendered image", () => {
    expect(pointToFraction(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(pointToFraction(900, 450, rect)).toEqual({ x: 1, y: 1 });
    expect(pointToFraction(500, 250, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("keeps 4 decimals", () => {
    expect(pointToFraction(101, 51, rect)).toEqual({ x: 0.0013, y: 0.0025 });
  });

  it("clamps clicks just outside the image", () => {
    expect(pointToFraction(90, 460, rect)).toEqual({ x: 0, y: 1 });
  });

  it("falls back to the centre for an image that is not laid out", () => {
    expect(pointToFraction(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("fractionStyle", () => {
  it("turns fractions into CSS percentages", () => {
    expect(fractionStyle({ x: 0.25, y: 1 })).toEqual({ left: "25%", top: "100%" });
  });
});

describe("planImagePath", () => {
  it("carries the version so a replaced plan gets a new URL", () => {
    expect(planImagePath("/api/o/abc", 1730000000000)).toBe("/api/o/abc/plan/image?v=1730000000000");
  });
});
