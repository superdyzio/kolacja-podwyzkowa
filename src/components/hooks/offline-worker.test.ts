import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetReadoutArea, forgetReadoutWorker, isOrganizerApiBase, organizerScope } from "./offline-worker";

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

// staff-offline-readout (S-27): forgetting one scope's worker and copy (its access is gone) or every one under an area
// (a logout), never a longer sibling path, another area or a foreign cache.
describe("forgetReadoutWorker / forgetReadoutArea", () => {
  const ORIGIN = "https://stolik.example";
  const scopes = [
    `${ORIGIN}/o/AAAAAAAAAAAAAAAAAAAAAAAA`,
    `${ORIGIN}/r/AAAAAAAAAAAAAAAAAAAAAAAA`,
    `${ORIGIN}/panel/obsluga/12`,
    `${ORIGIN}/panel/obsluga/123`,
    `${ORIGIN}/kelner/sala/12`,
  ];
  let unregistered: string[];
  let deleted: string[];

  beforeEach(() => {
    unregistered = [];
    deleted = [];
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: () =>
          Promise.resolve(
            scopes.map((scope) => ({
              scope,
              unregister: () => {
                unregistered.push(scope);
                return Promise.resolve(true);
              },
            })),
          ),
      },
    });
    const cacheNames = [...scopes.map((scope) => `kolacja-odczyt|${scope}|1700000000000`), "other-cache"];
    vi.stubGlobal("window", {
      location: { origin: ORIGIN },
      caches: {
        keys: () => Promise.resolve(cacheNames),
        delete: (name: string) => {
          deleted.push(name);
          return Promise.resolve(true);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forgets exactly one scope", async () => {
    await forgetReadoutWorker("/panel/obsluga/12");
    expect(unregistered).toEqual([`${ORIGIN}/panel/obsluga/12`]);
    expect(deleted).toEqual([`kolacja-odczyt|${ORIGIN}/panel/obsluga/12|1700000000000`]);
  });

  it("forgets every scope under an area and nothing else", async () => {
    await forgetReadoutArea("/panel/obsluga/");
    expect(unregistered).toEqual([`${ORIGIN}/panel/obsluga/12`, `${ORIGIN}/panel/obsluga/123`]);
    expect(deleted).toHaveLength(2);
    await forgetReadoutArea("/kelner/sala/");
    expect(unregistered.at(-1)).toBe(`${ORIGIN}/kelner/sala/12`);
    expect(deleted).not.toContain("other-cache");
  });

  it("swallows a browser without workers or caches", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    await expect(forgetReadoutArea("/kelner/sala/")).resolves.toBeUndefined();
  });
});
