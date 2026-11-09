import type { APIRoute } from "astro";
import { changePassword, formField, PANEL_PATH, readFormBody, seeOther } from "@/lib/auth";
import { httpMessages, jsonError } from "@/lib/http";
import { panelApi } from "@/lib/panel-api";

export const prerender = false;

// Password change from the panel (staff-accounts, F-03): POST current + password + repeat. The current password goes
// through the same throttle as the login. Success → every OTHER session of the person ends, this one stays (303 to the
// panel with a note). Errors → 303 to the panel's password form with a code.

const ERROR_CODES = {
  "wrong-current": "obecne",
  throttled: "limit",
  "too-short": "krotkie",
  "too-long": "dlugie",
  mismatch: "rozne",
} as const;

export const POST: APIRoute = async ({ request, locals }) => {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const form = await readFormBody(request);
  if (form === "too-large") {
    return jsonError(413, httpMessages(locals.locale).tooLarge);
  }
  const result = await changePassword(api.db, api.staff, {
    current: formField(form, "current"),
    password: formField(form, "password"),
    repeat: formField(form, "repeat"),
  });
  if (result.status === "ok") {
    return seeOther(`${PANEL_PATH}?haslo=zmienione`);
  }
  return seeOther(`${PANEL_PATH}?blad=${ERROR_CODES[result.status]}#haslo`);
};
