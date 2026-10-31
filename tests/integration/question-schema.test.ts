import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  deleteTestQuestions,
  hasLocalDb,
  localDb,
  localDbEnv,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// The question schema (S-07) against the local DB: category and text checks, case-insensitive uniqueness across
// categories through the generated text_key, the upsert-ignore the services rely on, and nothing for browser roles.
// Only the test's own (tagged) questions are touched; the event's real questions are left alone.
describe.skipIf(!hasLocalDb)("question schema", () => {
  let db: DbClient;
  let event: TestEvent;
  let restUrl: string;
  const tag = testTag();
  const created: number[] = [];

  const tagged = (text: string) => `${text} ${tag}?`;

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
    const env = localDbEnv();
    if (!env) {
      throw new Error("unreachable: suite is skipped without a local DB");
    }
    restUrl = `${env.url}/rest/v1`;
  });

  afterEach(async () => {
    await deleteTestQuestions(db, created.splice(0));
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  async function insert(category: string, text: string) {
    const result = await db.from("question").insert({ category, text }).select("id, text_key").maybeSingle();
    if (result.data) {
      created.push(result.data.id);
    }
    return result;
  }

  it("stores a question with its lowercase key", async () => {
    const { data, error } = await insert("generyczne", tagged("Żółta ŁÓDŹ czy zielona"));
    expect(error).toBeNull();
    expect(data?.text_key).toBe(tagged("żółta łódź czy zielona"));
  });

  it("refuses unknown categories and text outside the format", async () => {
    const bad: [string, string][] = [
      ["polityczne", tagged("Nieznana kategoria")],
      ["generyczne", "Abc?"],
      ["generyczne", `${"x".repeat(300)}?`],
      ["generyczne", ` ${tagged("Spacja na początku")}`],
      ["generyczne", tagged("Dwie  spacje")],
      ["generyczne", tagged("Nowa\nlinia")],
    ];
    for (const [category, text] of bad) {
      const { error } = await insert(category, text);
      expect(error?.code, `${category}: ${text}`).toBe("23514");
    }
    const { error } = await insert("refleksyjne", "x".repeat(300));
    expect(error).toBeNull();
  });

  it("keeps a text unique across categories, regardless of letter case", async () => {
    expect((await insert("kontrowersyjne", tagged("Pytanie testowe"))).error).toBeNull();
    const { error } = await insert("refleksyjne", tagged("PYTANIE TESTOWE"));
    expect(error?.code).toBe("23505");
  });

  it("upsert with ignoreDuplicates returns only the rows it really added", async () => {
    expect((await insert("generyczne", tagged("Już jest"))).error).toBeNull();
    const { data, error } = await db
      .from("question")
      .upsert(
        [
          { category: "generyczne", text: tagged("już JEST") },
          { category: "refleksyjne", text: tagged("Nowe") },
        ],
        { onConflict: "event_id,text_key", ignoreDuplicates: true },
      )
      .select("id, category, text");
    expect(error).toBeNull();
    created.push(...(data ?? []).map((row) => row.id));
    expect(data?.map((row) => row.text)).toEqual([tagged("Nowe")]);
  });

  it("gives browser roles no questions", async () => {
    expect((await insert("generyczne", tagged("Tajne pytanie"))).error).toBeNull();
    const anonymousHeaders: Record<string, string>[] = [{}, { apikey: "anything" }];
    for (const headers of anonymousHeaders) {
      const rows = await fetch(`${restUrl}/question?select=*`, { headers });
      const body = await rows.text();
      expect(body).not.toContain(tag);
      if (rows.ok) {
        expect(JSON.parse(body)).toEqual([]);
      }
      const write = await fetch(`${restUrl}/question`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ category: "generyczne", text: tagged("Od przeglądarki") }),
      });
      expect(write.ok).toBe(false);
    }
    const { data } = await db.from("question").select("id").eq("text", tagged("Od przeglądarki"));
    expect(data).toEqual([]);
  });
});
