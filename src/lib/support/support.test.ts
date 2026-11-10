import { describe, expect, it } from "vitest";
import type { SupportLogEntryDto } from "@/types";
import { describeSupportEntry, formatSupportClock, formatSupportTime } from "./format";
import { supportMessages } from "./messages";
import {
  isApiPath,
  isReadMethod,
  loggedPath,
  parseSupportReason,
  SUPPORT_LOG_ROLES,
  SUPPORT_MINUTES,
  SUPPORT_PATH_MAX,
  SUPPORT_ROLE,
  supportArea,
  supportEventSummary,
  supportStartPath,
} from "./rules";

const entry = (overrides: Partial<SupportLogEntryDto>): SupportLogEntryDto => ({
  id: 1,
  kind: "access",
  at: "2026-11-10T00:45:00Z",
  admin: { email: "admin@demo.stolik", name: "Administrator demo" },
  reason: null,
  expiresAt: null,
  method: "GET",
  path: "/panel/restauracje/5",
  event: null,
  ...overrides,
});

describe("support rules", () => {
  it("keeps support mode short, read-only and owner-shaped", () => {
    expect(SUPPORT_MINUTES).toBe(60);
    expect(SUPPORT_ROLE).toBe("owner");
    expect(SUPPORT_LOG_ROLES).toEqual(["owner"]);
    expect(supportStartPath(12)).toBe("/panel/restauracje/12");
  });

  it("admits only reads", () => {
    for (const method of ["GET", "get", "HEAD", "OPTIONS"]) {
      expect(isReadMethod(method)).toBe(true);
    }
    for (const method of ["POST", "PATCH", "PUT", "DELETE", "patch", ""]) {
      expect(isReadMethod(method)).toBe(false);
    }
  });

  it("normalizes the reason and counts code points from 3 to 300", () => {
    expect(parseSupportReason("  Prośba \n właściciela\t:  brak   wydarzenia ")).toEqual({
      ok: true,
      reason: "Prośba właściciela : brak wydarzenia",
    });
    expect(parseSupportReason("ab")).toEqual({ ok: false, problem: "short" });
    expect(parseSupportReason("  a​b ")).toEqual({ ok: false, problem: "short" });
    expect(parseSupportReason("abc")).toEqual({ ok: true, reason: "abc" });
    expect(parseSupportReason("x".repeat(300))).toEqual({ ok: true, reason: "x".repeat(300) });
    expect(parseSupportReason("x".repeat(301))).toEqual({ ok: false, problem: "long" });
    // 300 emoji are 600 UTF-16 units but 300 code points, like Postgres char_length().
    expect(parseSupportReason("🎉".repeat(300)).ok).toBe(true);
    expect(parseSupportReason("🎉".repeat(301))).toEqual({ ok: false, problem: "long" });
  });

  it("drops the links (keys) from the event card", () => {
    const summary = supportEventSummary({
      id: 9,
      name: "Wigilia",
      date: "2026-12-20",
      expectedGuests: 40,
      archived: false,
      timing: "upcoming",
      restaurantId: 5,
      restaurantName: "Pod Lipą",
      archivedAt: null,
      venueLeads: true,
      guestCount: 12,
      links: { organizer: "/o/AAAA", tv: "/tv/BBBB", restaurant: "/r/CCCC" },
    });
    expect(summary).not.toHaveProperty("links");
    expect(JSON.stringify(summary)).not.toMatch(/\/(o|tv|r)\//);
    expect(summary).toMatchObject({ id: 9, name: "Wigilia", guestCount: 12, restaurantName: "Pod Lipą" });
  });

  it("cuts a logged path to the column's limit by code points", () => {
    expect(loggedPath("/panel/restauracje/5")).toBe("/panel/restauracje/5");
    const long = `/panel/${"ż".repeat(400)}`;
    expect(Array.from(loggedPath(long)).length).toBe(SUPPORT_PATH_MAX);
    expect(long.startsWith(loggedPath(long))).toBe(true);
  });

  it("names the part of the panel a path opened", () => {
    expect(supportArea("/panel/restauracje/5")).toBe("restaurant");
    expect(supportArea("/panel/wydarzenia/9")).toBe("event");
    expect(supportArea("/api/panel/restaurants/5")).toBe("restaurant");
    expect(supportArea("/api/panel/restaurants/5/events")).toBe("events");
    expect(supportArea("/api/panel/restaurants/5/team")).toBe("team");
    expect(supportArea("/api/panel/restaurants/5/team/7")).toBe("team");
    expect(supportArea("/api/panel/restaurants/5/support-log")).toBe("log");
    expect(supportArea("/api/panel/events/9")).toBe("event");
    expect(supportArea("/api/panel/events/9/links/tv")).toBe("event");
    expect(supportArea("/panel")).toBe("other");
    expect(isApiPath("/api/panel/events/9")).toBe(true);
    expect(isApiPath("/panel/wydarzenia/9")).toBe(false);
    expect(isApiPath("/apiary")).toBe(false);
  });
});

describe("support formats", () => {
  it("shows times in Warsaw, winter and summer", () => {
    // 2026-11-10 00:45 UTC = 01:45 CET; 2026-07-01 22:05 UTC = 00:05 CEST the next day.
    expect(formatSupportClock("2026-11-10T00:45:00Z")).toBe("01:45");
    expect(formatSupportTime("2026-11-10T00:45:00Z")).toBe("10.11.2026, 01:45");
    expect(formatSupportTime("2026-11-10T00:45:00Z", "en")).toBe("10 Nov 2026, 01:45");
    expect(formatSupportTime("2026-07-01T22:05:00Z")).toBe("02.07.2026, 00:05");
    expect(formatSupportTime("2026-07-01T22:05:00Z", "en")).toBe("2 Jul 2026, 00:05");
    // The DST change of 2026-10-25: 00:59 UTC = 02:59 CEST, 01:00 UTC = 02:00 CET.
    expect(formatSupportClock("2026-10-25T00:59:00Z")).toBe("02:59");
    expect(formatSupportClock("2026-10-25T01:00:00Z")).toBe("02:00");
  });

  it("describes every kind of entry in both languages", () => {
    const enter = entry({
      kind: "enter",
      reason: "Prośba",
      expiresAt: "2026-11-10T01:45:00Z",
      method: null,
      path: null,
    });
    expect(describeSupportEntry(enter)).toBe("Wejście w tryb wsparcia (do 02:45)");
    expect(describeSupportEntry(enter, "en")).toBe("Entered support mode (until 02:45)");
    expect(describeSupportEntry(entry({}))).toBe("Otwarte: strona restauracji");
    expect(describeSupportEntry(entry({}), "en")).toBe("Opened: restaurant page");
    expect(describeSupportEntry(entry({ path: "/api/panel/restaurants/5/team" }))).toBe("Otwarte: zespół (API)");
    const event = entry({ path: "/panel/wydarzenia/9", event: { id: 9, name: "Wigilia" } });
    expect(describeSupportEntry(event)).toBe("Otwarte: wydarzenie „Wigilia”");
    expect(describeSupportEntry(event, "en")).toBe("Opened: event “Wigilia”");
    expect(describeSupportEntry(entry({ kind: "exit", method: null, path: null }))).toBe("Zakończenie trybu wsparcia");
    expect(describeSupportEntry(entry({ kind: "exit", method: null, path: null }), "en")).toBe("Left support mode");
  });

  it("has a message for every reason problem in both languages", () => {
    for (const locale of ["pl", "en"] as const) {
      const t = supportMessages(locale);
      expect(t.reasonProblems.short.length).toBeGreaterThan(0);
      expect(t.reasonProblems.long.length).toBeGreaterThan(0);
    }
  });
});
