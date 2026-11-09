import type { APIRoute } from "astro";
import { jsonResponse } from "@/lib/http";
import { panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// An event of the logged-in person's restaurant (staff-accounts, F-03): id, name, restaurant and the person's role.
// Owners and managers only (a waiter's access to events comes with S-21); an event of another restaurant, an unknown
// or malformed id and a waiter get the same 404 as a wrong link key.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, ["owner", "manager"]);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse({ event: api.event, role: api.role });
};
