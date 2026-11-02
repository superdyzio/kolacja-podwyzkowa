// Screen geometry (pure): where a box with an image's aspect ratio sits on the screen. The TV draws the venue as SVG
// since venue-drawing (src/components/venue-drawing/VenueDrawing.tsx); table cards and their layout are gone.

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
