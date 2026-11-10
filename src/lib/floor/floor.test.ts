import { describe, expect, it } from "vitest";
import { CLIENT_ROUTE_PATTERNS } from "@/lib/client-routes/match";
import { FLOOR_ROLES, FLOOR_ROUTES, floorRouteAllows, floorWindowEnd, isFloorOpen } from "./rules";
import { floorMessages } from "./messages";

// Fixed instants only (never the real clock). 2026-11-14 is a Saturday in CET (UTC+1).
const EVENT = "2026-11-14";

describe("isFloorOpen (the event window, Europe/Warsaw)", () => {
  it("opens at midnight of the event's day", () => {
    expect(isFloorOpen(EVENT, null, new Date("2026-11-13T22:59:59Z"))).toBe(false); // 23:59:59 the day before
    expect(isFloorOpen(EVENT, null, new Date("2026-11-13T23:00:00Z"))).toBe(true); // 00:00 on the day
  });

  it("stays open after midnight until noon of the next day", () => {
    expect(isFloorOpen(EVENT, null, new Date("2026-11-14T22:30:00Z"))).toBe(true); // 23:30
    expect(isFloorOpen(EVENT, null, new Date("2026-11-15T01:00:00Z"))).toBe(true); // 02:00 next day
    expect(isFloorOpen(EVENT, null, new Date("2026-11-15T10:59:59Z"))).toBe(true); // 11:59:59 next day
    expect(isFloorOpen(EVENT, null, new Date("2026-11-15T11:00:00Z"))).toBe(false); // 12:00 next day
  });

  it("is closed for tomorrow's and older events and for an archived one", () => {
    expect(isFloorOpen("2026-11-15", null, new Date("2026-11-14T12:00:00Z"))).toBe(false);
    expect(isFloorOpen("2026-11-12", null, new Date("2026-11-14T08:00:00Z"))).toBe(false);
    expect(isFloorOpen(EVENT, "2026-11-14T10:00:00Z", new Date("2026-11-14T12:00:00Z"))).toBe(false);
  });

  it("follows summer time too (CEST, UTC+2)", () => {
    expect(isFloorOpen("2026-07-04", null, new Date("2026-07-05T09:59:00Z"))).toBe(true); // 11:59 next day
    expect(isFloorOpen("2026-07-04", null, new Date("2026-07-05T10:00:00Z"))).toBe(false); // 12:00 next day
  });
});

describe("floorWindowEnd (staff-offline-readout: when the staff's offline copies expire)", () => {
  it("is noon Europe/Warsaw of the next day, in winter (CET) and in summer (CEST)", () => {
    expect(floorWindowEnd(EVENT)).toBe("2026-11-15T11:00:00.000Z");
    expect(floorWindowEnd("2026-07-04")).toBe("2026-07-05T10:00:00.000Z");
  });

  it("crosses the clock changes and the year's end", () => {
    // 2026-03-29: summer time starts at 02:00 — noon of that day is already CEST.
    expect(floorWindowEnd("2026-03-28")).toBe("2026-03-29T10:00:00.000Z");
    // 2026-10-25: winter time starts at 03:00 — noon of that day is CET.
    expect(floorWindowEnd("2026-10-24")).toBe("2026-10-25T11:00:00.000Z");
    expect(floorWindowEnd("2026-12-31")).toBe("2027-01-01T11:00:00.000Z");
  });

  it("is exactly where the floor closes", () => {
    for (const date of [EVENT, "2026-07-04", "2026-03-28", "2026-10-24"]) {
      const end = Date.parse(floorWindowEnd(date));
      expect(isFloorOpen(date, null, new Date(end - 1))).toBe(true);
      expect(isFloorOpen(date, null, new Date(end))).toBe(false);
    }
  });
});

describe("the floor's routes", () => {
  it("are client routes and allow only the waiter's work", () => {
    for (const pattern of Object.keys(FLOOR_ROUTES)) {
      expect(CLIENT_ROUTE_PATTERNS).toContain(pattern);
    }
    expect(floorRouteAllows("orders", "GET")).toBe(true);
    expect(floorRouteAllows("orders", "post")).toBe(true);
    expect(floorRouteAllows("orders/:id/pieces", "PUT")).toBe(true);
    expect(floorRouteAllows("orders/:id", "PATCH")).toBe(true);
    expect(floorRouteAllows("orders/:id", "DELETE")).toBe(false);
    expect(floorRouteAllows("drinks", "POST")).toBe(true);
    expect(floorRouteAllows("drinks/:id", "PATCH")).toBe(false);
    expect(floorRouteAllows("guests", "GET")).toBe(false);
    expect(floorRouteAllows("guest-links", "GET")).toBe(false);
    expect(floorRouteAllows("seating", "GET")).toBe(false);
  });

  it("admit every member role", () => {
    expect([...FLOOR_ROLES].sort()).toEqual(["manager", "owner", "waiter"]);
  });

  it("have texts in both languages", () => {
    expect(floorMessages("pl").heading).toBe("Obsługa sali");
    expect(floorMessages("en").heading).toBe("Floor service");
  });
});
