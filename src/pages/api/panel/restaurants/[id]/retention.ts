import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import {
  getRestaurantRetention,
  MAX_GUEST_RETENTION_DAYS,
  MIN_GUEST_RETENTION_DAYS,
  parseRetentionDays,
  parseRetentionDaysText,
  previewRetentionChange,
  privacyMessages,
  RETENTION_EDIT_ROLES,
  RETENTION_VIEW_ROLES,
  RetentionPatchBody,
  setRestaurantRetention,
} from "@/lib/privacy";

export const prerender = false;

// The restaurant's guest data term (privacy-retention, S-26; FR-040, NFR-019): GET → RetentionSettingsDto for owners
// and managers (and the platform administrator in support mode, logged); PATCH { guestRetentionDays } owners only — a
// restaurant setting (PRD Access Control). A waiter, a manager writing, another restaurant and unknown or malformed
// ids → the identical 404 of the central guard. A shorter term applies at once: the next read of an event past it
// deletes its guests' data (and the daily run deletes it the next night).
//
// GET ?days=<n> (retention-preview, the PR #4 review's decision 6) — owners only, like the PATCH it precedes (support
// mode reads it, logged): RetentionPreviewDto, how many events with guest data the term <n> would purge at once that
// the current term keeps (and the latest one's date). The owner's form asks before saving when it is above 0. A number
// outside 1–365 → 400 with the form's message; a manager → the identical 404.
export const GET: APIRoute = async ({ locals, params, url }) => {
  const daysText = url.searchParams.get("days");
  const api = await panelRestaurantApi(
    locals,
    params.id,
    daysText === null ? RETENTION_VIEW_ROLES : RETENTION_EDIT_ROLES,
  );
  if (api instanceof Response) {
    return api;
  }
  if (daysText !== null) {
    const days = parseRetentionDaysText(daysText);
    if (!days.ok) {
      return jsonError(
        400,
        privacyMessages(locals.locale).daysRange(MIN_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS),
      );
    }
    const preview = await previewRetentionChange(api.db, api.restaurant.id, days.days, new Date());
    return preview ? jsonResponse(preview) : denied(locals);
  }
  const settings = await getRestaurantRetention(api.db, api.restaurant.id);
  return settings ? jsonResponse(settings) : denied(locals);
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = await panelRestaurantApi(locals, params.id, RETENTION_EDIT_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, RetentionPatchBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const days = parseRetentionDays(body.data.guestRetentionDays);
  if (!days.ok) {
    return jsonError(400, privacyMessages(locals.locale).daysRange(MIN_GUEST_RETENTION_DAYS, MAX_GUEST_RETENTION_DAYS));
  }
  if ((await setRestaurantRetention(api.db, api.restaurant.id, days.days)) === "not-found") {
    return denied(locals);
  }
  const settings = await getRestaurantRetention(api.db, api.restaurant.id);
  return settings ? jsonResponse(settings) : denied(locals);
};
