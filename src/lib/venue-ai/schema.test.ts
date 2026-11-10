import { describe, expect, it } from "vitest";
import { parseLayoutText } from "./schema";

const table = { name: "Okno", room: "Sala A", shape: "round", seatCount: 8, x: 0.5, y: 0.5, rotation: 0 };

describe("parseLayoutText", () => {
  it("refuses what is not the expected JSON", () => {
    expect(parseLayoutText("Here is the layout: {")).toBeNull();
    expect(parseLayoutText(JSON.stringify({ tables: [] }))).toBeNull();
    expect(parseLayoutText("[]")).toBeNull();
  });

  it("keeps a valid answer as it is", () => {
    const layout = parseLayoutText(
      JSON.stringify({
        chairPitch: 0.042,
        rooms: [{ name: "Sala A", x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
        tables: [{ ...table, shape: "rectangular", rotation: 90 }],
      }),
    );
    expect(layout).toEqual({
      chairPitch: 0.042,
      rooms: [{ name: "Sala A", outline: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
      tables: [{ ...table, shape: "rectangular", rotation: 90 }],
    });
  });

  it("clamps every value into its range", () => {
    const layout = parseLayoutText(
      JSON.stringify({
        chairPitch: 3,
        rooms: [{ name: "  Sala   A ", x: -0.2, y: 0.9, width: 2, height: 0.5 }],
        tables: [
          { ...table, name: "  Bardzo długa nazwa stolika przy oknie  ", seatCount: 40, x: 1.3, y: -1 },
          { ...table, shape: "rectangular", seatCount: 0.6, rotation: -90.4 },
          { ...table, shape: "hexagon", rotation: 45 },
        ],
      }),
    );
    // Out of range → no scale proposed: the venue keeps its own.
    expect(layout?.chairPitch).toBeNull();
    expect(layout?.rooms).toEqual([{ name: "Sala A", outline: { x: 0, y: 0.9, width: 1, height: 0.1 } }]);
    expect(layout?.tables[0]).toMatchObject({ name: "Bardzo długa nazwa stoli", seatCount: 30, x: 1, y: 0 });
    expect(layout?.tables[1]).toMatchObject({ seatCount: 2, rotation: 270 });
    // An unknown shape reads as round, and a round table has no rotation.
    expect(layout?.tables[2]).toMatchObject({ shape: "round", rotation: 0 });
  });

  it("drops entries it cannot use, one by one", () => {
    const layout = parseLayoutText(
      JSON.stringify({
        chairPitch: "duże",
        rooms: [
          { name: "Sala A", x: 0.1, y: 0.1, width: 0, height: 0.3 },
          { name: "", x: 0.1, y: 0.1, width: 0.2, height: 0.3 },
          { name: "Sala B", x: 0.1, y: 0.1 },
        ],
        tables: [{ ...table, name: "   " }, { ...table, x: "lewo" }, table, null],
      }),
    );
    expect(layout).toEqual({ chairPitch: null, rooms: [], tables: [table] });
  });
});
