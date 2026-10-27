import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateAccessKey, isWellFormedAccessKey } from "@/lib/access/keys";
import { decideAccess, resolveAccess } from "@/lib/access/resolve";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  localDbEnv,
  readGuestAccessEnabled,
  readGuestKeys,
  releaseEvent,
  testTag,
  writeGuestAccessEnabled,
  type TestEvent,
} from "./helpers";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

// Personal guest keys (S-05) and the guest rows of the access matrix (PRD Access Control): a guest key opens /g/
// paths only while guest access is on, and never another role's paths. Tests use their own guests and put the
// shared guest-access switch back after every test.
describe.skipIf(!hasLocalDb)("guest keys and guest access", () => {
  let db: DbClient;
  let event: TestEvent;
  let originalEnabled = false;
  const tag = testTag();
  const names = [`Klucz ${tag} A`, `Klucz ${tag} B`];
  let ids: number[] = [];
  let keys: string[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    originalEnabled = await readGuestAccessEnabled(db);
    // Inserted without a key on purpose: the column default must provide one.
    const { data, error } = await db
      .from("guest")
      .insert(names.map((display_name) => ({ display_name })))
      .select("id, display_name");
    if (error) {
      throw new Error(error.message);
    }
    ids = names.map((name) => data.find((row) => row.display_name === name)?.id ?? 0);
    const keyById = await readGuestKeys(db, ids);
    keys = ids.map((id) => keyById.get(id) ?? "");
  });

  afterEach(async () => {
    await writeGuestAccessEnabled(db, originalEnabled);
  });

  afterAll(async () => {
    await deleteTestGuests(db, ids);
    await releaseEvent(db, event);
  });

  describe("keys", () => {
    it("gives every new guest a well-formed key of its own", () => {
      expect(keys).toHaveLength(2);
      for (const key of keys) {
        expect(isWellFormedAccessKey(key)).toBe(true);
      }
      expect(keys[0]).not.toBe(keys[1]);
      expect(keys).not.toContain(event.organizerKey);
      expect(keys).not.toContain(event.tvKey);
    });

    it("has a key for every guest in the database (existing guests were backfilled)", async () => {
      const { data, error } = await db.from("guest").select("access_key");
      if (error) {
        throw new Error(error.message);
      }
      expect(data.every((row) => isWellFormedAccessKey(row.access_key))).toBe(true);
      expect(new Set(data.map((row) => row.access_key)).size).toBe(data.length);
    });

    it("refuses a duplicate key", async () => {
      const { error } = await db.from("guest").update({ access_key: keys[0] }).eq("id", ids[1]);
      expect(error?.code).toBe(UNIQUE_VIOLATION);
    });

    it.each(["short", "AbCdEfGhIjKlMnOpQrStUv+/", `${"A".repeat(24)}=`])(
      "refuses the malformed key %j",
      async (bad) => {
        const { error } = await db.from("guest").update({ access_key: bad }).eq("id", ids[1]);
        expect(error?.code).toBe(CHECK_VIOLATION);
      },
    );
  });

  describe("access matrix", () => {
    it("denies a guest key while guest access is off", async () => {
      await writeGuestAccessEnabled(db, false);
      expect(await resolveAccess(db, "guest", keys[0])).toBeNull();
      expect(await decideAccess(db, `/g/${keys[0]}`)).toEqual({ kind: "denied", status: 404, isApi: false });
      expect(await decideAccess(db, `/api/g/${keys[0]}/state`)).toEqual({
        kind: "denied",
        status: 404,
        isApi: true,
      });
    });

    it("grants the guest's own identity, and no keys, while guest access is on", async () => {
      await writeGuestAccessEnabled(db, true);
      const access = await resolveAccess(db, "guest", keys[0]);
      expect(access).toEqual({
        role: "guest",
        event: { id: 1, name: event.name },
        guest: { id: ids[0], displayName: names[0] },
      });
      const serialized = JSON.stringify(access);
      for (const key of [...keys, event.organizerKey, event.tvKey]) {
        expect(serialized).not.toContain(key);
      }
      expect((await decideAccess(db, `/g/${keys[1]}`)).kind).toBe("granted");
      expect((await decideAccess(db, `/api/g/${keys[1]}/state`)).kind).toBe("granted");
    });

    it("denies unknown and malformed guest keys and other roles' keys on guest paths", async () => {
      await writeGuestAccessEnabled(db, true);
      for (const key of [generateAccessKey(), "garbage", event.organizerKey, event.tvKey]) {
        expect(await resolveAccess(db, "guest", key)).toBeNull();
        expect((await decideAccess(db, `/g/${key}`)).kind).toBe("denied");
      }
    });

    it("never lets a guest key open organizer or TV paths", async () => {
      await writeGuestAccessEnabled(db, true);
      for (const path of [
        `/o/${keys[0]}`,
        `/o/${keys[0]}/linki`,
        `/api/o/${keys[0]}/guests`,
        `/api/o/${keys[0]}/guest-links`,
        `/tv/${keys[0]}`,
        `/api/tv/${keys[0]}/seating`,
      ]) {
        expect((await decideAccess(db, path)).kind).toBe("denied");
      }
    });

    it("kills the old link as soon as the key is replaced", async () => {
      await writeGuestAccessEnabled(db, true);
      const replacement = generateAccessKey();
      const { error } = await db.from("guest").update({ access_key: replacement }).eq("id", ids[1]);
      if (error) {
        throw new Error(error.message);
      }
      expect(await resolveAccess(db, "guest", keys[1])).toBeNull();
      expect((await resolveAccess(db, "guest", replacement))?.role).toBe("guest");
      keys[1] = replacement;
    });

    it("denies the link of a deleted guest", async () => {
      await writeGuestAccessEnabled(db, true);
      const { data, error } = await db
        .from("guest")
        .insert({ display_name: `Klucz ${tag} C` })
        .select("id, access_key")
        .single();
      if (error) {
        throw new Error(error.message);
      }
      await deleteTestGuests(db, [data.id]);
      expect(await resolveAccess(db, "guest", data.access_key)).toBeNull();
    });
  });

  describe("public REST API", () => {
    it("never serves guest keys or the guest-access switch to anonymous requests", async () => {
      const env = localDbEnv();
      if (!env) {
        throw new Error("unreachable: suite is skipped without a local DB");
      }
      for (const headers of [{}, { apikey: "anything" }] as Record<string, string>[]) {
        for (const path of ["guest?select=access_key", "event?select=guest_access_enabled"]) {
          const response = await fetch(`${env.url}/rest/v1/${path}`, { headers });
          const body = await response.text();
          for (const key of keys) {
            expect(body).not.toContain(key);
          }
          if (response.ok) {
            expect(JSON.parse(body)).toEqual([]);
          }
        }
      }
    });
  });
});
