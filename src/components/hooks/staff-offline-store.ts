import { useCallback, useSyncExternalStore } from "react";
import {
  STAFF_READOUT_AREAS,
  STAFF_READOUT_STORAGE_KEYS,
  isExpired,
  isStaffReadoutApiBase,
  liveStaffEntry,
  parseStaffOfflineEntry,
  serializeStaffOfflineEntry,
  staffOfflineEntry,
  type StaffOfflineEntry,
  type StaffReadoutArea,
  type StaffReadoutScope,
} from "@/lib/offline/staff";
import type { StaffReadoutDto } from "@/types";
import { createLocalStore } from "./local-store";

// The staff's offline copies (staff-offline-readout, S-27) in this browser's localStorage, through the generic local
// store (local-store.ts): ONE fixed key per area (kitchen tablet, staff floor, per-event waiter's floor), so a device
// keeps at most one event per area; untrusted storage, the in-page fallback when storage is blocked, other tabs' writes
// through the "storage" event. Readers see an entry only for their own scope (area + owner) and only before it expires
// (the end of the event's floor window): the diets in it never outlive the evening.

const store = createLocalStore<StaffOfflineEntry | null>(parseStaffOfflineEntry, serializeStaffOfflineEntry);

// Saves the copy of a live page's last confirmed state; only the three live API bases keep one (never the client's
// link or the panel's previews), and nothing once the scope has expired. True when it was saved.
export function saveStaffReadout(scope: StaffReadoutScope, data: StaffReadoutDto, savedAt: string): boolean {
  if (!isStaffReadoutApiBase(scope.area, scope.apiBase)) {
    return false;
  }
  const entry = staffOfflineEntry(scope, data, savedAt);
  if (entry === null) {
    return false;
  }
  store.write(STAFF_READOUT_STORAGE_KEYS[scope.area], entry);
  return true;
}

// Forgets the area's copy: only this owner's (a denied scope), or whatever is there (a logout clears the area).
export function clearStaffReadout(area: StaffReadoutArea, owner?: string) {
  const key = STAFF_READOUT_STORAGE_KEYS[area];
  const entry = store.read(key);
  if (owner === undefined || entry?.owner === owner) {
    store.write(key, null);
  }
}

function hasRawText(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null && raw !== "null";
  } catch {
    return false;
  }
}

// Removes every expired copy, and any text under the keys that is not a valid copy (an older version, damage): the hard
// expiry holds even for what this code cannot read.
export function sweepExpiredStaffReadouts(now: Date) {
  for (const area of STAFF_READOUT_AREAS) {
    const key = STAFF_READOUT_STORAGE_KEYS[area];
    const entry = store.read(key);
    if (entry ? isExpired(entry, now) : hasRawText(key)) {
      store.write(key, null);
    }
  }
}

export function readStaffReadout(
  scope: Pick<StaffReadoutScope, "area" | "owner">,
  now: Date = new Date(),
): StaffOfflineEntry | null {
  return liveStaffEntry(store.read(STAFF_READOUT_STORAGE_KEYS[scope.area]), scope, now);
}

// The scope's live copy; undefined in the server render and during hydration ("not read yet"), so no server HTML
// depends on storage.
export function useStaffReadoutEntry(
  scope: Pick<StaffReadoutScope, "area" | "owner">,
): StaffOfflineEntry | null | undefined {
  const { area, owner } = scope;
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(STAFF_READOUT_STORAGE_KEYS[area], listener),
    [area],
  );
  const getSnapshot = useCallback(() => readStaffReadout({ area, owner }), [area, owner]);
  return useSyncExternalStore<StaffOfflineEntry | null | undefined>(subscribe, getSnapshot, () => undefined);
}
