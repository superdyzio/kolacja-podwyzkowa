import { describe, expect, it } from "vitest";
import { clientMayWrite, isOrganizerApiPath, LEAD_CODES, leadMessages, staffMayWrite } from "@/lib/lead";

describe("lead rule (client-restaurant-split)", () => {
  it("lets exactly one side write", () => {
    for (const venueLeads of [false, true]) {
      expect(clientMayWrite(venueLeads)).toBe(!staffMayWrite(venueLeads));
    }
    expect(clientMayWrite(false)).toBe(true);
    expect(staffMayWrite(true)).toBe(true);
  });

  it("scopes the client refusal to the organizer API", () => {
    expect(isOrganizerApiPath("/api/o/abc/guests")).toBe(true);
    expect(isOrganizerApiPath("/api/g/abc/guess")).toBe(false);
    expect(isOrganizerApiPath("/api/tv/abc/seating")).toBe(false);
    expect(isOrganizerApiPath("/o/abc/goscie")).toBe(false);
  });

  it("has distinct codes and texts in both languages", () => {
    expect(LEAD_CODES.venueLeads).not.toBe(LEAD_CODES.clientLeads);
    expect(leadMessages("pl").clientReadOnly).not.toBe(leadMessages("en").clientReadOnly);
    expect(leadMessages("en").staffPreviewOnly).toContain("Venue leads");
  });
});
