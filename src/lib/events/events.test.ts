import { describe, expect, it } from "vitest";
import { addDays, eventTiming, formatEventDate, localDateTime, partitionEvents, platformToday } from "./dates";
import { eventInputProblemText, eventPanelMessages } from "./messages";
import {
  canDeleteEvents,
  canManageEvents,
  expectedGuestsFromField,
  isEventLinkKind,
  parseEventDate,
  parseEventName,
  parseExpectedGuests,
  validateEventInput,
} from "./rules";

describe("event rules", () => {
  it("normalizes names and counts code points up to 120", () => {
    expect(parseEventName("  Wigilia   firmy​ Y ")).toEqual({ ok: true, name: "Wigilia firmy Y" });
    expect(parseEventName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseEventName("x".repeat(120))).toEqual({ ok: true, name: "x".repeat(120) });
    expect(parseEventName("x".repeat(121))).toEqual({ ok: false, reason: "too-long" });
    // 120 emoji are 240 UTF-16 units but 120 code points, like Postgres char_length().
    expect(parseEventName("🎉".repeat(120)).ok).toBe(true);
  });

  it("accepts only real YYYY-MM-DD dates in 2000–2100", () => {
    expect(parseEventDate("2026-12-12")).toEqual({ ok: true, date: "2026-12-12" });
    expect(parseEventDate(" 2028-02-29 ")).toEqual({ ok: true, date: "2028-02-29" });
    expect(parseEventDate("2026-02-29")).toEqual({ ok: false });
    expect(parseEventDate("2026-02-30")).toEqual({ ok: false });
    expect(parseEventDate("12.12.2026")).toEqual({ ok: false });
    expect(parseEventDate("2026-1-5")).toEqual({ ok: false });
    expect(parseEventDate("1999-12-31")).toEqual({ ok: false });
    expect(parseEventDate("2100-12-31")).toEqual({ ok: true, date: "2100-12-31" });
    expect(parseEventDate("2101-01-01")).toEqual({ ok: false });
    expect(parseEventDate("")).toEqual({ ok: false });
  });

  it("takes the expected guests as a whole number 1–1000 or none", () => {
    expect(parseExpectedGuests(undefined)).toEqual({ ok: true, value: null });
    expect(parseExpectedGuests(null)).toEqual({ ok: true, value: null });
    expect(parseExpectedGuests(1)).toEqual({ ok: true, value: 1 });
    expect(parseExpectedGuests(1000)).toEqual({ ok: true, value: 1000 });
    expect(parseExpectedGuests(0)).toEqual({ ok: false });
    expect(parseExpectedGuests(1001)).toEqual({ ok: false });
    expect(parseExpectedGuests(2.5)).toEqual({ ok: false });
    expect(parseExpectedGuests(Number.NaN)).toEqual({ ok: false });
    expect(expectedGuestsFromField(" ")).toBeNull();
    expect(expectedGuestsFromField("80")).toBe(80);
    expect(expectedGuestsFromField("abc")).toBeNaN();
  });

  it("validates only the fields that are present, first problem wins", () => {
    expect(validateEventInput({})).toEqual({ ok: true, value: {} });
    expect(validateEventInput({ name: " A ", date: "2026-12-12", expectedGuests: null })).toEqual({
      ok: true,
      value: { name: "A", date: "2026-12-12", expectedGuests: null },
    });
    expect(validateEventInput({ name: "", date: "x" })).toEqual({ ok: false, problem: "name-empty" });
    expect(validateEventInput({ date: "x", expectedGuests: 0 })).toEqual({ ok: false, problem: "date" });
    expect(validateEventInput({ expectedGuests: 0 })).toEqual({ ok: false, problem: "guests" });
  });

  it("lets owners and managers manage events and only owners delete them", () => {
    expect(canManageEvents("owner")).toBe(true);
    expect(canManageEvents("manager")).toBe(true);
    expect(canManageEvents("waiter")).toBe(false);
    expect(canDeleteEvents("owner")).toBe(true);
    expect(canDeleteEvents("manager")).toBe(false);
    expect(canDeleteEvents("waiter")).toBe(false);
  });

  it("knows the three replaceable links", () => {
    expect(["organizer", "tv", "restaurant"].every(isEventLinkKind)).toBe(true);
    expect(isEventLinkKind("guest")).toBe(false);
    expect(isEventLinkKind(undefined)).toBe(false);
  });
});

describe("event dates (Europe/Warsaw)", () => {
  it("reads the local date and hour, not the UTC one", () => {
    // 23:30 UTC in November = 00:30 the next day in Warsaw (CET, UTC+1).
    expect(localDateTime(new Date("2026-11-10T23:30:00Z"))).toEqual({ date: "2026-11-11", hour: 0 });
    // 22:30 UTC in July = 00:30 the next day in Warsaw (CEST, UTC+2).
    expect(localDateTime(new Date("2026-07-10T22:30:00Z"))).toEqual({ date: "2026-07-11", hour: 0 });
    expect(platformToday(new Date("2026-11-10T22:59:59Z"))).toBe("2026-11-10");
    expect(platformToday(new Date("2026-11-10T23:00:00Z"))).toBe("2026-11-11");
  });

  it("moves calendar dates across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-11-10", 32)).toBe("2026-12-12");
  });

  it("keeps yesterday's event as today until noon local time", () => {
    // 00:30 on 11 November in Warsaw: the party of the 10th is still on.
    const afterMidnight = new Date("2026-11-10T23:30:00Z");
    expect(eventTiming("2026-11-11", afterMidnight)).toBe("today");
    expect(eventTiming("2026-11-10", afterMidnight)).toBe("today");
    expect(eventTiming("2026-11-09", afterMidnight)).toBe("past");
    expect(eventTiming("2026-11-12", afterMidnight)).toBe("upcoming");
    // 11:59 vs 12:00 in Warsaw (10:59 / 11:00 UTC in November).
    expect(eventTiming("2026-11-10", new Date("2026-11-11T10:59:00Z"))).toBe("today");
    expect(eventTiming("2026-11-10", new Date("2026-11-11T11:00:00Z"))).toBe("past");
    // Summer time: 12:00 in Warsaw is 10:00 UTC.
    expect(eventTiming("2026-07-10", new Date("2026-07-11T09:59:00Z"))).toBe("today");
    expect(eventTiming("2026-07-10", new Date("2026-07-11T10:00:00Z"))).toBe("past");
  });

  it("partitions into upcoming (nearest first), past (latest first) and archived (any date)", () => {
    const now = new Date("2026-11-10T12:00:00Z"); // 13:00 in Warsaw
    const events = [
      { id: 1, date: "2026-12-12", archived: false },
      { id: 2, date: "2026-11-10", archived: false },
      { id: 3, date: "2026-11-09", archived: false },
      { id: 4, date: "2026-10-01", archived: false },
      { id: 5, date: "2027-01-01", archived: true },
      { id: 6, date: "2026-05-01", archived: true },
      { id: 7, date: "2026-12-12", archived: false },
      { id: 8, date: "2026-11-09", archived: false },
    ];
    const lists = partitionEvents(events, now);
    expect(lists.upcoming.map((e) => e.id)).toEqual([2, 1, 7]);
    expect(lists.past.map((e) => e.id)).toEqual([8, 3, 4]);
    expect(lists.archived.map((e) => e.id)).toEqual([5, 6]);
  });

  it("formats dates with the weekday in both languages, the same everywhere", () => {
    expect(formatEventDate("2026-12-12")).toBe("sob., 12.12.2026");
    expect(formatEventDate("2026-11-10", "pl")).toBe("wt., 10.11.2026");
    expect(formatEventDate("2026-12-12", "en")).toBe("Sat, 12 Dec 2026");
    expect(formatEventDate("2027-01-03", "en")).toBe("Sun, 3 Jan 2027");
  });
});

describe("event messages", () => {
  it("names every input problem in both languages", () => {
    for (const locale of ["pl", "en"] as const) {
      for (const problem of ["name-empty", "name-too-long", "date", "guests", "nothing"] as const) {
        expect(eventInputProblemText(problem, locale).length).toBeGreaterThan(5);
      }
    }
    expect(eventInputProblemText("name-too-long")).toContain("120");
    expect(eventInputProblemText("guests", "en")).toContain("1000");
  });

  it("says in every replace confirm who is cut off and that the other links keep working", () => {
    const pl = eventPanelMessages("pl").links;
    expect(pl.organizer.confirmRotate("Wigilia")).toContain("klient");
    expect(pl.tv.confirmRotate("Wigilia")).toContain("Ekran");
    expect(pl.restaurant.confirmRotate("Wigilia")).toContain("kuchni");
    for (const kind of ["organizer", "tv", "restaurant"] as const) {
      expect(pl[kind].confirmRotate("Wigilia")).toContain("„Wigilia”");
      expect(pl[kind].confirmRotate("Wigilia")).toContain("działają dalej");
      expect(eventPanelMessages("en").links[kind].confirmRotate("Party")).toContain("keep working");
    }
    expect(eventPanelMessages("pl").confirmDelete("Wigilia")).toContain("linki wszystkich gości");
  });
});
