import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import { acquireTestEvent, hasLocalDb, localDb, localDbEnv, releaseEvent, testTag, type TestEvent } from "./helpers";

// The browser never talks to the database: anonymous REST requests must not see the plan, rooms or tables, and
// must not be able to create a room.
describe.skipIf(!hasLocalDb)("venue schema is closed to browser roles", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const tag = testTag();
  const roomName = `Anon sala ${tag}`;
  const tableName = `Anon ${tag}`;
  let roomId: number | null = null;

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;

    const { data: room, error } = await db.from("venue_room").insert({ name: roomName }).select("id").single();
    if (error) {
      throw new Error(error.message);
    }
    roomId = room.id;
    const { error: tableError } = await db.from("venue_table").insert({
      room_id: room.id,
      name: tableName,
      seat_count: 8,
      shape: "round",
      pos_x: 0.5,
      pos_y: 0.5,
    });
    if (tableError) {
      throw new Error(tableError.message);
    }
  });

  afterAll(async () => {
    if (roomId !== null) {
      // The table goes with its room.
      const { error } = await db.from("venue_room").delete().eq("id", roomId);
      if (error) {
        throw new Error(error.message);
      }
    }
    await releaseEvent(db, event);
  });

  const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];

  it.each(["venue_plan", "venue_room", "venue_table"])(
    "does not serve %s rows to anonymous requests",
    async (table) => {
      for (const headers of anonymousHeaders) {
        const response = await fetch(`${restUrl}/${table}?select=*`, { headers });
        const body = await response.text();
        expect(body).not.toContain(roomName);
        expect(body).not.toContain(tableName);
        if (response.ok) {
          expect(JSON.parse(body)).toEqual([]);
        }
      }
    },
  );

  it("does not let anonymous requests create a room", async () => {
    const intruder = `Intruz ${tag}`;
    for (const headers of anonymousHeaders) {
      const response = await fetch(`${restUrl}/venue_room`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: intruder }),
      });
      expect(response.ok).toBe(false);
    }
    const { data, error } = await db.from("venue_room").select("id").eq("name", intruder);
    if (error) {
      throw new Error(error.message);
    }
    expect(data).toEqual([]);
  });
});
