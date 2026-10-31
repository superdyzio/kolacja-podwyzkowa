import { useCallback, useSyncExternalStore } from "react";
import {
  OFFLINE_GUESSES_STORAGE_KEY,
  OFFLINE_SEATING_STORAGE_KEY,
  offlineEntry,
  offlineOwner,
  ownEntry,
  parseOfflineGuesses,
  parseOfflineSeating,
  serializeOfflineEntry,
  type OfflineGuessesEntry,
  type OfflineSeatingEntry,
} from "@/lib/offline/cache";
import type { GuessBoardDto, PublishedSeatingDto } from "@/types";
import { createLocalStore } from "./local-store";

// The organizer's offline memory (S-09) in this browser's localStorage, through the generic local store
// (local-store.ts): two fixed keys, untrusted storage, the in-page fallback when storage is blocked, other tabs' writes
// through the "storage" event. Readers see only the entries saved under their own organizer link (owner tag).

const seatingStore = createLocalStore<OfflineSeatingEntry | null>(parseOfflineSeating, serializeOfflineEntry);
const guessesStore = createLocalStore<OfflineGuessesEntry | null>(parseOfflineGuesses, serializeOfflineEntry);

export interface OfflineCache {
  seating: OfflineSeatingEntry | null;
  guesses: OfflineGuessesEntry | null;
}

// published null: nothing has been published yet (also worth remembering — the readout says so).
export function saveOfflineSeating(apiBase: string, published: PublishedSeatingDto | null, savedAt: string) {
  seatingStore.write(OFFLINE_SEATING_STORAGE_KEY, offlineEntry(apiBase, published, savedAt));
}

// When this page last saved the guesses part (ms), so a read that started before it cannot overwrite a fresher board.
let guessesSavedAtMs = 0;

// readStartedAtMs: when the request that brought the board started (default now = a board just confirmed); a board
// from a read that started before the last save is older than what is saved and is dropped.
export function saveOfflineGuesses(
  apiBase: string,
  board: GuessBoardDto,
  savedAt: string,
  readStartedAtMs: number = Date.now(),
) {
  if (readStartedAtMs < guessesSavedAtMs) {
    return;
  }
  guessesSavedAtMs = Date.now();
  guessesStore.write(OFFLINE_GUESSES_STORAGE_KEY, offlineEntry(apiBase, board, savedAt));
}

// Forgets what this organizer link saved (its key no longer opens anything); another link's entries stay.
export function clearOfflineCache(apiBase: string) {
  const owner = offlineOwner(apiBase);
  if (seatingStore.read(OFFLINE_SEATING_STORAGE_KEY)?.owner === owner) {
    seatingStore.write(OFFLINE_SEATING_STORAGE_KEY, null);
  }
  if (guessesStore.read(OFFLINE_GUESSES_STORAGE_KEY)?.owner === owner) {
    guessesStore.write(OFFLINE_GUESSES_STORAGE_KEY, null);
  }
}

// The last combined snapshot per organizer link, so a read is the same object until an entry changes.
const snapshots = new Map<string, OfflineCache>();

export function readOfflineCache(apiBase: string): OfflineCache {
  const owner = offlineOwner(apiBase);
  const seating = ownEntry(seatingStore.read(OFFLINE_SEATING_STORAGE_KEY), owner);
  const guesses = ownEntry(guessesStore.read(OFFLINE_GUESSES_STORAGE_KEY), owner);
  const previous = snapshots.get(apiBase);
  if (previous?.seating === seating && previous.guesses === guesses) {
    return previous;
  }
  const next = { seating, guesses };
  snapshots.set(apiBase, next);
  return next;
}

export function subscribeOfflineCache(listener: () => void): () => void {
  const stopSeating = seatingStore.subscribe(OFFLINE_SEATING_STORAGE_KEY, listener);
  const stopGuesses = guessesStore.subscribe(OFFLINE_GUESSES_STORAGE_KEY, listener);
  return () => {
    stopSeating();
    stopGuesses();
  };
}

// undefined in the server render and during hydration ("not read yet"), so no server HTML depends on storage.
export function useOfflineCache(apiBase: string): OfflineCache | undefined {
  const getSnapshot = useCallback(() => readOfflineCache(apiBase), [apiBase]);
  return useSyncExternalStore<OfflineCache | undefined>(subscribeOfflineCache, getSnapshot, () => undefined);
}
