import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import {
  getRestaurantRetention,
  MAX_GUEST_RETENTION_DAYS,
  MIN_GUEST_RETENTION_DAYS,
  parseRetentionDays,
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
// deletes its guests' data.
export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, RETENTION_VIEW_ROLES);
  if (api instanceof Response) {
    return api;
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
