import type { APIRoute } from "astro";
import { clearedSessionCookie, formField, LOGIN_PATH, logout, readFormBody, seeOther } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// Logout (staff-accounts, F-03): ends this device's session, or with `wszedzie=1` every session of the person, clears
// the cookie and goes to the login page. Without a session it answers the same (nothing to end).

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const db = getDb();
  if (db && locals.staff) {
    await logout(db, locals.staff, { everywhere: formField(form, "wszedzie") === "1" });
  }
  return seeOther(`${LOGIN_PATH}?wylogowano=1`, {
    "Set-Cookie": clearedSessionCookie({ secure: url.protocol === "https:" }),
  });
};
