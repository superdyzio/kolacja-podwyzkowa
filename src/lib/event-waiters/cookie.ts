import { readCookieToken } from "@/lib/auth/cookie";

// The per-event waiter's session cookie (event-waiter-access, S-21b): its OWN name, so the staff panel never reads it
// and the waiter area never reads the staff session. HttpOnly, SameSite=Lax, Path=/, Secure on https, and Max-Age
// until the waiter row expires (noon after the event). Pure.

export const WAITER_COOKIE = "kp-waiter";

function attributes(maxAge: number, secure: boolean): string {
  return `Path=/; Max-Age=${String(maxAge)}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function waiterCookie(token: string, maxAgeSeconds: number, { secure }: { secure: boolean }): string {
  return `${WAITER_COOKIE}=${token}; ${attributes(maxAgeSeconds, secure)}`;
}

export function clearedWaiterCookie({ secure }: { secure: boolean }): string {
  return `${WAITER_COOKIE}=; ${attributes(0, secure)}`;
}

export function readWaiterToken(cookieHeader: string | null): string | null {
  return readCookieToken(cookieHeader, WAITER_COOKIE);
}
