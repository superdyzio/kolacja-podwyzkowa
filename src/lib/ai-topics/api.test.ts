import { describe, expect, it } from "vitest";
import { GenerateTopicBody } from "./api";

describe("AI topic request body", () => {
  it("takes a stored category or null", () => {
    expect(GenerateTopicBody.safeParse({ category: null }).success).toBe(true);
    expect(GenerateTopicBody.safeParse({ category: "kontrowersyjne" }).success).toBe(true);
    expect(GenerateTopicBody.safeParse({ category: "polityczne" }).success).toBe(false);
    expect(GenerateTopicBody.safeParse({}).success).toBe(false);
  });

  it("refuses extra keys such as a guest id", () => {
    expect(GenerateTopicBody.safeParse({ category: null, guestId: 7 }).success).toBe(false);
    expect(GenerateTopicBody.safeParse({ category: null, topic: "x" }).success).toBe(false);
  });
});
