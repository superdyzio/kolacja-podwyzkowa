import { parseDrawMemory, serializeDrawMemory, type DrawMemory } from "@/lib/questions/draw-memory";
import { createLocalStore } from "./local-store";

// The question draw memory (S-07) in this browser's localStorage, through the generic local store (local-store.ts):
// stable snapshots for useSyncExternalStore, untrusted storage, in-page fallback, "storage" events from other tabs.
const store = createLocalStore<DrawMemory>(parseDrawMemory, serializeDrawMemory);

export function readDrawMemory(key: string): DrawMemory {
  return store.read(key);
}

export function writeDrawMemory(key: string, memory: DrawMemory) {
  store.write(key, memory);
}

export function subscribeDrawMemory(key: string, listener: () => void): () => void {
  return store.subscribe(key, listener);
}
