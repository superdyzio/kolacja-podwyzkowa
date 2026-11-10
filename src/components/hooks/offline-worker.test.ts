import { describe, expect, it } from "vitest";
import { isOrganizerApiBase, organizerScope } from "./offline-worker";

// The organizer worker's scope (S-09): the organizer pages of one link, never the API.

describe("organizerScope", () => {
  it("drops the /api prefix and keeps no trailing slash", () => {
    expect(organizerScope("/api/o/AAAAAAAAAAAAAAAAAAAAAAAA")).toBe("/o/AAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("leaves a path without the prefix alone", () => {
    expect(organizerScope("/o/AAAAAAAAAAAAAAAAAAAAAAAA")).toBe("/o/AAAAAAAAAAAAAAAAAAAAAAAA");
    expect(organizerScope("/apix/o/A")).toBe("/apix/o/A");
  });
});

describe("isOrganizerApiBase (client-restaurant-split)", () => {
  it("is true only for the client's own link", () => {
    expect(isOrganizerApiBase("/api/o/AAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(isOrganizerApiBase("/api/panel/events/5/klient")).toBe(false);
    expect(isOrganizerApiBase("/api/panel/events/5")).toBe(false);
    expect(isOrganizerApiBase("/api/o/A/guests")).toBe(false);
  });
});
