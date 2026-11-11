import type { APIRoute } from "astro";
import { formField, readFormBody, seeOther } from "@/lib/auth/forms";
import { getDb } from "@/lib/db";
import {
  logoutWaiter,
  redeemWaiterCode,
  redeemWaiterLink,
  WAITER_ENTRY_PATH,
  WAITER_ERRORS,
  waiterCookie,
  waiterCookieMaxAge,
  waiterFloorPath,
} from "@/lib/event-waiters";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// The per-event waiter's entry (event-waiter-access, S-21b): a plain form post (same-origin Origin checked by the
// middleware) with either `link` (the one-time link's token, from /kelner/<token>) or `kod` (typed on /kelner). Success
// → 303 to the floor of that event with the waiter cookie (until noon after the event); the link and the code are both
// used up. Every failure — unknown, used, expired, malformed, revoked, outside the event's window — → 303 to /kelner
// with the ONE code `niewazny`; too many tries of a code → `limit` with Retry-After. A waiter session this browser
// already had ends first (one waiter per device).

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const db = getDb();
  if (!db) {
    return seeOther(`${WAITER_ENTRY_PATH}?blad=${WAITER_ERRORS.db}`);
  }
  const now = new Date();
  const link = formField(form, "link");
  const result = link ? await redeemWaiterLink(db, link, now) : await redeemWaiterCode(db, formField(form, "kod"), now);
  switch (result.status) {
    case "ok":
      if (locals.waiter) {
        await logoutWaiter(db, locals.waiter.waiterId);
      }
      return seeOther(waiterFloorPath(result.session.eventId), {
        "Set-Cookie": waiterCookie(result.session.token, waiterCookieMaxAge(result.session.expiresAt, now), {
          secure: url.protocol === "https:",
        }),
      });
    case "invalid":
      return seeOther(`${WAITER_ENTRY_PATH}?blad=${WAITER_ERRORS.invalid}`);
    case "throttled":
      return seeOther(`${WAITER_ENTRY_PATH}?blad=${WAITER_ERRORS.limit}`, {
        "Retry-After": String(result.retryAfterSeconds),
      });
  }
};
