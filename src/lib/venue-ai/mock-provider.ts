import { AiProviderError } from "@/lib/ai-topics/provider";
import { nextTableName } from "@/lib/venue/rules";
import type { VenuePromptInput, VenueVisionProvider } from "./provider";

// The default layout provider (venue-drawing): no network, no cost. It ignores the image and answers, after a short
// delay, with a deterministic layout of the venue it was given: rooms side by side, each room's tables on a grid,
// rectangular tables turned 90°, and one new round table — enough for the editor and the smoke to exercise every kind
// of proposal line.

export interface MockLayoutOptions {
  delayMs?: number;
}

const MOCK_DELAY_MS = 300;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AiProviderError("timeout"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiProviderError("timeout"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

// The table rows of a VenuePromptInput carry no room; the mock spreads them over the rooms in order.
export function mockLayout(venue: VenuePromptInput): string {
  const roomNames = venue.rooms.map((room) => room.name);
  const columns = Math.max(1, roomNames.length);
  const width = 1 / columns;
  const rooms = roomNames.map((name, index) => ({
    name,
    x: round(index * width + 0.01),
    y: 0.05,
    width: round(width - 0.02),
    height: 0.9,
  }));
  const perRoom = Math.max(1, Math.ceil((venue.tables.length + 1) / columns));
  const names = venue.tables.map((table) => table.name);
  const all = [
    ...venue.tables,
    { name: nextTableName(names), shape: "round" as const, seatCount: 6, x: 0, y: 0, rotation: 0 },
  ];
  const tables = all.map((table, index) => {
    const room = Math.min(columns - 1, Math.floor(index / perRoom));
    const slot = index - room * perRoom;
    const across = Math.max(1, Math.ceil(Math.sqrt(perRoom)));
    const down = Math.max(1, Math.ceil(perRoom / across));
    return {
      name: table.name,
      room: roomNames[room] ?? "",
      shape: table.shape,
      seatCount: table.seatCount,
      x: round(room * width + (width * ((slot % across) + 0.5)) / across),
      y: round(0.1 + (0.8 * (Math.floor(slot / across) + 0.5)) / down),
      rotation: table.shape === "rectangular" ? 90 : 0,
    };
  });
  return JSON.stringify({ chairPitch: 0.03, rooms, tables });
}

export function createMockLayoutProvider(options: MockLayoutOptions = {}): VenueVisionProvider {
  const delayMs = options.delayMs ?? MOCK_DELAY_MS;
  return {
    kind: "mock",
    model: null,
    ready: true,
    async readLayout({ venue }, { signal }) {
      await wait(delayMs, signal);
      return { text: mockLayout(venue), usage: null };
    },
  };
}
