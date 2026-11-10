import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_TV_SCREEN,
  TV_ROOM_DWELL_MS,
  keepRoomIndex,
  nextRoomIndex,
  type TvScreenSize,
} from "@/lib/tv-rooms/rotation";

// The TV's room view (tv-room-rotation, S-20): the window's size for the readability rule, and the rotation clock.

let cachedScreen: TvScreenSize = DEFAULT_TV_SCREEN;

function readScreen(): TvScreenSize {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width > 0 && height > 0 && (cachedScreen.width !== width || cachedScreen.height !== height)) {
    cachedScreen = { width, height };
  }
  return cachedScreen;
}

function subscribeScreen(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
  };
}

// The window's size; DEFAULT_TV_SCREEN (1080p) on the server and during hydration, so the first render matches.
export function useTvScreenSize(): TvScreenSize {
  return useSyncExternalStore(subscribeScreen, readScreen, () => DEFAULT_TV_SCREEN);
}

// The index of the room on the screen while the TV rotates through `rooms` (empty = not rotating). Each room stays
// TV_ROOM_DWELL_MS; a poll answering the same rooms changes nothing (the clock keeps running), and a new publish keeps
// the room on the screen when it is still there. Runs also under prefers-reduced-motion (only the fade is skipped).
export function useRoomRotation(rooms: readonly string[]): number {
  const [current, setCurrent] = useState<string | null>(null);
  const index = keepRoomIndex(current, rooms);
  const key = rooms.join("\n");
  const count = rooms.length;
  const next = count > 1 ? rooms[nextRoomIndex(index, count)] : null;

  useEffect(() => {
    if (next === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCurrent(next);
    }, TV_ROOM_DWELL_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [key, index, next]);

  return index;
}
