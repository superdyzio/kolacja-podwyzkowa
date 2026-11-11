import { describe, expect, it } from "vitest";
import { AddOwnerBody, CreateRestaurantBody, UpdateRestaurantBody } from "./api";
import { ownerInputProblem, platformMessages, restaurantNameProblem } from "./messages";
import { OWNER_NAME_MAX, RESTAURANT_NAME_MAX, parseOwnerInput, parseRestaurantName } from "./rules";
import { formatRestaurantCounters } from "./summary";

describe("parseRestaurantName", () => {
  it("normalizes spaces and invisible characters", () => {
    expect(parseRestaurantName("  Pod ​Lipą \t  i Dębem ")).toEqual({ ok: true, name: "Pod Lipą i Dębem" });
  });

  it("refuses an empty name", () => {
    expect(parseRestaurantName("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseRestaurantName("​")).toEqual({ ok: false, reason: "empty" });
  });

  it("counts code points up to the limit", () => {
    expect(parseRestaurantName("a".repeat(RESTAURANT_NAME_MAX))).toMatchObject({ ok: true });
    expect(parseRestaurantName("a".repeat(RESTAURANT_NAME_MAX + 1))).toEqual({ ok: false, reason: "too-long" });
    expect(parseRestaurantName("🍽".repeat(RESTAURANT_NAME_MAX))).toMatchObject({ ok: true });
  });
});

describe("parseOwnerInput", () => {
  it("normalizes the e-mail and drops an empty name", () => {
    expect(parseOwnerInput({ email: "  Ania@Example.PL ", name: "  " })).toEqual({
      ok: true,
      email: "ania@example.pl",
      displayName: null,
    });
    expect(parseOwnerInput({ email: "jan@example.pl" })).toEqual({
      ok: true,
      email: "jan@example.pl",
      displayName: null,
    });
  });

  it("keeps a normalized name", () => {
    expect(parseOwnerInput({ email: "jan@example.pl", name: " Jan   Kowalski " })).toEqual({
      ok: true,
      email: "jan@example.pl",
      displayName: "Jan Kowalski",
    });
  });

  it("refuses a bad e-mail and a too long name", () => {
    expect(parseOwnerInput({ email: "jan@example" })).toEqual({ ok: false, reason: "email" });
    expect(parseOwnerInput({ email: "" })).toEqual({ ok: false, reason: "email" });
    expect(parseOwnerInput({ email: "jan@example.pl", name: "x".repeat(OWNER_NAME_MAX + 1) })).toEqual({
      ok: false,
      reason: "name-too-long",
    });
  });
});

describe("request bodies", () => {
  it("accept the documented shapes", () => {
    expect(CreateRestaurantBody.safeParse({ name: "A", ownerEmail: "a@b.pl" }).success).toBe(true);
    expect(CreateRestaurantBody.safeParse({ name: "A", ownerEmail: "a@b.pl", ownerName: null }).success).toBe(true);
    expect(AddOwnerBody.safeParse({ email: "a@b.pl", name: "Ala" }).success).toBe(true);
    expect(UpdateRestaurantBody.safeParse({ disabled: true }).success).toBe(true);
  });

  it("refuse extra fields and wrong types", () => {
    expect(CreateRestaurantBody.safeParse({ name: "A", ownerEmail: "a@b.pl", id: 1 }).success).toBe(false);
    expect(CreateRestaurantBody.safeParse({ name: "A" }).success).toBe(false);
    expect(AddOwnerBody.safeParse({ email: 5 }).success).toBe(false);
    expect(UpdateRestaurantBody.safeParse({ disabled: "yes" }).success).toBe(false);
    expect(UpdateRestaurantBody.safeParse({}).success).toBe(false);
  });
});

describe("texts", () => {
  it("format the counters in both languages", () => {
    expect(formatRestaurantCounters({ eventCount: 3, memberCount: 2 })).toBe("Wydarzenia: 3 · Zespół: 2");
    expect(formatRestaurantCounters({ eventCount: 1, memberCount: 0 }, "en")).toBe("Events: 1 · Team: 0");
  });

  it("give the rule messages in the request's language", () => {
    expect(restaurantNameProblem("empty")).toBe(platformMessages("pl").nameEmpty);
    expect(restaurantNameProblem("too-long", "en")).toBe(platformMessages("en").nameTooLong);
    expect(ownerInputProblem("email", "en")).toBe(platformMessages("en").emailInvalid);
    expect(ownerInputProblem("name-too-long")).toContain(String(OWNER_NAME_MAX));
  });
});
