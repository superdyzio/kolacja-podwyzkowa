import type { APIRoute } from "astro";
import { jsonResponse, parseId } from "@/lib/http";
import { denied, panelPlatformApi, parseIntId } from "@/lib/panel-api";
import { issueOwnerLink, listPlatformRestaurants } from "@/lib/platform";

export const prerender = false;

// A fresh one-time link for an owner of the restaurant (platform-restaurants, S-10; US-05: a lost password never
// locks the restaurant out), platform admin only. POST (no body) → the whole list and the link: an invitation while
// the owner has no password, else a password-reset link; their earlier unused link stops working. Anyone who is not
// an owner of that restaurant, unknown or malformed ids → the identical 404.

export const POST: APIRoute = async ({ locals, params }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const restaurantId = parseIntId(params.id);
  const accountId = parseId(params.accountId);
  if (restaurantId === null || accountId === null) {
    return denied(locals);
  }
  const result = await issueOwnerLink(api.db, restaurantId, accountId, api.staff.accountId);
  if (result.status === "not-found") {
    return denied(locals);
  }
  return jsonResponse({ restaurants: await listPlatformRestaurants(api.db), link: result.link });
};
