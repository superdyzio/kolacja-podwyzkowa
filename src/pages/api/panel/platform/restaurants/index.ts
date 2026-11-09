import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { panelPlatformApi } from "@/lib/panel-api";
import {
  CreateRestaurantBody,
  createRestaurantWithOwner,
  listPlatformRestaurants,
  ownerInputProblem,
  parseOwnerInput,
  parseRestaurantName,
  restaurantNameProblem,
} from "@/lib/platform";

export const prerender = false;

// The platform's restaurants (platform-restaurants, S-10), platform admin only (anyone else: the identical 404).
// GET → the list with counters and owners. POST { name, ownerEmail, ownerName? } → a new restaurant with its owner in
// one transaction, plus the owner's one-time invitation (none when the account already has a password) → 201.

export const GET: APIRoute = async ({ locals }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse({ restaurants: await listPlatformRestaurants(api.db) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, CreateRestaurantBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const name = parseRestaurantName(body.data.name);
  if (!name.ok) {
    return jsonError(400, restaurantNameProblem(name.reason, locals.locale));
  }
  const owner = parseOwnerInput({ email: body.data.ownerEmail, name: body.data.ownerName });
  if (!owner.ok) {
    return jsonError(400, ownerInputProblem(owner.reason, locals.locale));
  }
  const result = await createRestaurantWithOwner(
    api.db,
    { name: name.name, owner: { email: owner.email, displayName: owner.displayName } },
    api.staff.accountId,
  );
  return jsonResponse(
    {
      restaurants: await listPlatformRestaurants(api.db),
      restaurantId: result.restaurantId,
      owner: result.owner,
    },
    201,
  );
};
