// Zoom of the whole-venue plan on the guest's phone (guest-venue-names), pure. The plan carries every guest's name at
// their chair, so on a phone it is drawn wider than the screen and scrolled; these steps and the readable-size rule
// pick how wide.

// Width of the plan as a multiple of the phone's column.
export const VENUE_ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3, 4, 6];

// A name drawn at least this tall (CSS pixels) reads comfortably on a phone.
export const READABLE_NAME_PX = 13;

// The first zoom: the smallest step at which the names (their median height at zoom 1, measured in the page) are
// readable; the largest step when even that is not enough; 2× when nothing could be measured (no names, no layout).
export function initialVenueZoom(nameHeightAtOne: number): number {
  if (!Number.isFinite(nameHeightAtOne) || nameHeightAtOne <= 0) {
    return 2;
  }
  return (
    VENUE_ZOOM_STEPS.find((step) => nameHeightAtOne * step >= READABLE_NAME_PX) ??
    VENUE_ZOOM_STEPS[VENUE_ZOOM_STEPS.length - 1]
  );
}

// The next step up (direction 1) or down (-1) from any zoom, staying within the steps.
export function stepVenueZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return VENUE_ZOOM_STEPS.find((step) => step > current) ?? VENUE_ZOOM_STEPS[VENUE_ZOOM_STEPS.length - 1];
  }
  return [...VENUE_ZOOM_STEPS].reverse().find((step) => step < current) ?? VENUE_ZOOM_STEPS[0];
}

// The median of the measured heights (0 for none), robust against a stray long or tiny label.
export function medianHeight(heights: readonly number[]): number {
  const usable = heights.filter((height) => Number.isFinite(height) && height > 0).sort((a, b) => a - b);
  return usable.length === 0 ? 0 : usable[Math.floor(usable.length / 2)];
}
