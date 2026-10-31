import { describe, expect, it } from "vitest";
import { parseAccessPath } from "@/lib/access/paths";
import { formatGuestLinksSummary } from "./summary";
import { guestUrl, isLocalOrigin } from "./links";

const KEY = "AbCdEfGhIjKlMnOpQrStUv-_";

describe("guestUrl", () => {
  it.each([
    ["https://kolacja.example.pl", `https://kolacja.example.pl/g/${KEY}`],
    ["http://localhost:4321", `http://localhost:4321/g/${KEY}`],
    ["http://192.168.1.23:4321", `http://192.168.1.23:4321/g/${KEY}`],
  ])("builds the personal link on %s", (origin, expected) => {
    expect(guestUrl(origin, KEY)).toBe(expected);
  });

  it("points at a guest path the middleware recognises", () => {
    expect(parseAccessPath(new URL(guestUrl("https://kolacja.example.pl", KEY)).pathname)).toEqual({
      role: "guest",
      key: KEY,
      isApi: false,
    });
  });
});

describe("isLocalOrigin", () => {
  it.each([
    "http://localhost:4321",
    "http://127.0.0.1:4321",
    "http://[::1]:4321",
    "http://0.0.0.0:4321",
    "http://app.localhost",
  ])("flags %s", (origin) => {
    expect(isLocalOrigin(origin)).toBe(true);
  });

  it.each(["http://192.168.1.23:4321", "https://kolacja.example.pl", "https://localhost.example.pl", "not a url"])(
    "does not flag %s",
    (origin) => {
      expect(isLocalOrigin(origin)).toBe(false);
    },
  );
});

describe("formatGuestLinksSummary", () => {
  it.each([
    [true, 38, "Dostęp gości: włączony · 38 linków"],
    [false, 1, "Dostęp gości: wyłączony · 1 link"],
    [false, 2, "Dostęp gości: wyłączony · 2 linki"],
    [true, 5, "Dostęp gości: włączony · 5 linków"],
    [true, 22, "Dostęp gości: włączony · 22 linki"],
    [true, 12, "Dostęp gości: włączony · 12 linków"],
    [false, 0, "Dostęp gości: wyłączony · brak gości"],
  ])("enabled %s, %i guests → %s", (enabled, guestCount, expected) => {
    expect(formatGuestLinksSummary({ enabled, guestCount })).toBe(expected);
  });
});
