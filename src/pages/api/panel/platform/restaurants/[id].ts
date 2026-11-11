import type { APIRoute } from "astro";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelPlatformApi, parseIntId } from "@/lib/panel-api";
import { listPlatformRestaurants, setRestaurantDisabled, UpdateRestaurantBody } from "@/lib/platform";

export const prerender = false;

// The on/off switch of a restaurant (platform-restaurants, S-10), platform admin only. PATCH { disabled } → the whole
// list. Off: the restaurant's staff get the identical 404 for its data at once (sessions stay; its events' links keep
// working); on: access is back. Unknown or malformed id → the identical 404.

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(params.id);
  if (id === null) {
    return denied(locals);
  }
  const body = await readJsonBody(request, UpdateRestaurantBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  if ((await setRestaurantDisabled(api.db, id, body.data.disabled)) === "not-found") {
    return denied(locals);
  }
  return jsonResponse({ restaurants: await listPlatformRestaurants(api.db) });
};
