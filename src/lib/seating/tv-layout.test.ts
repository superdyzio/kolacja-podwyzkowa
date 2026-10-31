import { describe, expect, it } from "vitest";
import { containBox, layoutCards, type CardInput, type CardPlacement, type Size } from "./tv-layout";

const SCREEN: Size = { width: 1920, height: 1080 };

function overlappingPairs(cards: readonly CardInput[], placed: readonly CardPlacement[]): string[] {
  const size = new Map(cards.map((card) => [card.id, card]));
  const boxes = placed.map((p) => {
    const card = size.get(p.id);
    return { id: p.id, x: p.x, y: p.y, width: card?.width ?? 0, height: card?.height ?? 0 };
  });
  const pairs: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        pairs.push(`${a.id}/${b.id}`);
      }
    }
  }
  return pairs;
}

function outside(cards: readonly CardInput[], placed: readonly CardPlacement[], bounds: Size): string[] {
  const size = new Map(cards.map((card) => [card.id, card]));
  return placed
    .filter((p) => {
      const card = size.get(p.id);
      return !card || p.x < 0 || p.y < 0 || p.x + card.width > bounds.width || p.y + card.height > bounds.height;
    })
    .map((p) => p.id);
}

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

describe("layoutCards", () => {
  it("centres a single card on its pin", () => {
    expect(layoutCards([{ id: "a", anchorX: 500, anchorY: 400, width: 200, height: 100 }], SCREEN)).toEqual([
      { id: "a", x: 400, y: 350 },
    ]);
  });

  it("keeps a card whose pin is in a corner inside the screen", () => {
    expect(layoutCards([{ id: "a", anchorX: 1915, anchorY: 5, width: 300, height: 200 }], SCREEN)).toEqual([
      { id: "a", x: 1620, y: 0 },
    ]);
  });

  it("separates two cards on the same pin", () => {
    const cards = [
      { id: "a", anchorX: 960, anchorY: 540, width: 300, height: 200 },
      { id: "b", anchorX: 960, anchorY: 540, width: 300, height: 200 },
    ];
    const placed = layoutCards(cards, SCREEN);
    expect(overlappingPairs(cards, placed)).toEqual([]);
    expect(outside(cards, placed, SCREEN)).toEqual([]);
  });

  it("uses the other axis when the screen edges block the first one", () => {
    const cards = [
      { id: "a", anchorX: 900, anchorY: 500, width: 1200, height: 100 },
      { id: "b", anchorX: 1000, anchorY: 500, width: 1200, height: 100 },
    ];
    const placed = layoutCards(cards, SCREEN);
    expect(overlappingPairs(cards, placed)).toEqual([]);
    expect(outside(cards, placed, SCREEN)).toEqual([]);
  });

  // 7 tables in 3 rooms (two 10-seat rectangular tables), 40 names at 3vh on a 1920×1080 TV, pins clustered the way
  // a real plan clusters them. Card sizes are estimates of the rendered cards (title + one line per name).
  const line = 40.5;
  const padding = 17;
  const realistic: CardInput[] = [
    { id: "Stół A", anchorX: 0.42 * 1920, anchorY: 0.4 * 1080, width: 507, height: padding + line * 6 },
    { id: "Stół B", anchorX: 0.5 * 1920, anchorY: 0.55 * 1080, width: 507, height: padding + line * 6 },
    { id: "Okno 1", anchorX: 0.12 * 1920, anchorY: 0.3 * 1080, width: 256, height: padding + line * 5 },
    { id: "Okno 2", anchorX: 0.15 * 1920, anchorY: 0.45 * 1080, width: 256, height: padding + line * 5 },
    { id: "Bar 1", anchorX: 0.8 * 1920, anchorY: 0.3 * 1080, width: 256, height: padding + line * 5 },
    { id: "Bar 2", anchorX: 0.85 * 1920, anchorY: 0.4 * 1080, width: 256, height: padding + line * 5 },
    { id: "Bar 3", anchorX: 0.78 * 1920, anchorY: 0.5 * 1080, width: 256, height: padding + line * 5 },
  ];

  it("lays out a realistic evening inside the screen with no card covering another", () => {
    const placed = layoutCards(realistic, SCREEN, { gap: 10 });
    expect(overlappingPairs(realistic, placed)).toEqual([]);
    expect(outside(realistic, placed, SCREEN)).toEqual([]);
  });

  it("gives the same answer for the same cards in any order", () => {
    const placed = layoutCards(realistic, SCREEN, { gap: 10 });
    expect(layoutCards([...realistic].reverse(), SCREEN, { gap: 10 })).toEqual(placed);
    expect(layoutCards(realistic, SCREEN, { gap: 10 })).toEqual(placed);
  });
});
