import { describe, expect, it } from "vitest";
import {
  EMPTY_TOPIC_MEMORY,
  GUEST_TOPIC_STORAGE_KEY,
  ORGANIZER_TOPIC_STORAGE_KEY,
  parseGuestQuota,
  parseTopic,
  parseTopicMemory,
  parseUsage,
  serializeTopicMemory,
  type TopicMemory,
} from "./topic-memory";

const memory: TopicMemory = {
  category: "refleksyjne",
  last: { category: "refleksyjne", text: "Za co czujesz dziś największą wdzięczność?" },
};

describe("AI topic memory", () => {
  it("round-trips what a browser remembers", () => {
    expect(parseTopicMemory(serializeTopicMemory(memory))).toEqual(memory);
    expect(parseTopicMemory(serializeTopicMemory(EMPTY_TOPIC_MEMORY))).toEqual(EMPTY_TOPIC_MEMORY);
    expect(GUEST_TOPIC_STORAGE_KEY).not.toBe(ORGANIZER_TOPIC_STORAGE_KEY);
  });

  it("survives hostile storage", () => {
    for (const raw of [null, "", "{not json", "[]", "42", "null", '"tekst"']) {
      expect(parseTopicMemory(raw)).toEqual(EMPTY_TOPIC_MEMORY);
    }
    expect(parseTopicMemory(JSON.stringify({ category: "polityczne", last: memory.last }))).toEqual({
      category: null,
      last: memory.last,
    });
    expect(parseTopicMemory(JSON.stringify({ category: "generyczne", last: { category: "x", text: "y" } }))).toEqual({
      category: "generyczne",
      last: null,
    });
  });

  it("drops extra fields when saving", () => {
    const extra = { ...memory, last: { ...memory.last, secret: 1 } } as unknown as TopicMemory;
    expect(JSON.parse(serializeTopicMemory(extra))).toEqual(memory);
  });
});

describe("AI topic answers", () => {
  it("reads a topic", () => {
    expect(parseTopic({ category: "generyczne", text: "Czy?" })).toEqual({ category: "generyczne", text: "Czy?" });
    expect(parseTopic({ category: "generyczne", text: "  " })).toBeNull();
    expect(parseTopic({ category: "inne", text: "Czy?" })).toBeNull();
    expect(parseTopic(null)).toBeNull();
  });

  it("reads the guest's quota from any answer", () => {
    const quota = { limit: 5, used: 2, remaining: 3, eventExhausted: false };
    expect(parseGuestQuota({ topic: {}, quota })).toEqual(quota);
    expect(parseGuestQuota({ error: "x", quota })).toEqual(quota);
    expect(parseGuestQuota({ error: "Brak dostępu" })).toBeNull();
    expect(parseGuestQuota({ quota: { ...quota, remaining: -1 } })).toBeNull();
    expect(parseGuestQuota({ quota: { ...quota, eventExhausted: "no" } })).toBeNull();
    expect(parseGuestQuota(null)).toBeNull();
  });

  it("reads the evening's usage from any answer", () => {
    const usage = { used: 12, limit: 300, failed: 2, guestLimit: 5 };
    expect(parseUsage({ usage, provider: {} })).toEqual(usage);
    expect(parseUsage({ error: "x", hint: "y", usage })).toEqual(usage);
    expect(parseUsage({ usage: { ...usage, failed: 1.5 } })).toBeNull();
    expect(parseUsage("x")).toBeNull();
  });
});
