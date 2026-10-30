import { describe, expect, it } from "vitest";
import { ResetCountsSchema, ResetEventAnswerSchema, ResetRequestBody } from "./api";
import { RESET_PARTS } from "./parts";

const COUNTS = {
  guesses: 1,
  correctAmountSet: false,
  intakeOpen: true,
  aiAttempts: 0,
  aiUsed: 0,
  seats: 0,
  pinned: 0,
  snapshots: 0,
  guests: 1,
  groups: 0,
  plan: false,
  rooms: 0,
  tables: 0,
  questions: 90,
  guestAccessEnabled: false,
};

describe("reset request body", () => {
  it("takes one or more known part ids", () => {
    expect(ResetRequestBody.safeParse({ parts: ["guesses"] }).success).toBe(true);
    expect(ResetRequestBody.safeParse({ parts: [...RESET_PARTS] }).success).toBe(true);
  });

  it("refuses an empty list, unknown ids, too many entries and extra keys", () => {
    expect(ResetRequestBody.safeParse({ parts: [] }).success).toBe(false);
    expect(ResetRequestBody.safeParse({ parts: ["event"] }).success).toBe(false);
    expect(ResetRequestBody.safeParse({ parts: [...RESET_PARTS, "guests"] }).success).toBe(false);
    expect(ResetRequestBody.safeParse({ parts: ["guests"], organizerKey: "x" }).success).toBe(false);
    expect(ResetRequestBody.safeParse({}).success).toBe(false);
    expect(ResetRequestBody.safeParse({ parts: "guests" }).success).toBe(false);
  });
});

describe("reset DB answers", () => {
  it("accept the shape the DB functions return", () => {
    expect(ResetCountsSchema.safeParse(COUNTS).success).toBe(true);
    expect(
      ResetEventAnswerSchema.safeParse({ parts: ["guesses"], before: COUNTS, questionsAdded: 0, guestKeysReplaced: 0 })
        .success,
    ).toBe(true);
  });

  it("refuse drifted or malformed answers", () => {
    const { guests: _guests, ...withoutGuests } = COUNTS;
    expect(ResetCountsSchema.safeParse(withoutGuests).success).toBe(false);
    expect(ResetCountsSchema.safeParse({ ...COUNTS, extra: 1 }).success).toBe(false);
    expect(ResetCountsSchema.safeParse({ ...COUNTS, guests: -1 }).success).toBe(false);
    expect(
      ResetEventAnswerSchema.safeParse({ parts: ["nope"], before: COUNTS, questionsAdded: 0, guestKeysReplaced: 0 })
        .success,
    ).toBe(false);
    expect(ResetEventAnswerSchema.safeParse({ parts: ["guesses"], before: COUNTS }).success).toBe(false);
  });
});
