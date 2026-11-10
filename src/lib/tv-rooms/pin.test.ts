import { describe, expect, it } from "vitest";
import { parseRoomPin, resolveRoomPin, tvRoomPath } from "./pin";

describe("parseRoomPin", () => {
  it("cleans the query value like a room name", () => {
    expect(parseRoomPin("  Sala   główna ")).toBe("Sala główna");
    expect(parseRoomPin("<b>x</b>")).toBe("<b>x</b>");
  });

  it("refuses what cannot be a room name", () => {
    expect(parseRoomPin(null)).toBeNull();
    expect(parseRoomPin(undefined)).toBeNull();
    expect(parseRoomPin("   ")).toBeNull();
    expect(parseRoomPin("x".repeat(41))).toBeNull();
    expect(parseRoomPin("x".repeat(40))).toBe("x".repeat(40));
  });
});

describe("resolveRoomPin", () => {
  const rooms = ["Ogród", "Sala główna"];

  it("finds the room case-insensitively and answers its own spelling", () => {
    expect(resolveRoomPin("SALA GŁÓWNA", rooms)).toBe("Sala główna");
    expect(resolveRoomPin("ogród", rooms)).toBe("Ogród");
  });

  it("gives null for an unknown room or no pin", () => {
    expect(resolveRoomPin("Taras", rooms)).toBeNull();
    expect(resolveRoomPin(null, rooms)).toBeNull();
    expect(resolveRoomPin("<b>x</b>", rooms)).toBeNull();
  });
});

describe("tvRoomPath", () => {
  it("encodes the room name into the TV link", () => {
    expect(tvRoomPath("/tv/abc", "Sala główna")).toBe("/tv/abc?sala=Sala%20g%C5%82%C3%B3wna");
    expect(tvRoomPath("https://x.pl/tv/abc", "A&B")).toBe("https://x.pl/tv/abc?sala=A%26B");
  });
});
