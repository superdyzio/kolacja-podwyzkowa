import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// The browser never talks to the database: anonymous REST requests must not see guests or groups, and must not be
// able to create a group through the RPC endpoint.
describe.skipIf(!hasLocalDb)("guest schema is closed to browser roles", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const tag = testTag();
  const names = [`Anon ${tag} A`, `Anon ${tag} B`, `Anon ${tag} C`, `Anon ${tag} D`];
  let ids: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;

    const { data, error } = await db
      .from("guest")
      .insert(names.map((display_name) => ({ display_name })))
      .select("id, display_name");
    if (error) {
      throw new Error(error.message);
    }
    ids = names.map((name) => {
      const row = data.find((candidate) => candidate.display_name === name);
      if (!row) {
        throw new Error(`missing test guest ${name}`);
      }
      return row.id;
    });
    // The first two form a group so guest_group has a row to (not) leak.
    const { error: groupError } = await db.rpc("create_guest_group", { p_guest_ids: [ids[0], ids[1]] });
    if (groupError) {
      throw new Error(groupError.message);
    }
  });

  afterAll(async () => {
    await deleteTestGuests(db, ids);
    await releaseEvent(db, event);
  });

  const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];

  it.each(["guest", "guest_group"])("does not serve %s rows to anonymous requests", async (table) => {
    for (const headers of anonymousHeaders) {
      const response = await fetch(`${restUrl}/${table}?select=*`, { headers });
      const body = await response.text();
      for (const name of names) {
        expect(body).not.toContain(name);
      }
      if (response.ok) {
        expect(JSON.parse(body)).toEqual([]);
      }
    }
  });

  it("does not let anonymous requests create a group", async () => {
    for (const headers of anonymousHeaders) {
      const response = await fetch(`${restUrl}/rpc/create_guest_group`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_guest_ids: [ids[2], ids[3]] }),
      });
      expect(response.ok).toBe(false);
    }
    const { data, error } = await db.from("guest").select("group_id").in("id", [ids[2], ids[3]]);
    if (error) {
      throw new Error(error.message);
    }
    expect(data.map((row) => row.group_id)).toEqual([null, null]);
  });
});
