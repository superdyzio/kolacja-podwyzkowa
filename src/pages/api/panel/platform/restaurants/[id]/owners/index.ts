import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelPlatformApi, parseIntId } from "@/lib/panel-api";
import {
  AddOwnerBody,
  addRestaurantOwner,
  listPlatformRestaurants,
  ownerInputProblem,
  parseOwnerInput,
} from "@/lib/platform";

export const prerender = false;

// One more owner of a restaurant (platform-restaurants, S-10), platform admin only — e.g. the default restaurant of
// multi-tenant-events, which starts without one. POST { email, name? } → the whole list and the owner with their
// one-time invitation (none when the account already has a password). Unknown or malformed id → the identical 404.

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseIntId(params.id);
  if (id === null) {
    return denied(locals);
  }
  const body = await readJsonBody(request, AddOwnerBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const owner = parseOwnerInput({ email: body.data.email, name: body.data.name });
  if (!owner.ok) {
    return jsonError(400, ownerInputProblem(owner.reason, locals.locale));
  }
  const result = await addRestaurantOwner(
    api.db,
    id,
    { email: owner.email, displayName: owner.displayName },
    api.staff.accountId,
  );
  if (result.status === "not-found") {
    return denied(locals);
  }
  return jsonResponse({ restaurants: await listPlatformRestaurants(api.db), owner: result.owner });
};
