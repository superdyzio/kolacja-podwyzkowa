// Geometry of the TV view (pure): where the plan image sits on the screen, and where each table card goes so the
// cards stay near their pins, inside the screen and off each other. Deterministic (same input → same output) and
// bounded (a fixed number of passes), so the TV never jitters or hangs.

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The largest box with the image's aspect ratio inside the viewport, centred ("contain", scaling up too). Unknown
// (zero) sizes give the whole viewport.
export function containBox(natural: Size, viewport: Size): Box {
  if (natural.width <= 0 || natural.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { left: 0, top: 0, width: Math.max(0, viewport.width), height: Math.max(0, viewport.height) };
  }
  const scale = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { left: (viewport.width - width) / 2, top: (viewport.height - height) / 2, width, height };
}

export interface CardInput {
  id: string;
  // The pin, in screen pixels.
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

// Top-left corner of a card, in screen pixels.
export interface CardPlacement {
  id: string;
  x: number;
  y: number;
}

export interface LayoutOptions {
  // Minimum space between two cards (px).
  gap?: number;
  iterations?: number;
}

// Overlaps below half a pixel count as none (floating-point leftovers after a push).
const EPSILON = 0.5;

interface Placed {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, max));
}

// Pushes a and b apart by `overlap` along one axis (half each, a towards the lower side when its centre is lower or
// level). Returns false when the bounds stop both cards (nothing moved).
function push(a: Placed, b: Placed, axis: "x" | "y", overlap: number, bounds: Size): boolean {
  const size = axis === "x" ? "width" : "height";
  const direction = a[axis] + a[size] / 2 <= b[axis] + b[size] / 2 ? 1 : -1;
  const nextA = clamp(a[axis] - (direction * overlap) / 2, bounds[size] - a[size]);
  const nextB = clamp(b[axis] + (direction * overlap) / 2, bounds[size] - b[size]);
  const moved = Math.abs(nextA - a[axis]) + Math.abs(nextB - b[axis]) > EPSILON / 2;
  a[axis] = nextA;
  b[axis] = nextB;
  return moved;
}

// Each card starts centred on its pin and clamped into the bounds; then a fixed number of passes push every
// overlapping pair apart along the axis where they overlap less (the other one when the screen edges block it), half
// each way, clamping after every push. Cards are processed in id order, so the result does not depend on the input
// order. Stops early once nothing overlaps; with more cards than the screen holds, the last pass is what you get.
export function layoutCards(cards: readonly CardInput[], bounds: Size, options: LayoutOptions = {}): CardPlacement[] {
  const gap = options.gap ?? 8;
  const iterations = options.iterations ?? 200;
  const placed: Placed[] = [...cards]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((card) => ({
      id: card.id,
      width: card.width,
      height: card.height,
      x: clamp(card.anchorX - card.width / 2, bounds.width - card.width),
      y: clamp(card.anchorY - card.height / 2, bounds.height - card.height),
    }));

  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap;
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap;
        if (overlapX <= EPSILON || overlapY <= EPSILON) {
          continue;
        }
        moved = true;
        // The axis of least overlap first; when the screen edges block it, the other one.
        const [first, second]: ["x" | "y", "x" | "y"] = overlapX <= overlapY ? ["x", "y"] : ["y", "x"];
        if (!push(a, b, first, first === "x" ? overlapX : overlapY, bounds)) {
          push(a, b, second, second === "x" ? overlapX : overlapY, bounds);
        }
      }
    }
    if (!moved) {
      break;
    }
  }
  return placed.map(({ id, x, y }) => ({ id, x, y }));
}
