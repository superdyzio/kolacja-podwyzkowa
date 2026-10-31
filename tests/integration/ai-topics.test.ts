import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAiProvider, parseAiConfig } from "@/lib/ai-topics/config";
import { createMockProvider } from "@/lib/ai-topics/mock-provider";
import { MOCK_TOPICS } from "@/lib/ai-topics/mock-topics";
import { AiProviderError, type AiGeneration, type AiTopicProvider } from "@/lib/ai-topics/provider";
import { generateTopic, getAiTopicUsage, getGuestAiQuota } from "@/lib/ai-topics/service";
import type { DbClient } from "@/lib/supabase-client";
import {
  acquireTestEvent,
  createTestGuests,
  deleteTestGuests,
  hasLocalDb,
  localDb,
  releaseEvent,
  testTag,
  type TestEvent,
} from "./helpers";

// One AI topic generation against the local DB (S-08) with the mock and fake providers — never a real AI call
// (tests/setup/no-ai-network.ts blocks the Anthropic host). Attempts created here (ids above the max seen before each
// test) and the tagged test guests are deleted afterwards; limits are passed relative to the current usage.
describe.skipIf(!hasLocalDb)("AI topic generation", () => {
  let db: DbClient;
  let event: TestEvent;
  let maxIdBefore = 0;
  const guestIds: number[] = [];
  const fast = createMockProvider({ delayMs: () => 0 });

  function fake(answer: () => Promise<string>): AiTopicProvider {
    return { kind: "mock", model: null, ready: true, generate: () => answer().then((text) => ({ text, usage: null })) };
  }

  // A provider that reports billed tokens like Claude does (still no network).
  function billed(model: string | null, answer: () => Promise<AiGeneration>): AiTopicProvider {
    return { kind: "anthropic", model, ready: true, generate: answer };
  }

  async function guests(count: number): Promise<number[]> {
    const created = await createTestGuests(db, testTag(), count);
    guestIds.push(...created.ids);
    return created.ids;
  }

  async function rowsSince() {
    const { data, error } = await db
      .from("ai_topic")
      .select(
        "id, requester, guest_id, category, status, finished_at, model, input_tokens, output_tokens, failure_kind, http_status",
      )
      .gt("id", maxIdBefore)
      .order("id");
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  beforeAll(async () => {
    db = localDb();
    event = await acquireTestEvent(db);
  });

  beforeEach(async () => {
    const { data, error } = await db.from("ai_topic").select("id").order("id", { ascending: false }).limit(1);
    if (error) {
      throw new Error(error.message);
    }
    maxIdBefore = data.at(0)?.id ?? 0;
  });

  afterEach(async () => {
    const { error } = await db.from("ai_topic").delete().gt("id", maxIdBefore);
    if (error) {
      throw new Error(error.message);
    }
    await deleteTestGuests(db, guestIds.splice(0));
  });

  afterAll(async () => {
    await releaseEvent(db, event);
  });

  it("generates a topic for a guest and counts it", async () => {
    const [guest = 0] = await guests(1);
    const before = await getAiTopicUsage(db);
    const result = await generateTopic(db, fast, { guestId: guest, category: "refleksyjne" });
    expect(result.status).toBe("generated");
    if (result.status !== "generated") {
      return;
    }
    expect(result.topic.category).toBe("refleksyjne");
    expect(MOCK_TOPICS.refleksyjne).toContain(result.topic.text);
    expect(await rowsSince()).toEqual([
      expect.objectContaining({ requester: "guest", guest_id: guest, category: "refleksyjne", status: "succeeded" }),
    ]);
    expect((await rowsSince())[0]?.finished_at).not.toBeNull();
    expect(await getGuestAiQuota(db, guest)).toEqual({ limit: 5, used: 1, remaining: 4, eventExhausted: false });
    expect((await getAiTopicUsage(db)).used).toBe(before.used + 1);
  });

  it("picks a category when none is chosen", async () => {
    const result = await generateTopic(db, fast, { guestId: null, category: null }, { random: () => 0.999_999 });
    expect(result).toMatchObject({ status: "generated", topic: { category: "refleksyjne" } });
    expect(await rowsSince()).toEqual([expect.objectContaining({ requester: "organizer", guest_id: null })]);
  });

  it("does not count failed attempts", async () => {
    const [guest = 0] = await guests(1);
    const before = await getAiTopicUsage(db);
    const failing = createMockProvider({ delayMs: () => 0, fail: true });
    expect(await generateTopic(db, failing, { guestId: guest, category: "generyczne" })).toEqual({
      status: "failed",
      kind: "unavailable",
    });
    expect(
      await generateTopic(db, fast, { guestId: guest, category: "generyczne" }, { simulateFailure: true }),
    ).toMatchObject({ status: "failed" });
    expect(
      await generateTopic(
        db,
        fake(() => Promise.resolve("Co sądzisz o polityce rządu?")),
        {
          guestId: guest,
          category: "kontrowersyjne",
        },
      ),
    ).toEqual({ status: "failed", kind: "off-limits" });
    expect(
      await generateTopic(
        db,
        fake(() => Promise.resolve(' „" ** ')),
        { guestId: guest, category: "generyczne" },
      ),
    ).toEqual({ status: "failed", kind: "empty" });

    expect((await rowsSince()).map((row) => row.status)).toEqual(["failed", "failed", "failed", "failed"]);
    expect(await getGuestAiQuota(db, guest)).toMatchObject({ used: 0, remaining: 5 });
    const after = await getAiTopicUsage(db);
    expect(after.used).toBe(before.used);
    expect(after.failed).toBe(before.failed + 4);
  });

  it("gives up after the deadline without counting the attempt", async () => {
    const [guest = 0] = await guests(1);
    const never = fake(() => new Promise<string>(() => undefined));
    const started = Date.now();
    expect(await generateTopic(db, never, { guestId: guest, category: "generyczne" }, { timeoutMs: 50 })).toEqual({
      status: "failed",
      kind: "timeout",
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await rowsSince()).toEqual([expect.objectContaining({ status: "failed" })]);
    expect(await getGuestAiQuota(db, guest)).toMatchObject({ used: 0 });
  });

  it("fails a misconfigured provider before reserving anything", async () => {
    const [guest = 0] = await guests(1);
    for (const env of [{ provider: "anthropic" }, { provider: "openai" }]) {
      const broken = createAiProvider(parseAiConfig(env));
      expect(await generateTopic(db, broken, { guestId: guest, category: "generyczne" })).toEqual({
        status: "failed",
        kind: "not-configured",
      });
    }
    expect(await rowsSince()).toEqual([]);
  });

  it("stops a guest at the limit but not the organizer", async () => {
    const [guest = 0] = await guests(1);
    for (let index = 0; index < 2; index++) {
      expect(
        (await generateTopic(db, fast, { guestId: guest, category: "generyczne" }, { guestLimit: 2 })).status,
      ).toBe("generated");
    }
    expect(await generateTopic(db, fast, { guestId: guest, category: "generyczne" }, { guestLimit: 2 })).toEqual({
      status: "guest-limit",
    });
    for (let index = 0; index < 3; index++) {
      expect((await generateTopic(db, fast, { guestId: null, category: null }, { guestLimit: 2 })).status).toBe(
        "generated",
      );
    }
    expect(await getGuestAiQuota(db, guest)).toMatchObject({ used: 2, remaining: 3 });
  });

  it("stops everyone at the evening limit", async () => {
    const [guest = 0] = await guests(1);
    const { used } = await getAiTopicUsage(db);
    const options = { eventLimit: used + 1 };
    expect((await generateTopic(db, fast, { guestId: null, category: null }, options)).status).toBe("generated");
    expect(await generateTopic(db, fast, { guestId: null, category: null }, options)).toEqual({
      status: "event-limit",
    });
    expect(await generateTopic(db, fast, { guestId: guest, category: null }, options)).toEqual({
      status: "event-limit",
    });
  });

  it("refuses a guest who no longer exists", async () => {
    const [guest = 0] = await guests(1);
    await deleteTestGuests(db, guestIds.splice(0));
    expect(await generateTopic(db, fast, { guestId: guest, category: "generyczne" })).toEqual({
      status: "not-found",
    });
    expect(await getGuestAiQuota(db, guest)).toEqual({ limit: 5, used: 0, remaining: 5, eventExhausted: false });
  });
  it("records the model and the billed tokens and estimates the cost", async () => {
    const [guest = 0] = await guests(1);
    const before = await getAiTopicUsage(db);
    const usage = { inputTokens: 300, outputTokens: 40 };
    const haiku = billed("claude-haiku-5-5", () =>
      Promise.resolve({ text: "Czy wolisz góry czy morze — i dlaczego?", usage }),
    );
    expect((await generateTopic(db, haiku, { guestId: guest, category: "generyczne" })).status).toBe("generated");
    expect(
      await generateTopic(db, haiku, { guestId: null, category: "generyczne" }, { random: () => 0 }),
    ).toMatchObject({ status: "generated" });
    expect(await rowsSince()).toEqual([
      expect.objectContaining({
        status: "succeeded",
        model: "claude-haiku-5-5",
        input_tokens: 300,
        output_tokens: 40,
        failure_kind: null,
        http_status: null,
      }),
      expect.objectContaining({ status: "succeeded", model: "claude-haiku-5-5", input_tokens: 300 }),
    ]);
    const after = await getAiTopicUsage(db);
    expect(after.inputTokens).toBe(before.inputTokens + 600);
    expect(after.outputTokens).toBe(before.outputTokens + 80);
    if (before.costNanoUsd !== null) {
      // 2 × (300 × 100 + 40 × 500) nano-dollars at Haiku 5.5 list prices.
      expect(after.costNanoUsd).toBe(before.costNanoUsd + 100_000);
    }
    expect(after.lastFailureHint).toBeNull();
    // The guest's own quota carries nothing about tokens or cost.
    expect(Object.keys(await getGuestAiQuota(db, guest)).sort()).toEqual([
      "eventExhausted",
      "limit",
      "remaining",
      "used",
    ]);
  });

  it("records why an attempt failed and the tokens it was still billed for", async () => {
    const [guest = 0] = await guests(1);
    const before = await getAiTopicUsage(db);
    const refused = billed("claude-haiku-5-5", () =>
      Promise.reject(new AiProviderError("refusal", undefined, undefined, { inputTokens: 250, outputTokens: 5 })),
    );
    const offLimits = billed("claude-haiku-5-5", () =>
      Promise.resolve({ text: "Co sądzisz o polityce rządu?", usage: { inputTokens: 260, outputTokens: 12 } }),
    );
    const broke = billed("claude-haiku-5-5", () => Promise.reject(new AiProviderError("no-credits", 400)));
    expect(await generateTopic(db, refused, { guestId: guest, category: "generyczne" })).toEqual({
      status: "failed",
      kind: "refusal",
    });
    expect(await generateTopic(db, offLimits, { guestId: guest, category: "kontrowersyjne" })).toEqual({
      status: "failed",
      kind: "off-limits",
    });
    expect(await generateTopic(db, broke, { guestId: guest, category: "generyczne" })).toEqual({
      status: "failed",
      kind: "no-credits",
      httpStatus: 400,
    });
    expect(await rowsSince()).toEqual([
      expect.objectContaining({ status: "failed", failure_kind: "refusal", input_tokens: 250, output_tokens: 5 }),
      expect.objectContaining({ status: "failed", failure_kind: "off-limits", input_tokens: 260, output_tokens: 12 }),
      expect.objectContaining({
        status: "failed",
        failure_kind: "no-credits",
        http_status: 400,
        input_tokens: null,
        output_tokens: null,
      }),
    ]);
    const after = await getAiTopicUsage(db);
    expect(after.used).toBe(before.used);
    expect(after.inputTokens).toBe(before.inputTokens + 510);
    expect(after.lastFailureHint).toBe(
      "Skończyły się kredyty API Anthropic albo zadziałał limit wydatków (HTTP 400) — doładuj je w konsoli: platform.claude.com → Billing.",
    );

    // A later success clears the warning.
    expect((await generateTopic(db, fast, { guestId: null, category: null })).status).toBe("generated");
    expect((await getAiTopicUsage(db)).lastFailureHint).toBeNull();
  });

  it("explains a failed attempt of an older kind or one that expired while pending", async () => {
    await generateTopic(db, createMockProvider({ delayMs: () => 0, fail: true }), { guestId: null, category: null });
    expect((await getAiTopicUsage(db)).lastFailureHint).toBe("Dostawca AI niedostępny.");
    const id = (await rowsSince()).at(0)?.id ?? 0;
    const { error } = await db.from("ai_topic").update({ failure_kind: null }).eq("id", id);
    expect(error).toBeNull();
    expect((await getAiTopicUsage(db)).lastFailureHint).toContain("Próba przerwana");
  });
});
