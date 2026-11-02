import { describe, expect, it } from "vitest";
import { containBox, type Size } from "./tv-layout";

const SCREEN: Size = { width: 1920, height: 1080 };

describe("containBox", () => {
  it("fits a wide image to the width and centres it vertically", () => {
    expect(containBox({ width: 2000, height: 1000 }, SCREEN)).toEqual({ left: 0, top: 60, width: 1920, height: 960 });
  });

  it("fits a tall image to the height, scaling a small image up", () => {
    expect(containBox({ width: 300, height: 400 }, SCREEN)).toEqual({ left: 555, top: 0, width: 810, height: 1080 });
  });

  it("gives the whole viewport for unknown sizes", () => {
    expect(containBox({ width: 0, height: 0 }, SCREEN)).toEqual({ left: 0, top: 0, width: 1920, height: 1080 });
  });
});
