import type { APIRoute } from "astro";
import {
  BRAND_EDIT_ROLES,
  BRAND_VIEW_ROLES,
  brandingMessages,
  getRestaurantBranding,
  parseBrandColor,
  RestaurantBrandingPatchBody,
  updateRestaurantBranding,
} from "@/lib/branding";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import { parseRestaurantName, restaurantNameProblem } from "@/lib/platform";

export const prerender = false;

// The restaurant's brand (event-branding, S-18, FR-032): GET → RestaurantBrandingDto for owners and managers (and the
// platform administrator in support mode, logged); PATCH { name?, color?: string | null } owners only — restaurant
// settings are the owner's (PRD Access Control). A waiter, a manager writing, another restaurant and unknown or
// malformed ids → the identical 404 of the central guard.
export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, BRAND_VIEW_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const branding = await getRestaurantBranding(api.db, api.restaurant.id);
  return branding ? jsonResponse(branding) : denied(locals);
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = await panelRestaurantApi(locals, params.id, BRAND_EDIT_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, RestaurantBrandingPatchBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const change: { name?: string; color?: string | null } = {};
  if (body.data.name !== undefined) {
    const name = parseRestaurantName(body.data.name);
    if (!name.ok) {
      return jsonError(400, restaurantNameProblem(name.reason, locals.locale));
    }
    change.name = name.name;
  }
  if (body.data.color !== undefined) {
    const color = parseBrandColor(body.data.color);
    if (!color.ok) {
      return jsonError(400, brandingMessages(locals.locale).colorInvalid);
    }
    change.color = color.color;
  }
  await updateRestaurantBranding(api.db, api.restaurant.id, change);
  const branding = await getRestaurantBranding(api.db, api.restaurant.id);
  return branding ? jsonResponse(branding) : denied(locals);
};
