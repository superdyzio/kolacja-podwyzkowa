import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EVENT_ID } from "@/lib/event";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  createTestGuests,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  localDbEnv,
  readGuessSettings,
  releaseEvent,
  testTag,
  writeGuessSettings,
  type GuessSettings,
  type TestEvent,
} from "./helpers";

const UNKNOWN_ID = 999_999_999_999;
const MAX = 1_000_000_000;

// The guess schema (S-06) against the local DB: bounds, one guess per guest, cascade, the guest write function's
// intake check, and nothing for browser roles. Only the test's own guests are touched; the intake switch and the
// correct amount (shared event state) are put back after every test.
describe.skipIf(!hasLocalDb)("guess schema", () => {
  let db: DbClient;
  let event: TestEvent;
  let original: GuessSettings;
  let restUrl: string;
  const guestIds: number[] = [];

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    original = await readGuessSettings(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterEach(async () => {
    await writeGuessSettings(db, original);
    await deleteTestGuests(db, guestIds.splice(0));
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function guests(count: number): Promise<number[]> {
    const created = await createTestGuests(db, testTag(), count);
    guestIds.push(...created.ids);
    return created.ids;
  }

  async function guessOf(guestId: number) {
    const { data, error } = await db
      .from("guess")
      .select("amount_grosze, entered_by")
      .eq("guest_id", guestId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  async function setIntake(open: boolean) {
    const { error } = await db.from("event").update({ guess_intake_open: open }).eq("id", EVENT_ID);
    if (error) {
      throw new Error(error.message);
    }
  }

  it("keeps amounts within 0 … 10 000 000 zł and one guess per guest", async () => {
    const [guest] = await guests(1);
    for (const amount of [-1, MAX + 1]) {
      const { error } = await db.from("guess").insert({ guest_id: guest, amount_grosze: amount });
      expect(error?.code).toBe("23514");
    }
    expect((await db.from("guess").insert({ guest_id: guest, amount_grosze: MAX })).error).toBeNull();
    expect((await db.from("guess").insert({ guest_id: guest, amount_grosze: 0 })).error?.code).toBe("23505");
    const { error: unknownBy } = await db.from("guess").update({ entered_by: "tv" }).eq("guest_id", guest);
    expect(unknownBy?.code).toBe("23514");
  });

  it("deletes the guess together with the guest", async () => {
    const [guest] = await guests(1);
    expect((await db.from("guess").insert({ guest_id: guest, amount_grosze: 100 })).error).toBeNull();
    await deleteTestGuests(db, guestIds.splice(0));
    const { count, error } = await db
      .from("guess")
      .select("guest_id", { count: "exact", head: true })
      .eq("guest_id", guest);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("saves and replaces the guest's own guess while intake is open", async () => {
    const [guest] = await guests(1);
    await setIntake(true);
    expect((await db.rpc("save_guest_guess", { p_guest_id: guest, p_amount_grosze: 150_000 })).error).toBeNull();
    expect(await guessOf(guest)).toEqual({ amount_grosze: 150_000, entered_by: "guest" });
    await db.from("guess").update({ entered_by: "organizer" }).eq("guest_id", guest);
    expect((await db.rpc("save_guest_guess", { p_guest_id: guest, p_amount_grosze: 149_999 })).error).toBeNull();
    expect(await guessOf(guest)).toEqual({ amount_grosze: 149_999, entered_by: "guest" });
  });

  it("refuses the guest's save once intake is closed, and an unknown guest", async () => {
    const [guest] = await guests(1);
    await setIntake(true);
    await db.rpc("save_guest_guess", { p_guest_id: guest, p_amount_grosze: 100 });
    await setIntake(false);
    const closed = await db.rpc("save_guest_guess", { p_guest_id: guest, p_amount_grosze: 200 });
    expect(closed.error?.message).toBe("INTAKE_CLOSED");
    expect(await guessOf(guest)).toEqual({ amount_grosze: 100, entered_by: "guest" });
    const unknown = await db.rpc("save_guest_guess", { p_guest_id: UNKNOWN_ID, p_amount_grosze: 100 });
    expect(unknown.error?.message).toBe("GUEST_NOT_FOUND");
    const tooMuch = await guests(1);
    await setIntake(true);
    const outOfRange = await db.rpc("save_guest_guess", { p_guest_id: tooMuch[0] ?? 0, p_amount_grosze: MAX + 1 });
    expect(outOfRange.error?.code).toBe("23514");
  });

  it("keeps the correct amount within the same bounds", async () => {
    for (const amount of [-1, MAX + 1]) {
      const { error } = await db.from("event").update({ correct_amount_grosze: amount }).eq("id", EVENT_ID);
      expect(error?.code).toBe("23514");
    }
    const { error } = await db.from("event").update({ correct_amount_grosze: MAX }).eq("id", EVENT_ID);
    expect(error).toBeNull();
  });

  it("gives browser roles no guesses, no intake flag and no guest save", async () => {
    const [guest] = await guests(1);
    expect((await db.from("guess").insert({ guest_id: guest, amount_grosze: 424_242 })).error).toBeNull();
    const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];
    for (const headers of anonymousHeaders) {
      const rows = await fetch(`${restUrl}/guess?select=*`, { headers });
      const body = await rows.text();
      expect(body).not.toContain("424242");
      if (rows.ok) {
        expect(JSON.parse(body)).toEqual([]);
      }
      const flag = await fetch(`${restUrl}/event?select=guess_intake_open,correct_amount_grosze`, { headers });
      const flagBody = await flag.text();
      if (flag.ok) {
        expect(JSON.parse(flagBody)).toEqual([]);
      }
      const save = await fetch(`${restUrl}/rpc/save_guest_guess`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_guest_id: guest, p_amount_grosze: 1 }),
      });
      expect(save.ok).toBe(false);
    }
    expect(await guessOf(guest)).toEqual({ amount_grosze: 424_242, entered_by: "guest" });
  });
});
