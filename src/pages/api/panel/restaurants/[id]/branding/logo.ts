import type { APIRoute } from "astro";
import {
  BRAND_EDIT_ROLES,
  BRAND_VIEW_ROLES,
  deleteRestaurantLogo,
  getRestaurantBranding,
  getRestaurantLogo,
  logoResponse,
  saveRestaurantLogo,
  uploadLogo,
} from "@/lib/branding";
import { jsonResponse } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";

export const prerender = false;

// The restaurant's logo (event-branding, S-18): GET (owners, managers; image, nosniff), PUT <image bytes> and DELETE
// (owners only; PNG, JPEG, WebP by magic bytes, ≤ 512 KiB; 400 empty, 413, 415) → RestaurantBrandingDto. The Origin
// check of /api/panel/ mutations runs in the middleware before this.
export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, BRAND_VIEW_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return logoResponse(await getRestaurantLogo(api.db, api.restaurant.id), locals.locale);
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = await panelRestaurantApi(locals, params.id, BRAND_EDIT_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const failed = await uploadLogo(request, locals.locale, (bytes) =>
    saveRestaurantLogo(api.db, api.restaurant.id, bytes),
  );
  if (failed) {
    return failed;
  }
  const branding = await getRestaurantBranding(api.db, api.restaurant.id);
  return branding ? jsonResponse(branding) : denied(locals);
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, BRAND_EDIT_ROLES);
  if (api instanceof Response) {
    return api;
  }
  await deleteRestaurantLogo(api.db, api.restaurant.id);
  const branding = await getRestaurantBranding(api.db, api.restaurant.id);
  return branding ? jsonResponse(branding) : denied(locals);
};
