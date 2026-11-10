import { describe, expect, it } from "vitest";
import { formatDateTime, instantToLocalInput, localInputToInstant } from "@/lib/events/dates";
import { guestStateVersion } from "@/lib/guest-links/state";
import { ALL_GUEST_MODULES } from "@/lib/modules/rules";
import type { GuestGuessDto, GuestRsvpDto } from "@/types";
import {
  attendanceOf,
  byOrganizerOf,
  defaultDeadlineInput,
  formatRsvpSummary,
  MAX_RSVP_OPTIONS,
  parseOptionNames,
  rsvpBoard,
  rsvpKey,
  toGuestRsvp,
  type RsvpGuestSource,
} from "./rules";

// guest-rsvp-menu (S-25): the Warsaw date-time of the deadline, the attendance derived from the one truth (absence),
// the counts, the RPC's JSON and the guest token's key.

describe("deadline date-time (Europe/Warsaw)", () => {
  it("converts a winter (CET) and a summer (CEST) local time to the right instant and back", () => {
    expect(localInputToInstant("2026-12-11T18:00")).toBe("2026-12-11T17:00:00.000Z");
    expect(localInputToInstant("2027-07-01T09:30")).toBe("2027-07-01T07:30:00.000Z");
    expect(instantToLocalInput("2026-12-11T17:00:00.000Z")).toBe("2026-12-11T18:00");
    expect(instantToLocalInput("2027-07-01T07:30:00.000Z")).toBe("2027-07-01T09:30");
  });

  it("resolves the spring-forward gap to the instant after it and a repeated autumn hour to its later occurrence", () => {
    // 2027-03-28 02:30 does not exist in Warsaw (02:00 → 03:00): 03:30 CEST.
    expect(localInputToInstant("2027-03-28T02:30")).toBe("2027-03-28T01:30:00.000Z");
    // 2026-10-25 02:30 happens twice: the later one, CET.
    expect(localInputToInstant("2026-10-25T02:30")).toBe("2026-10-25T01:30:00.000Z");
  });

  it("refuses malformed, impossible and out-of-range values", () => {
    for (const value of [
      "",
      "2026-12-11",
      "2026-12-11 18:00",
      "2026-02-30T10:00",
      "2026-12-11T24:00",
      "1999-12-31T10:00",
      "2101-01-01T00:00",
      "2026-13-01T10:00",
    ]) {
      expect(localInputToInstant(value), value).toBeNull();
    }
  });

  it("formats an instant in Warsaw time, Polish and English", () => {
    expect(formatDateTime("2026-12-11T17:00:00.000Z", "pl")).toBe("pt., 11.12.2026, 18:00");
    expect(formatDateTime("2026-12-11T17:00:00.000Z", "en")).toBe("Fri, 11 Dec 2026, 18:00");
  });
});

describe("attendance", () => {
  it("derives coming / not coming / no answer from the absence and the answer", () => {
    expect(attendanceOf({ absent: true, answered: true })).toBe(false);
    expect(attendanceOf({ absent: true, answered: false })).toBe(false);
    expect(attendanceOf({ absent: false, answered: true })).toBe(true);
    expect(attendanceOf({ absent: false, answered: false })).toBeNull();
  });

  it("counts an absence marked without an answer as the organizer's", () => {
    expect(byOrganizerOf({ absent: true, answered: false, answeredBy: null })).toBe(true);
    expect(byOrganizerOf({ absent: false, answered: false, answeredBy: null })).toBe(false);
    expect(byOrganizerOf({ absent: true, answered: true, answeredBy: "guest" })).toBe(false);
    expect(byOrganizerOf({ absent: false, answered: true, answeredBy: "organizer" })).toBe(true);
  });
});

describe("the guest's RSVP from the database", () => {
  const raw = {
    deadline: "2026-12-11T17:00:00+00:00",
    open: true,
    absent: false,
    answered: true,
    answeredBy: "guest",
    dish: "Schab",
    options: [
      { name: "Sernik", course: "dessert" },
      { name: "Schab", course: "main" },
      { name: "Łosoś", course: "main" },
    ],
  };

  it("maps the JSON, normalises the deadline and sorts the options by course then name", () => {
    expect(toGuestRsvp(raw)).toEqual({
      open: true,
      deadline: "2026-12-11T17:00:00.000Z",
      attending: true,
      dish: "Schab",
      byOrganizer: false,
      options: [
        { name: "Łosoś", course: "main" },
        { name: "Schab", course: "main" },
        { name: "Sernik", course: "dessert" },
      ],
    });
  });

  it("drops the dish of a guest marked absent and refuses odd shapes", () => {
    expect(toGuestRsvp({ ...raw, absent: true })?.dish).toBeNull();
    expect(toGuestRsvp({ ...raw, absent: true })?.attending).toBe(false);
    expect(toGuestRsvp(null)).toBeNull();
    expect(toGuestRsvp({ ...raw, open: "yes" })).toBeNull();
    expect(toGuestRsvp({ ...raw, deadline: "never" })).toBeNull();
    expect(toGuestRsvp({ ...raw, options: [{ name: "X", course: "breakfast" }] })).toBeNull();
  });

  it("gives every field its own part of the token key, and leaves the token alone while RSVP is off", () => {
    const parsed = toGuestRsvp(raw);
    if (parsed === null) {
      throw new Error("raw RSVP did not parse");
    }
    const base: GuestRsvpDto = parsed;
    const variants: GuestRsvpDto[] = [
      { ...base, open: false },
      { ...base, deadline: "2026-12-12T17:00:00.000Z" },
      { ...base, attending: false, dish: null },
      { ...base, dish: "Łosoś" },
      { ...base, byOrganizer: true },
      { ...base, options: base.options.slice(1) },
    ];
    const keys = new Set([rsvpKey(base), ...variants.map(rsvpKey)]);
    expect(keys.size).toBe(variants.length + 1);

    const guess: GuestGuessDto = { intakeOpen: true, amountGrosze: null, predictedPlace: null, maxPlace: 10 };
    const without = guestStateVersion("3.0", "Ania", guess, []);
    expect(guestStateVersion("3.0", "Ania", guess, [], ALL_GUEST_MODULES, null)).toBe(without);
    const withRsvp = guestStateVersion("3.0", "Ania", guess, [], ALL_GUEST_MODULES, base);
    expect(withRsvp).not.toBe(without);
    // Same number of parts: the RSVP lives in the hashed part.
    expect(withRsvp.split(".").length).toBe(without.split(".").length);
    expect(guestStateVersion("3.0", "Ania", guess, [], ALL_GUEST_MODULES, { ...base, open: false })).not.toBe(withRsvp);
  });
});

describe("the client's board", () => {
  const schab = { name: "Schab", course: "main" as const };
  const losos = { name: "Łosoś", course: "main" as const };
  const tatar = { name: "Tatar", course: "starter" as const };
  const guests: RsvpGuestSource[] = [
    { id: 1, displayName: "Zenek", absent: false, answer: { answeredBy: "guest", answeredAt: "t", dish: schab } },
    { id: 2, displayName: "Ania", absent: false, answer: { answeredBy: "organizer", answeredAt: "t", dish: schab } },
    { id: 3, displayName: "Basia", absent: true, answer: { answeredBy: "guest", answeredAt: "t", dish: losos } },
    { id: 4, displayName: "Celina", absent: true, answer: null },
    { id: 5, displayName: "Darek", absent: false, answer: null },
    { id: 6, displayName: "Ewa", absent: false, answer: { answeredBy: "guest", answeredAt: "t", dish: null } },
    { id: 7, displayName: "Franek", absent: false, answer: { answeredBy: "guest", answeredAt: "t", dish: tatar } },
  ];
  const now = new Date("2026-12-01T12:00:00Z");

  it("counts every guest once and dishes over the coming guests only (a withdrawn dish keeps counting)", () => {
    const board = rsvpBoard(
      {
        deadline: "2026-12-11T17:00:00+00:00",
        eventDate: "2026-12-12",
        guestLinksOn: true,
        options: [schab, losos, tatar],
        // The venue withdrew the tatar from the event's menu.
        available: [schab, losos],
        guests,
      },
      now,
    );
    expect(board.open).toBe(true);
    expect(board.options).toEqual([
      { ...tatar, available: false },
      { ...losos, available: true },
      { ...schab, available: true },
    ]);
    expect(board.counts).toEqual({
      total: 7,
      coming: 4,
      notComing: 2,
      noAnswer: 1,
      noDish: 1,
      dishes: [
        { name: "Schab", course: "main", count: 2, offered: true },
        { name: "Tatar", course: "starter", count: 1, offered: false },
      ],
    });
    expect(board.guests.map((guest) => [guest.displayName, guest.attending, guest.dish, guest.byOrganizer])).toEqual([
      ["Ania", true, "Schab", true],
      ["Basia", false, null, false],
      ["Celina", false, null, true],
      ["Darek", null, null, false],
      ["Ewa", true, null, false],
      ["Franek", true, "Tatar", false],
      ["Zenek", true, "Schab", false],
    ]);
    expect(formatRsvpSummary(board, "pl")).toBe(
      "do pt., 11.12.2026, 18:00 · przyjdzie 4 · nie przyjdzie 2 · bez odpowiedzi 1 · Schab ×2 · Tatar ×1",
    );
  });

  it("is closed once the deadline has passed and off without one", () => {
    const input = { eventDate: "2026-12-12", guestLinksOn: false, options: [], available: [], guests: [] };
    expect(rsvpBoard({ ...input, deadline: "2026-12-01T12:00:00Z" }, now).open).toBe(false);
    const off = rsvpBoard({ ...input, deadline: null }, now);
    expect(off.open).toBe(false);
    expect(formatRsvpSummary(off, "en")).toBe("Off");
    expect(formatRsvpSummary(rsvpBoard({ ...input, deadline: "2026-11-30T12:00:00Z" }, now), "en")).toBe(
      "closed · coming 0 · not coming 0 · no answer 0",
    );
  });

  it("suggests the evening before the event as the deadline, across a month and a year", () => {
    expect(defaultDeadlineInput("2026-12-12")).toBe("2026-12-11T20:00");
    expect(defaultDeadlineInput("2027-03-01")).toBe("2027-02-28T20:00");
    expect(defaultDeadlineInput("2027-01-01")).toBe("2026-12-31T20:00");
  });

  it("checks the option names: normalised, no repeats in any case, none empty, at most the limit", () => {
    expect(parseOptionNames(["  Schab ", "Łosoś"])).toEqual({ ok: true, names: ["Schab", "Łosoś"] });
    expect(parseOptionNames(["Schab", "SCHAB"]).ok).toBe(false);
    expect(parseOptionNames([" "]).ok).toBe(false);
    expect(parseOptionNames(Array.from({ length: MAX_RSVP_OPTIONS + 1 }, (_, index) => `D${String(index)}`)).ok).toBe(
      false,
    );
  });
});
