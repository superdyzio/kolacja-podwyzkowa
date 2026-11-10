import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAccessKey } from "@/lib/access/keys";
import { AccessLookupError, decideAccess, resolveAccess } from "@/lib/access/resolve";
import { createEvent } from "@/lib/event";
import { starterQuestionRows } from "@/lib/questions/seed";
import { createServiceClient, type DbClient } from "@/lib/supabase-client";
import { createTestEvent, hasLocalDb, localDb, localDbEnv, releaseTestEvent, type TestEvent } from "./helpers";

// event-modules: an event created now has the new-event defaults (AI topics and the guessing game off).
const NEW_EVENT_MODULES = {
  questions: true,
  aiTopics: false,
  guessing: false,
  seatingDraw: true,
  tvSpotlight: true,
  pubQuiz: false,
};

describe.skipIf(!hasLocalDb)("access matrix against the local DB", () => {
  let db: DbClient;
  let event: TestEvent;
  // A second event (multi-tenant-events): its keys open only itself.
  let other: TestEvent;

  beforeAll(async () => {
    db = localDb();
    event = await createTestEvent(db, "access");
    other = await createTestEvent(db, "access-other");
  });

  afterAll(async () => {
    await releaseTestEvent(db, event);
    await releaseTestEvent(db, other);
  });

  describe("organizer key", () => {
    it("opens the organizer page with both links available", async () => {
      const decision = await decideAccess(db, `/o/${event.organizerKey}`);
      expect(decision).toEqual({
        kind: "granted",
        access: {
          role: "organizer",
          event: {
            id: event.id,
            name: event.name,
            organizerKey: event.organizerKey,
            tvKey: event.tvKey,
            restaurantKey: event.restaurantKey,
            venueLeads: false,
            modules: NEW_EVENT_MODULES,
          },
        },
      });
    });

    it("opens organizer API routes and nested pages", async () => {
      for (const path of [`/api/o/${event.organizerKey}/anything`, `/o/${event.organizerKey}/goscie`]) {
        const decision = await decideAccess(db, path);
        expect(decision.kind).toBe("granted");
      }
    });

    it("does not open the TV view", async () => {
      expect(await decideAccess(db, `/tv/${event.organizerKey}`)).toEqual({
        kind: "denied",
        status: 404,
        isApi: false,
      });
    });
  });

  describe("TV key", () => {
    it("opens the TV view without exposing any key", async () => {
      const decision = await decideAccess(db, `/tv/${event.tvKey}`);
      expect(decision).toEqual({
        kind: "granted",
        access: { role: "tv", event: { id: event.id, name: event.name, modules: NEW_EVENT_MODULES } },
      });
      const serialized = JSON.stringify(decision);
      expect(serialized).not.toContain(event.organizerKey);
      expect(serialized).not.toContain(event.tvKey);
    });

    it("cannot reach organizer pages or organizer API routes", async () => {
      expect(await decideAccess(db, `/o/${event.tvKey}`)).toEqual({ kind: "denied", status: 404, isApi: false });
      expect(await decideAccess(db, `/api/o/${event.tvKey}/guests`)).toEqual({
        kind: "denied",
        status: 404,
        isApi: true,
      });
    });
  });

  describe("restaurant key", () => {
    it("opens the restaurant view and its API without exposing any key", async () => {
      for (const path of [`/r/${event.restaurantKey}`, `/api/r/${event.restaurantKey}/orders`]) {
        const decision = await decideAccess(db, path);
        expect(decision).toEqual({
          kind: "granted",
          access: { role: "restaurant", event: { id: event.id, name: event.name, modules: NEW_EVENT_MODULES } },
        });
        expect(JSON.stringify(decision)).not.toContain(event.restaurantKey);
      }
    });

    it("opens nothing else, and no other key opens the restaurant view", async () => {
      for (const path of [
        `/o/${event.restaurantKey}`,
        `/tv/${event.restaurantKey}`,
        `/g/${event.restaurantKey}`,
        `/api/o/${event.restaurantKey}/orders`,
        `/api/tv/${event.restaurantKey}/seating`,
        `/r/${event.organizerKey}`,
        `/r/${event.tvKey}`,
        `/api/r/${event.organizerKey}/orders`,
      ]) {
        expect((await decideAccess(db, path)).kind).toBe("denied");
      }
    });

    it("is distinct from the other keys", () => {
      expect(event.restaurantKey).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect([event.organizerKey, event.tvKey]).not.toContain(event.restaurantKey);
    });
  });

  describe("invalid keys", () => {
    it.each(["garbage", "AAAAAAAAAAAAAAAAAAAAAAA", "%2E%2E%2Fetc", "' or 1=1 --"])(
      "denies the malformed key %j on every role",
      async (key) => {
        for (const prefix of ["/o/", "/tv/", "/g/", "/api/o/"]) {
          const decision = await decideAccess(db, `${prefix}${key}`);
          expect(decision.kind).toBe("denied");
        }
      },
    );

    it("denies a well-formed key that belongs to no one", async () => {
      const unknown = generateAccessKey();
      expect(await decideAccess(db, `/o/${unknown}`)).toEqual({ kind: "denied", status: 404, isApi: false });
      expect(await decideAccess(db, `/tv/${unknown}`)).toEqual({ kind: "denied", status: 404, isApi: false });
    });

    it("denies the organizer and TV keys on guest paths", async () => {
      for (const path of [`/g/${event.organizerKey}`, `/g/${event.tvKey}`, `/api/g/${event.organizerKey}`]) {
        expect((await decideAccess(db, path)).kind).toBe("denied");
      }
    });
  });

  describe("public and unconfigured", () => {
    it("treats paths without a key prefix as public", async () => {
      expect(await decideAccess(db, "/")).toEqual({ kind: "public" });
      expect(await decideAccess(db, "/api/event")).toEqual({ kind: "public" });
    });

    it("fails keyed paths (→ 500, never the 404 denial) when the DB is not configured", async () => {
      await expect(decideAccess(null, `/o/${event.organizerKey}`)).rejects.toThrow(AccessLookupError);
      expect(await decideAccess(null, "/")).toEqual({ kind: "public" });
    });
  });

  describe("event creation (multi-tenant-events)", () => {
    it("gives every event its own id and three distinct keys from the DB", () => {
      expect(other.id).not.toBe(event.id);
      const keys = [
        event.organizerKey,
        event.tvKey,
        event.restaurantKey,
        other.organizerKey,
        other.tvKey,
        other.restaurantKey,
      ];
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/);
      }
    });

    it("resolves each key to its own event only", async () => {
      for (const [path, eventId] of [
        [`/o/${event.organizerKey}`, event.id],
        [`/tv/${event.tvKey}`, event.id],
        [`/r/${event.restaurantKey}`, event.id],
        [`/o/${other.organizerKey}`, other.id],
        [`/tv/${other.tvKey}`, other.id],
        [`/r/${other.restaurantKey}`, other.id],
      ] as const) {
        const decision = await decideAccess(db, path);
        expect(decision.kind === "granted" ? decision.access.event.id : null).toBe(eventId);
      }
    });

    it("loads the starter questions into a new event (S-07)", async () => {
      for (const created of [event, other]) {
        const { count, error } = await db
          .from("question")
          .select("id", { count: "exact", head: true })
          .eq("event_id", created.id);
        expect(error).toBeNull();
        expect(count).toBe(starterQuestionRows().length);
      }
    });

    it("refuses an event of an unknown restaurant and adds nothing", async () => {
      const before = await db.from("event").select("id", { count: "exact", head: true });
      expect(await createEvent(db, { restaurantId: 2_000_000_000, name: "Nikt" })).toEqual({
        status: "restaurant-not-found",
      });
      const after = await db.from("event").select("id", { count: "exact", head: true });
      expect(after.count).toBe(before.count);
    });
  });

  describe("failures and the public REST API", () => {
    it("throws instead of denying when the DB rejects the service key", async () => {
      const env = localDbEnv();
      if (!env) {
        throw new Error("unreachable: suite is skipped without a local DB");
      }
      const badDb = createServiceClient(env.url, "not-a-valid-service-role-key");
      await expect(resolveAccess(badDb, "organizer", event.organizerKey)).rejects.toBeInstanceOf(AccessLookupError);
      await expect(decideAccess(badDb, `/tv/${event.tvKey}`)).rejects.toBeInstanceOf(AccessLookupError);
      await expect(createEvent(badDb, { restaurantId: event.restaurantId, name: "Nikt" })).rejects.toThrow();
    });

    it("never serves the event to anonymous REST requests", async () => {
      const env = localDbEnv();
      if (!env) {
        throw new Error("unreachable: suite is skipped without a local DB");
      }
      const requests: Record<string, string>[] = [{}, { apikey: "anything" }];
      for (const headers of requests) {
        const response = await fetch(`${env.url}/rest/v1/event?select=*`, { headers });
        const body = await response.text();
        expect(body).not.toContain(event.organizerKey);
        expect(body).not.toContain(event.tvKey);
        if (response.ok) {
          expect(JSON.parse(body)).toEqual([]);
        }
      }
    });
  });
});
