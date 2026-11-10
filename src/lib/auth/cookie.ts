import { SESSION_MAX_AGE_SECONDS } from "./limits";

// The staff session cookie (staff-accounts, F-03). Built as a plain Set-Cookie string so routes and the middleware can
// put it on any Response (the middleware rebuilds responses; plain headers survive that). HttpOnly (no script reads
// it), SameSite=Lax (not sent with cross-site subrequests or form posts), Path=/ (pages and /api/…), Secure whenever
// the request came over https (behind the Lambda proxy too: Astro trusts X-Forwarded-Proto, so context.url is https).
// Pure.

export const SESSION_COOKIE = "kp-session";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function attributes(maxAge: number, secure: boolean): string {
  return `Path=/; Max-Age=${String(maxAge)}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function sessionCookie(token: string, { secure }: { secure: boolean }): string {
  return `${SESSION_COOKIE}=${token}; ${attributes(SESSION_MAX_AGE_SECONDS, secure)}`;
}

export function clearedSessionCookie({ secure }: { secure: boolean }): string {
  return `${SESSION_COOKIE}=; ${attributes(0, secure)}`;
}

// A secret token (43 characters of base64url) from the cookie `name` of a Cookie request header, or null when absent
// or malformed (a garbage cookie never reaches the database). Also the per-event waiter's cookie (event-waiter-access).
export function readCookieToken(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return TOKEN_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

// The staff session token from a Cookie request header, or null when absent or not a well-formed token.
export function readSessionToken(cookieHeader: string | null): string | null {
  return readCookieToken(cookieHeader, SESSION_COOKIE);
}
