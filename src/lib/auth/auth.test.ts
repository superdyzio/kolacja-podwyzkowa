import { describe, expect, it } from "vitest";
import { clearedSessionCookie, readSessionToken, sessionCookie, SESSION_COOKIE } from "./cookie";
import { loginKeyHash, normalizeEmail } from "./email";
import { SESSION_MAX_AGE_SECONDS } from "./limits";
import { authErrorText, authMessages } from "./messages";
import { isMutation, isSameOrigin } from "./origin";
import { AUTH_AREA_HEADERS, classifyAuthPath, setPasswordPath } from "./paths";
import { generateSecretToken, hashSecretToken, isWellFormedSecretToken } from "./tokens";

describe("secret tokens", () => {
  it("are 43 base64url characters and differ every time", () => {
    const a = generateSecretToken();
    const b = generateSecretToken();
    expect(isWellFormedSecretToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isWellFormedSecretToken(`${a}x`)).toBe(false);
    expect(isWellFormedSecretToken(`${"a".repeat(42)}+`)).toBe(false);
    expect(isWellFormedSecretToken(null)).toBe(false);
  });

  it("hash to 64 lowercase hex characters (SHA-256)", () => {
    expect(hashSecretToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashSecretToken(generateSecretToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("e-mail", () => {
  it("is trimmed and lowercased, odd shapes refused", () => {
    expect(normalizeEmail("  Ania.Kowalska@Example.PL ")).toBe("ania.kowalska@example.pl");
    expect(normalizeEmail("ania@example")).toBeNull();
    expect(normalizeEmail("ania kowalska@example.pl")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@x.pl`)).toBeNull();
  });

  it("gives one throttle key per typed address, whatever the case or spaces", () => {
    expect(loginKeyHash(" Ania@Example.pl")).toBe(loginKeyHash("ania@example.pl "));
    expect(loginKeyHash("ania@example.pl")).not.toBe(loginKeyHash("ola@example.pl"));
    expect(loginKeyHash("not an e-mail")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("session cookie", () => {
  const token = generateSecretToken();

  it("is HttpOnly, SameSite=Lax, for the whole site, 30 days, Secure only on https", () => {
    const plain = sessionCookie(token, { secure: false });
    expect(plain).toBe(
      `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${String(SESSION_MAX_AGE_SECONDS)}; HttpOnly; SameSite=Lax`,
    );
    expect(SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
    expect(sessionCookie(token, { secure: true }).endsWith("; Secure")).toBe(true);
  });

  it("is cleared with Max-Age=0", () => {
    expect(clearedSessionCookie({ secure: false })).toBe(
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
  });

  it("is read from the Cookie header only when well formed", () => {
    expect(readSessionToken(`kp-lang=en; ${SESSION_COOKIE}=${token}; other=1`)).toBe(token);
    expect(readSessionToken(`${SESSION_COOKIE}=garbage`)).toBeNull();
    expect(readSessionToken(`x${SESSION_COOKIE}=${token}`)).toBeNull();
    expect(readSessionToken(null)).toBeNull();
    expect(readSessionToken("")).toBeNull();
  });
});

describe("staff areas", () => {
  it.each([
    ["/panel", "panel"],
    ["/panel/", "panel"],
    ["/panel/cokolwiek/dalej", "panel"],
    ["/api/panel", "panel-api"],
    ["/api/panel/me", "panel-api"],
    ["/logowanie", "auth-page"],
    ["/logowanie/", "auth-page"],
    ["/haslo/abc", "auth-page"],
    ["/api/auth/login", "auth-api"],
    ["/panelx", null],
    ["/api/panelx", null],
    ["/logowaniex", null],
    ["/haslo", null],
    ["/haslo/a/b", null],
    ["/o/panel", null],
    ["/", null],
  ])("%s → %s", (path, area) => {
    expect(classifyAuthPath(path)).toBe(area);
  });

  it("builds the set-password path", () => {
    expect(setPasswordPath("t0k3n")).toBe("/haslo/t0k3n");
  });

  it("answer with same-origin referrers (form posts keep their Origin), no caching and no framing", () => {
    expect(AUTH_AREA_HEADERS).toEqual({
      "Cache-Control": "no-store",
      "Referrer-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
    });
  });
});

describe("origin check", () => {
  it("treats every method but GET, HEAD and OPTIONS as a mutation", () => {
    expect(["POST", "PUT", "PATCH", "DELETE", "post"].every(isMutation)).toBe(true);
    expect(["GET", "HEAD", "OPTIONS"].some(isMutation)).toBe(false);
  });

  it("needs the exact origin; a missing or null header fails", () => {
    expect(isSameOrigin("https://stolik.example", "https://stolik.example")).toBe(true);
    expect(isSameOrigin(null, "https://stolik.example")).toBe(false);
    expect(isSameOrigin("null", "https://stolik.example")).toBe(false);
    expect(isSameOrigin("http://stolik.example", "https://stolik.example")).toBe(false);
    expect(isSameOrigin("https://stolik.example.evil", "https://stolik.example")).toBe(false);
  });
});

describe("texts", () => {
  it("map known error codes in both languages and ignore others", () => {
    expect(authErrorText("dane")).toBe("Nieprawidłowy e-mail lub hasło.");
    expect(authErrorText("dane", "en")).toBe("Wrong e-mail or password.");
    expect(authErrorText("toString")).toBeNull();
    expect(authErrorText(null)).toBeNull();
    for (const locale of ["pl", "en"] as const) {
      expect(Object.keys(authMessages(locale).errors).sort()).toEqual(
        ["baza", "dane", "dlugie", "krotkie", "limit", "obecne", "rozne"].sort(),
      );
    }
  });
});
