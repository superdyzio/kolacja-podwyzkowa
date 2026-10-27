import { describe, expect, it } from "vitest";
import type { TableDto, VenueDto } from "@/types";
import { formatVenueSummary, summarizeVenue } from "./summary";

function table(id: number, seatCount: number): TableDto {
  return { id, roomId: 1, name: `Stolik ${id}`, seatCount, shape: "round", x: 0.5, y: 0.5 };
}

describe("summarizeVenue", () => {
  it("counts rooms, tables and seats", () => {
    const venue: VenueDto = {
      plan: { mimeType: "image/png", byteSize: 100, version: 1 },
      rooms: [
        { id: 1, name: "Sala" },
        { id: 2, name: "Ogród" },
      ],
      tables: [table(1, 8), table(2, 6)],
    };
    expect(summarizeVenue(venue)).toEqual({ hasPlan: true, rooms: 2, tables: 2, seats: 14 });
  });
});

describe("formatVenueSummary", () => {
  it.each([
    [{ hasPlan: true, rooms: 3, tables: 7, seats: 52 }, "Plan wgrany · 3 sale · 7 stolików · 52 miejsca"],
    [{ hasPlan: false, rooms: 0, tables: 0, seats: 0 }, "Brak planu · 0 sal · 0 stolików · 0 miejsc"],
    [{ hasPlan: true, rooms: 1, tables: 1, seats: 1 }, "Plan wgrany · 1 sala · 1 stolik · 1 miejsce"],
    [{ hasPlan: true, rooms: 5, tables: 3, seats: 22 }, "Plan wgrany · 5 sal · 3 stoliki · 22 miejsca"],
    [{ hasPlan: true, rooms: 2, tables: 12, seats: 112 }, "Plan wgrany · 2 sale · 12 stolików · 112 miejsc"],
  ])("formats %j", (summary, text) => {
    expect(formatVenueSummary(summary)).toBe(text);
  });
});
