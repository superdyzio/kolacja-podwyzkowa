import { describe, expect, it } from "vitest";
import { readSessionToken } from "@/lib/auth/cookie";
import { clearedWaiterCookie, readWaiterToken, waiterCookie, WAITER_COOKIE } from "./cookie";
import { eventWaiterMessages, waiterErrorText } from "./messages";
import { classifyWaiterPath, waiterFloorApiBase, waiterFloorPath, waiterLinkPath } from "./paths";
import {
  canAddWaiter,
  formatWaiterCode,
  parseWaiterCode,
  parseWaiterName,
  WAITER_CODE_ALPHABET,
  waiterCookieMaxAge,
  waiterStatus,
} from "./rules";

// event-waiter-access (S-21b): the pure rules of the per-event waiter.

const TOKEN = "a".repeat(43);

describe("the code", () => {
  it("uses an alphabet without characters a phone keyboard confuses", () => {
    expect(WAITER_CODE_ALPHABET).toHaveLength(31);
    for (const character of "01OIL") {
      expect(WAITER_CODE_ALPHABET).not.toContain(character);
    }
    expect(new Set(WAITER_CODE_ALPHABET).size).toBe(WAITER_CODE_ALPHABET.length);
  });

  it("formats as <id>-XXXX-XXXX and parses back", () => {
    const code = formatWaiterCode(57, "K7MQX3PA");
    expect(code).toBe("57-K7MQ-X3PA");
    expect(parseWaiterCode(code)).toEqual({ waiterId: 57, secret: "K7MQX3PA" });
  });

  it("takes the code in any case, with spaces or dashes between the groups", () => {
    for (const typed of ["57-k7mq-x3pa", " 57 K7MQ X3PA ", "57-K7MQX3PA", "57 - k7mq - x3pa", "57--K7MQ--X3PA"]) {
      expect(parseWaiterCode(typed)).toEqual({ waiterId: 57, secret: "K7MQX3PA" });
    }
  });

  it("refuses malformed codes", () => {
    for (const typed of [
      "",
      "57",
      "K7MQ-X3PA",
      "57K7MQX3PA",
      "057-K7MQ-X3PA",
      "57-K7MQ-X3P",
      "57-K7MQ-X3PAB",
      "57-K7MO-X3PA",
      "57-K7M0-X3PA",
      "57-K7M1-X3PA",
      "57-K7MI-X3PA",
      "57-K7ML-X3PA",
      "57-K7-MQ-X3PA",
      "99999999999999999-K7MQ-X3PA",
    ]) {
      expect(parseWaiterCode(typed), typed).toBeNull();
    }
  });
});

describe("the name", () => {
  it("is normalized like a guest's name, 1–40 code points", () => {
    expect(parseWaiterName("  Kuba   K. ")).toEqual({ ok: true, name: "Kuba K." });
    expect(parseWaiterName("   ")).toEqual({ ok: false, problem: "empty" });
    expect(parseWaiterName("x".repeat(40))).toEqual({ ok: true, name: "x".repeat(40) });
    expect(parseWaiterName("x".repeat(41))).toEqual({ ok: false, problem: "too-long" });
  });
});

describe("status and window", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("is expired once the time is up, else redeemed or unused", () => {
    expect(waiterStatus({ redeemedAt: null, expiresAt: "2026-11-11T11:00:00Z" }, now)).toBe("unused");
    expect(waiterStatus({ redeemedAt: "2026-11-10T11:00:00Z", expiresAt: "2026-11-11T11:00:00Z" }, now)).toBe(
      "redeemed",
    );
    expect(waiterStatus({ redeemedAt: null, expiresAt: "2026-11-10T12:00:00Z" }, now)).toBe("expired");
  });

  it("may be added for today's and upcoming events, never archived or past ones (noon rule)", () => {
    // 2026-11-11 11:59 Warsaw (CET, UTC+1) = 10:59Z: yesterday's event is still today.
    expect(canAddWaiter("2026-11-10", null, new Date("2026-11-11T10:59:00Z"))).toBe(true);
    expect(canAddWaiter("2026-11-10", null, new Date("2026-11-11T11:00:00Z"))).toBe(false);
    expect(canAddWaiter("2026-11-12", null, now)).toBe(true);
    expect(canAddWaiter("2026-11-10", "2026-11-10T08:00:00Z", now)).toBe(false);
  });

  it("gives the cookie the seconds until the expiry, at least one", () => {
    expect(waiterCookieMaxAge("2026-11-10T13:00:00Z", now)).toBe(3600);
    expect(waiterCookieMaxAge("2026-11-10T11:00:00Z", now)).toBe(1);
  });
});

describe("paths and cookie", () => {
  it("classifies the waiter's areas (floor before the general patterns)", () => {
    expect(classifyWaiterPath("/kelner")).toBe("waiter-entry");
    expect(classifyWaiterPath("/kelner/")).toBe("waiter-entry");
    expect(classifyWaiterPath(waiterLinkPath(TOKEN))).toBe("waiter-entry");
    expect(classifyWaiterPath(waiterFloorPath(12))).toBe("waiter-floor");
    expect(classifyWaiterPath("/kelner/sala")).toBe("waiter-floor");
    expect(classifyWaiterPath(`${waiterFloorApiBase(12)}/orders`)).toBe("waiter-floor-api");
    expect(classifyWaiterPath("/api/kelner/wejscie")).toBe("waiter-api");
    expect(classifyWaiterPath("/api/kelner/wyloguj")).toBe("waiter-api");
    for (const other of [
      "/kelnerzy",
      "/panel/obsluga/1",
      "/api/panel/events/1/obsluga/orders",
      "/o/x",
      "/",
      "/kelner/a/b",
    ]) {
      expect(classifyWaiterPath(other), other).toBeNull();
    }
  });

  it("builds and reads its own cookie, never the staff session's", () => {
    expect(waiterCookie(TOKEN, 600, { secure: true })).toBe(
      `${WAITER_COOKIE}=${TOKEN}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(clearedWaiterCookie({ secure: false })).toBe(`${WAITER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    expect(readWaiterToken(`kp-session=${"b".repeat(43)}; ${WAITER_COOKIE}=${TOKEN}`)).toBe(TOKEN);
    expect(readWaiterToken(`kp-session=${TOKEN}`)).toBeNull();
    expect(readSessionToken(`${WAITER_COOKIE}=${TOKEN}`)).toBeNull();
    expect(readWaiterToken(`${WAITER_COOKIE}=short`)).toBeNull();
  });
});

describe("texts", () => {
  it("exist in both languages and map the entry page's error codes", () => {
    expect(eventWaiterMessages("en").heading).not.toBe(eventWaiterMessages("pl").heading);
    expect(waiterErrorText("niewazny", "pl")).toBe(eventWaiterMessages("pl").invalid);
    expect(waiterErrorText("limit", "en")).toBe(eventWaiterMessages("en").limit);
    expect(waiterErrorText("cokolwiek")).toBeNull();
  });
});
