import { roundFraction } from "./rules";

// Table pins on the plan image. A pin is stored as fractions x, y in [0, 1] of the rendered <img> box, measured
// from its top-left corner, so it lands on the same spot of the image at any size. Contract for every view that
// draws pins (organizer now, TV in S-03): the positioning wrapper is `relative` and sized by the <img> itself
// (e.g. `block w-full h-auto`), with no object-fit letterboxing, padding or border on the <img>.

export interface PinPosition {
  x: number;
  y: number;
}

export interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// A pointer position (client coordinates) on the rendered image → stored fractions (clamped, 4 decimals).
// A zero-size box (image not laid out yet) gives the centre.
export function pointToFraction(clientX: number, clientY: number, rect: BoxRect): PinPosition {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0.5, y: 0.5 };
  }
  return {
    x: roundFraction((clientX - rect.left) / rect.width),
    y: roundFraction((clientY - rect.top) / rect.height),
  };
}

// CSS for an absolutely positioned pin centre (combine with a -50%/-50% translate).
export function fractionStyle(position: PinPosition): { left: string; top: string } {
  return { left: `${position.x * 100}%`, top: `${position.y * 100}%` };
}

// URL of the plan image; the version changes with every upload, so a replaced plan gets a new URL.
export function planImagePath(apiBase: string, version: number): string {
  return `${apiBase}/plan/image?v=${version}`;
}
