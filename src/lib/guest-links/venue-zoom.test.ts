import { describe, expect, it } from "vitest";
import { READABLE_NAME_PX, VENUE_ZOOM_STEPS, initialVenueZoom, medianHeight, stepVenueZoom } from "./venue-zoom";

describe("initialVenueZoom", () => {
  it("picks the smallest step that makes the names readable", () => {
    expect(initialVenueZoom(READABLE_NAME_PX)).toBe(1);
    expect(initialVenueZoom(9)).toBe(1.5);
    expect(initialVenueZoom(5)).toBe(3);
    expect(initialVenueZoom(4)).toBe(4);
  });

  it("stops at the largest step for tiny names and falls back to 2× when nothing was measured", () => {
    expect(initialVenueZoom(0.5)).toBe(VENUE_ZOOM_STEPS[VENUE_ZOOM_STEPS.length - 1]);
    expect(initialVenueZoom(0)).toBe(2);
    expect(initialVenueZoom(Number.NaN)).toBe(2);
  });
});

describe("stepVenueZoom", () => {
  it("moves one step and stays within the steps", () => {
    expect(stepVenueZoom(1, 1)).toBe(1.5);
    expect(stepVenueZoom(3, -1)).toBe(2);
    expect(stepVenueZoom(6, 1)).toBe(8);
    expect(stepVenueZoom(8, 1)).toBe(8);
    expect(stepVenueZoom(1, -1)).toBe(1);
    expect(stepVenueZoom(2.5, 1)).toBe(3);
    expect(stepVenueZoom(2.5, -1)).toBe(2);
  });
});

describe("medianHeight", () => {
  it("ignores empty measurements", () => {
    expect(medianHeight([])).toBe(0);
    expect(medianHeight([0, 10, 4, 6])).toBe(6);
    expect(medianHeight([5, Number.NaN, 7])).toBe(7);
  });
});
