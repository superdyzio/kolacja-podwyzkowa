import type { APIRoute } from "astro";
import { formField, login, LOGIN_PATH, logout, PANEL_PATH, readFormBody, seeOther, sessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// The login form (staff-accounts, F-03): POST email + password (form-encoded, same-origin Origin checked by the
// middleware). Success → 303 to the panel with a new 30-day session cookie (a session this device already had ends).
// Every failure → 303 back to the login page with a code: `dane` for an unknown e-mail, an account without a password
// and a wrong password alike, `limit` after too many failures for that e-mail (the password was not even checked).

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const db = getDb();
  if (!db) {
    return seeOther(`${LOGIN_PATH}?blad=baza`);
  }
  const result = await login(db, { email: formField(form, "email"), password: formField(form, "password") });
  switch (result.status) {
    case "ok":
      if (locals.staff) {
        await logout(db, locals.staff);
      }
      return seeOther(PANEL_PATH, {
        "Set-Cookie": sessionCookie(result.session.token, { secure: url.protocol === "https:" }),
      });
    case "invalid":
      return seeOther(`${LOGIN_PATH}?blad=dane`);
    case "throttled":
      return seeOther(`${LOGIN_PATH}?blad=limit`, { "Retry-After": String(result.retryAfterSeconds) });
  }
};
