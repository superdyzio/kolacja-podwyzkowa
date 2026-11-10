import type { APIRoute } from "astro";
import { readFormBody, seeOther } from "@/lib/auth/forms";
import { getDb } from "@/lib/db";
import { clearedWaiterCookie, logoutWaiter, WAITER_ENTRY_PATH } from "@/lib/event-waiters";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// The per-event waiter's logout (event-waiter-access, S-21b): ends this waiter's session, clears the cookie and goes
// to the entry page. The link and the code were used up at the entry, so getting back in needs a new waiter from the
// manager (the page says so before the button). Without a session it answers the same.

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const db = getDb();
  if (db && locals.waiter) {
    await logoutWaiter(db, locals.waiter.waiterId);
  }
  return seeOther(`${WAITER_ENTRY_PATH}?wylogowano=1`, {
    "Set-Cookie": clearedWaiterCookie({ secure: url.protocol === "https:" }),
  });
};
