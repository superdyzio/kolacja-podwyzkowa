import type { APIRoute } from "astro";
import {
  formField,
  isWellFormedSecretToken,
  logout,
  PANEL_PATH,
  readFormBody,
  redeemStaffToken,
  seeOther,
  sessionCookie,
  setPasswordPath,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { httpMessages, jsonError } from "@/lib/http";

export const prerender = false;

// Setting a password from a one-time link (invitation or reset; staff-accounts, F-03): POST token + password + repeat.
// Success → the link is used up, every earlier session of the account ends, and the person is logged in here (303 to
// the panel with a new session cookie). A too short / too long / mismatched password → back to the link's page with
// a code (the link stays valid). An unknown, used or expired link → back to its page, which says the link is invalid.

const ERROR_CODES = { "too-short": "krotkie", "too-long": "dlugie", mismatch: "rozne" } as const;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const token = formField(form, "token");
  // The redirect target never carries anything but a well-formed token.
  const linkPage = setPasswordPath(isWellFormedSecretToken(token) ? token : "nieprawidlowy");
  const db = getDb();
  if (!db) {
    return seeOther(`${linkPage}?blad=baza`);
  }
  const result = await redeemStaffToken(db, token, {
    password: formField(form, "password"),
    repeat: formField(form, "repeat"),
  });
  switch (result.status) {
    case "ok":
      if (locals.staff) {
        await logout(db, locals.staff);
      }
      return seeOther(PANEL_PATH, {
        "Set-Cookie": sessionCookie(result.session.token, { secure: url.protocol === "https:" }),
      });
    case "invalid-token":
      return seeOther(linkPage);
    default:
      return seeOther(`${linkPage}?blad=${ERROR_CODES[result.status]}`);
  }
};
