import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAccessKey } from "@/lib/access/keys";
import { AccessLookupError, decideAccess, resolveAccess } from "@/lib/access/resolve";
import { createEvent, hasEvent, type CreateEventResult } from "@/lib/event";
import { starterQuestionRows } from "@/lib/questions/seed";
import { createServiceClient, type DbClient } from "@/lib/supabase-client";
import { hasLocalDb, localDb, localDbEnv, readEvent, releaseEvent, type TestEvent } from "./helpers";

describe.skipIf(!hasLocalDb)("access matrix against the local DB", () => {
  let db: DbClient;
  let event: TestEvent;
  // Set only when the DB had no event: two concurrent creations raced for the singleton.
  let raceOutcomes: CreateEventResult[] | null = null;
  // The event to delete after the suite; stays null when the event existed before the tests.
  let eventToRelease: TestEvent | null = null;

  beforeAll(async () => {
    db = localDb();
    if (await hasEvent(db)) {
      event = { ...(await readEvent(db)), createdByTest: false };
      return;
    }
    raceOutcomes = await Promise.all([createEvent(db), createEvent(db)]);
    event = { ...(await readEvent(db)), createdByTest: true };
    eventToRelease = event;
  });

  afterAll(async () => {
    if (eventToRelease) {
      await releaseEvent(db, eventToRelease);
    }
  });

  describe("organizer key", () => {
    it("opens the organizer page with both links available", async () => {
      const decision = await decideAccess(db, `/o/${event.organizerKey}`);
      expect(decision).toEqual({
        kind: "granted",
        access: {
          role: "organizer",
          event: { id: 1, name: event.name, organizerKey: event.organizerKey, tvKey: event.tvKey },
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
      expect(decision).toEqual({ kind: "granted", access: { role: "tv", event: { id: 1, name: event.name } } });
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

  describe("event creation", () => {
    it("lets exactly one of two concurrent creations win (when the DB started empty)", () => {
      if (!raceOutcomes) {
        return; // an event already existed before the tests; nothing to race
      }
      const statuses = raceOutcomes.map((outcome) => outcome.status).sort();
      expect(statuses).toEqual(["already-exists", "created"]);
      const created = raceOutcomes.find((outcome) => outcome.status === "created");
      expect(created).toEqual({ status: "created", organizerKey: event.organizerKey, tvKey: event.tvKey });
    });

    it("seeds the starter questions once, by the winner only (S-07)", async () => {
      if (!raceOutcomes) {
        return; // an event already existed before the tests; its question base is real data
      }
      const { count, error } = await db.from("question").select("id", { count: "exact", head: true });
      expect(error).toBeNull();
      expect(count).toBe(starterQuestionRows().length);
    });

    it("a refused creation adds no questions (S-07)", async () => {
      const before = await db.from("question").select("id", { count: "exact", head: true });
      expect(await createEvent(db)).toEqual({ status: "already-exists" });
      const after = await db.from("question").select("id", { count: "exact", head: true });
      expect(after.count).toBe(before.count);
    });

    it("refuses a second event and reveals no key", async () => {
      const result = await createEvent(db);
      expect(result).toEqual({ status: "already-exists" });
    });

    it("stores distinct organizer and TV keys", () => {
      expect(event.organizerKey).not.toBe(event.tvKey);
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
      await expect(hasEvent(badDb)).rejects.toThrow();
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
