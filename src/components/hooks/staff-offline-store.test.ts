import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STAFF_READOUT_STORAGE_KEYS,
  floorReadoutScope,
  staffReadoutFromView,
  tabletReadoutScope,
  waiterReadoutScope,
} from "@/lib/offline/staff";
import type { RestaurantViewDto } from "@/types";

// The staff's offline copies (staff-offline-readout, S-27) in Node with a stubbed window/localStorage: one slot per
// area, read only by its own scope and only before it expires, the sweep (expired and unreadable text), clearing by
// owner and by area, only the live API bases, blocked storage. The store keeps module state, so every test imports a
// fresh copy. 2026-11-14 is a Saturday; its floor window ends 2026-11-15 12:00 in Warsaw (11:00 UTC).

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_KEY = "BBBBBBBBBBBBBBBBBBBBBBBB";
const EVENT_DATE = "2026-11-14";
const SAVED_AT = "2026-11-14T20:34:00.000Z";
const DURING = new Date("2026-11-14T21:00:00.000Z");
const AFTER = new Date("2026-11-15T11:00:00.000Z");

const view: RestaurantViewDto = {
  version: "1",
  seating: { version: "1.0", planVersion: null, publishedAt: null, chairPitch: 0.035, rooms: [], tables: [] },
  prep: [{ course: null, name: "Pierogi", quantity: 2, toServe: 1, notes: [] }],
  placement: {
    tables: [],
    unplaced: [],
    unassigned: [{ name: "Pierogi", note: null, quantity: 2, delivered: false, deliveredPieces: [1] }],
  },
  totals: { quantity: 2, toServe: 1 },
  diets: { tables: [], unplaced: [], counts: [], guests: 0 },
  rsvp: null,
};
const data = staffReadoutFromView(view, null);

const tablet = tabletReadoutScope(KEY, EVENT_DATE);
const otherTablet = tabletReadoutScope(OTHER_KEY, EVENT_DATE);
const floor = floorReadoutScope(12, 5, EVENT_DATE);
const waiter = waiterReadoutScope(12, 3, EVENT_DATE, "2026-11-15T11:00:00.000Z");

let storage: Map<string, string>;
let blocked: boolean;

async function freshStore() {
  vi.resetModules();
  return import("./staff-offline-store");
}

beforeEach(() => {
  storage = new Map();
  blocked = false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (blocked) {
          throw new Error("SecurityError");
        }
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (blocked) {
          throw new Error("QuotaExceededError");
        }
        storage.set(key, value);
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("staff offline store", () => {
  it("saves one copy per area and reads it back only for its own scope", async () => {
    const store = await freshStore();
    expect(store.saveStaffReadout(tablet, data, SAVED_AT)).toBe(true);
    expect(store.saveStaffReadout(floor, data, SAVED_AT)).toBe(true);
    expect(store.saveStaffReadout(waiter, data, SAVED_AT)).toBe(true);
    expect(store.readStaffReadout(tablet, DURING)?.data).toEqual(data);
    expect(store.readStaffReadout(floor, DURING)?.savedAt).toBe(SAVED_AT);
    expect(store.readStaffReadout(waiter, DURING)?.area).toBe("waiter");
    expect(store.readStaffReadout(otherTablet, DURING)).toBeNull();
    expect(store.readStaffReadout(floorReadoutScope(12, 6, EVENT_DATE), DURING)).toBeNull();
    expect([...storage.keys()].sort()).toEqual(Object.values(STAFF_READOUT_STORAGE_KEYS).sort());
    for (const text of storage.values()) {
      expect(text).not.toContain(KEY);
    }
  });

  it("a second tablet link replaces the first one's copy", async () => {
    const store = await freshStore();
    store.saveStaffReadout(tablet, data, SAVED_AT);
    store.saveStaffReadout(otherTablet, data, SAVED_AT);
    expect(store.readStaffReadout(tablet, DURING)).toBeNull();
    expect(store.readStaffReadout(otherTablet, DURING)).not.toBeNull();
  });

  it("keeps nothing for other API bases or after the scope expired", async () => {
    const store = await freshStore();
    expect(store.saveStaffReadout({ ...floor, apiBase: "/api/panel/events/12/klient" }, data, SAVED_AT)).toBe(false);
    expect(store.saveStaffReadout({ ...tablet, apiBase: `/api/o/${KEY}` }, data, SAVED_AT)).toBe(false);
    expect(store.saveStaffReadout(tablet, data, AFTER.toISOString())).toBe(false);
    expect(storage.size).toBe(0);
  });

  it("a tablet opened before the event's day saves nothing and leaves another event's live copy alone", async () => {
    const store = await freshStore();
    const tomorrow = tabletReadoutScope(OTHER_KEY, "2026-11-15");
    expect(store.saveStaffReadout(tablet, data, SAVED_AT)).toBe(true);
    // The same device opens tomorrow's event's tablet link today: no save, today's copy stays.
    expect(store.saveStaffReadout(tomorrow, data, SAVED_AT)).toBe(false);
    store.sweepExpiredStaffReadouts(DURING);
    expect(store.readStaffReadout(tablet, DURING)?.savedAt).toBe(SAVED_AT);
    expect(store.readStaffReadout(tomorrow, DURING)).toBeNull();
    // From midnight of its day on it saves (and replaces the one tablet slot).
    expect(store.saveStaffReadout(tomorrow, data, tomorrow.startsAt)).toBe(true);
    expect(store.readStaffReadout(tomorrow, new Date(tomorrow.startsAt))).not.toBeNull();
  });

  it("never reads an expired copy, and the sweep removes it and any unreadable text", async () => {
    storage.set(STAFF_READOUT_STORAGE_KEYS.waiter, '{"v":0,"data":"diety"}');
    const store = await freshStore();
    store.saveStaffReadout(tablet, data, SAVED_AT);
    store.saveStaffReadout(floor, data, SAVED_AT);
    expect(store.readStaffReadout(tablet, AFTER)).toBeNull();
    store.sweepExpiredStaffReadouts(DURING);
    expect(storage.get(STAFF_READOUT_STORAGE_KEYS.tablet)).not.toBe("null");
    expect(storage.get(STAFF_READOUT_STORAGE_KEYS.waiter)).toBe("null");
    store.sweepExpiredStaffReadouts(AFTER);
    expect(storage.get(STAFF_READOUT_STORAGE_KEYS.tablet)).toBe("null");
    expect(storage.get(STAFF_READOUT_STORAGE_KEYS.floor)).toBe("null");
  });

  it("clears by owner (a denied scope) or the whole area (a logout)", async () => {
    const store = await freshStore();
    store.saveStaffReadout(tablet, data, SAVED_AT);
    store.clearStaffReadout("tablet", otherTablet.owner);
    expect(store.readStaffReadout(tablet, DURING)).not.toBeNull();
    store.clearStaffReadout("tablet", tablet.owner);
    expect(store.readStaffReadout(tablet, DURING)).toBeNull();
    store.saveStaffReadout(floor, data, SAVED_AT);
    store.saveStaffReadout(waiter, data, SAVED_AT);
    store.clearStaffReadout("floor");
    expect(store.readStaffReadout(floor, DURING)).toBeNull();
    expect(store.readStaffReadout(waiter, DURING)).not.toBeNull();
  });

  it("keeps the copy in the page when storage is blocked", async () => {
    blocked = true;
    const store = await freshStore();
    store.saveStaffReadout(floor, data, SAVED_AT);
    expect(store.readStaffReadout(floor, DURING)?.data).toEqual(data);
    expect(storage.size).toBe(0);
    store.sweepExpiredStaffReadouts(AFTER);
    expect(store.readStaffReadout(floor, DURING)).toBeNull();
  });
});
