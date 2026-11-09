import type { APIRoute } from "astro";
import { getMemberships } from "@/lib/auth";
import { jsonResponse } from "@/lib/http";
import { panelApi } from "@/lib/panel-api";

export const prerender = false;

// The logged-in person (staff-accounts, F-03): e-mail, name, the platform-admin flag and their restaurants with roles.
// No ids of sessions, no tokens.

export const GET: APIRoute = async ({ locals }) => {
  const api = panelApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const memberships = await getMemberships(api.db, api.staff.accountId);
  return jsonResponse({
    email: api.staff.email,
    displayName: api.staff.displayName,
    isPlatformAdmin: api.staff.isPlatformAdmin,
    restaurants: memberships.map((m) => ({ id: m.restaurantId, name: m.restaurantName, role: m.role })),
  });
};
