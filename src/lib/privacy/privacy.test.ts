import { describe, expect, it } from "vitest";
import { isFloorOpen } from "@/lib/floor/rules";
import { privacyMessages } from "./messages";
import {
  createSweepThrottle,
  DEFAULT_GUEST_RETENTION_DAYS,
  EXPORT_ROLES,
  guestDataDeleteAfter,
  isGuestDataExpired,
  MAX_GUEST_RETENTION_DAYS,
  MIN_GUEST_RETENTION_DAYS,
  parseRetentionDays,
  parseRetentionDaysText,
  RETENTION_EDIT_ROLES,
  RETENTION_VIEW_ROLES,
} from "./rules";

// privacy-retention (S-26): the retention rule at its edges (Europe/Warsaw days, CET and CEST), its distance from the
// floor window, the range and the sweep's throttle. Fixed clocks only.

describe("retention rules", () => {
  it("keeps the range, the default and the roles", () => {
    expect(DEFAULT_GUEST_RETENTION_DAYS).toBe(30);
    expect([MIN_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS]).toEqual([1, 365]);
    expect(RETENTION_EDIT_ROLES).toEqual(["owner"]);
    expect(RETENTION_VIEW_ROLES).toEqual(["owner", "manager"]);
    expect(EXPORT_ROLES).toEqual(["owner", "manager"]);
  });

  it("parses whole days in the range only", () => {
    expect(parseRetentionDays(1)).toEqual({ ok: true, days: 1 });
    expect(parseRetentionDays(30)).toEqual({ ok: true, days: 30 });
    expect(parseRetentionDays(365)).toEqual({ ok: true, days: 365 });
    for (const bad of [0, -1, 366, 7.5, "30", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseRetentionDays(bad)).toEqual({ ok: false });
    }
  });

  it("reads the days of a query parameter: digits in the range only (retention-preview)", () => {
    expect(parseRetentionDaysText("1")).toEqual({ ok: true, days: 1 });
    expect(parseRetentionDaysText("007")).toEqual({ ok: true, days: 7 });
    expect(parseRetentionDaysText("365")).toEqual({ ok: true, days: 365 });
    for (const bad of ["", "0", "366", "7.5", "-7", " 7", "7 ", "1e2", "0x10", "abc", "12345"]) {
      expect(parseRetentionDaysText(bad), bad).toEqual({ ok: false });
    }
  });

  it("names the count with plural forms in the shortening confirm (PL, EN)", () => {
    const pl = privacyMessages("pl");
    const en = privacyMessages("en");
    expect(pl.confirmShorten(1, "pon., 2.11.2026", 1)).toContain(
      "do 1 dnia dane gości z 1 wydarzenia (najpóźniejsze: pon., 2.11.2026)",
    );
    expect(pl.confirmShorten(3, "x", 7)).toContain("do 7 dni dane gości z 3 wydarzeń");
    expect(pl.confirmShorten(22, "x", 22)).toContain("do 22 dni dane gości z 22 wydarzeń");
    expect(en.confirmShorten(1, "Mon, 2 Nov 2026", 1)).toContain(
      "to 1 day deletes the guests' data of 1 event (the latest on Mon, 2 Nov 2026)",
    );
    expect(en.confirmShorten(3, "x", 7)).toContain("to 7 days deletes the guests' data of 3 events");
  });

  it("keeps the data through the Nth day after the event", () => {
    expect(guestDataDeleteAfter("2026-11-08", 30)).toBe("2026-12-08");
    expect(guestDataDeleteAfter("2026-12-20", 30)).toBe("2027-01-19");
    expect(guestDataDeleteAfter("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("expires at midnight Warsaw time after the last day (CET)", () => {
    // 2026-11-08 + 1 day → kept through 2026-11-09; Warsaw midnight of the 10th is 23:00 UTC on the 9th.
    expect(isGuestDataExpired("2026-11-08", 1, new Date("2026-11-09T22:59:59Z"))).toBe(false);
    expect(isGuestDataExpired("2026-11-08", 1, new Date("2026-11-09T23:00:00Z"))).toBe(true);
    expect(isGuestDataExpired("2026-11-08", 30, new Date("2026-12-08T22:59:59Z"))).toBe(false);
    expect(isGuestDataExpired("2026-11-08", 30, new Date("2026-12-08T23:00:00Z"))).toBe(true);
  });

  it("expires at midnight Warsaw time after the last day (CEST)", () => {
    // Summer time: Warsaw midnight is 22:00 UTC.
    expect(isGuestDataExpired("2026-07-10", 1, new Date("2026-07-11T21:59:59Z"))).toBe(false);
    expect(isGuestDataExpired("2026-07-10", 1, new Date("2026-07-11T22:00:00Z"))).toBe(true);
  });

  it("never expires an event inside its floor window, for any allowed term", () => {
    const eventDate = "2026-03-28"; // the night of the spring clock change follows
    for (const days of [1, 2, 7, 30, 365]) {
      for (let hour = -24; hour <= 72; hour++) {
        const now = new Date(Date.parse("2026-03-28T00:00:00Z") + hour * 3_600_000);
        if (isFloorOpen(eventDate, null, now)) {
          expect(isGuestDataExpired(eventDate, days, now)).toBe(false);
        }
      }
    }
    // The earliest expiry (1 day) comes after the window: the window closes at noon of the 29th.
    expect(isFloorOpen(eventDate, null, new Date("2026-03-29T09:59:00Z"))).toBe(true);
    expect(isGuestDataExpired(eventDate, 1, new Date("2026-03-29T22:00:00Z"))).toBe(true);
  });

  it("lets the sweep run at most once per interval", () => {
    const throttle = createSweepThrottle(600_000);
    expect(throttle.due(1_000)).toBe(true);
    expect(throttle.due(1_001)).toBe(false);
    expect(throttle.due(600_999)).toBe(false);
    expect(throttle.due(601_000)).toBe(true);
    expect(throttle.due(601_001)).toBe(false);
  });
});
