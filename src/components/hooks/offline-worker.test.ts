import { describe, expect, it } from "vitest";
import { organizerScope } from "./offline-worker";

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
