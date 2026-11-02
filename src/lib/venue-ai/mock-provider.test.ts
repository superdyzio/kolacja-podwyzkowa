import { describe, expect, it } from "vitest";
import { createVenueVisionProvider } from "./config";
import { matchLayout } from "./match";
import { createMockLayoutProvider, mockLayout } from "./mock-provider";
import { buildLayoutPrompt } from "./prompt";
import { parseLayoutText } from "./schema";

const venue = {
  rooms: [{ name: "Sala A" }, { name: "Sala B" }],
  tables: [
    { name: "Stolik 1", shape: "round" as const, seatCount: 8, x: 0.1, y: 0.1, rotation: 0 },
    { name: "Długi", shape: "rectangular" as const, seatCount: 10, x: 0.2, y: 0.2, rotation: 0 },
    { name: "Okno", shape: "round" as const, seatCount: 6, x: 0.3, y: 0.3, rotation: 0 },
  ],
};

describe("mock layout provider", () => {
  it("answers with a deterministic, valid layout: every table, one new table, every room outlined", async () => {
    const text = mockLayout(venue);
    expect(mockLayout(venue)).toBe(text);
    const raw = parseLayoutText(text);
    expect(raw?.tables.map((table) => table.name)).toEqual(["Stolik 1", "Długi", "Okno", "Stolik 2"]);
    expect(raw?.tables.find((table) => table.name === "Długi")?.rotation).toBe(90);
    expect(raw?.rooms.map((room) => room.name)).toEqual(["Sala A", "Sala B"]);

    const provider = createMockLayoutProvider({ delayMs: 0 });
    expect(provider).toMatchObject({ kind: "mock", model: null, ready: true });
    const image = { mimeType: "image/png" as const, base64: "" };
    await expect(provider.readLayout({ image, venue }, { signal: new AbortController().signal })).resolves.toEqual({
      text,
      usage: null,
    });
  });

  it("matches back onto the venue as moves plus one new table", () => {
    const raw = parseLayoutText(mockLayout(venue));
    if (!raw) {
      throw new Error("mock layout did not parse");
    }
    const result = matchLayout(raw, {
      plan: { mimeType: "image/png", byteSize: 1, version: 1 },
      chairPitch: 0.035,
      rooms: [
        { id: 1, name: "Sala A", outline: null },
        { id: 2, name: "Sala B", outline: null },
      ],
      tables: venue.tables.map((table, index) => ({ ...table, id: index + 1, roomId: 1 })),
    });
    expect(result.updates).toHaveLength(3);
    expect(result.newTables).toMatchObject([{ name: "Stolik 2", roomId: 2 }]);
    expect(result.rooms).toHaveLength(2);
  });

  it("stops at the abort signal", async () => {
    const controller = new AbortController();
    const pending = createMockLayoutProvider({ delayMs: 10_000 }).readLayout(
      { image: { mimeType: "image/png", base64: "" }, venue },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "timeout" });
  });

  it("follows AI_PROVIDER: the mock by default, an unconfigured Claude fails without network", async () => {
    expect(createVenueVisionProvider({ kind: "mock" }).kind).toBe("mock");
    expect(
      createVenueVisionProvider({ kind: "anthropic", apiKey: "test-key-not-real", model: "claude-haiku-5-5" }),
    ).toMatchObject({
      kind: "anthropic",
      model: "claude-sonnet-5-5",
      ready: true,
    });
    const missing = createVenueVisionProvider({ kind: "anthropic", apiKey: null, model: "claude-haiku-5-5" });
    expect(missing.ready).toBe(false);
    await expect(
      missing.readLayout(
        { image: { mimeType: "image/png", base64: "" }, venue },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ kind: "not-configured" });
  });
});

describe("layout prompt", () => {
  it("names the rooms and tables with their positions, and nothing else", () => {
    const prompt = buildLayoutPrompt(venue);
    expect(prompt).toContain("- Sala B");
    expect(prompt).toContain("- Długi: rectangular, 10 seats, now at x=0.2 y=0.2, rotation 0°");
    expect(buildLayoutPrompt({ rooms: [], tables: [] })).toContain("Rooms:\n(none)");
  });
});
