import type { APIRoute } from "astro";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import type { RestaurantMembership } from "@/lib/auth/service";
import { denied, panelRestaurantApi, type PanelApi } from "@/lib/panel-api";
import {
  removeMember,
  setMemberRole,
  TEAM_ROLES,
  teamFor,
  teamMessages,
  UpdateMemberBody,
  type MemberChangeResult,
} from "@/lib/team";
import type { TeamAnswerDto } from "@/types";

export const prerender = false;

// One member of the restaurant's team (restaurant-team, S-12), owners and managers only. PATCH { role } changes the
// role, DELETE removes the person from the team (only the membership: their sessions and other restaurants stay, this
// restaurant closes to them on their next request). An owner acts on everyone (also other owners and themself), a
// manager on waiters only; a member outside the person's scope, a role they may not give, an unknown, foreign or
// malformed account id → the identical 404. The last owner can be neither demoted nor removed → 409. Every answer is
// the whole team as the person sees it afterwards (`team: null` when they no longer manage it).

async function answer(
  locals: App.Locals,
  api: PanelApi & RestaurantMembership,
  result: MemberChangeResult,
): Promise<Response> {
  if (result === "last-owner") {
    return jsonError(409, teamMessages(locals.locale).lastOwner);
  }
  if (result === "not-found") {
    return denied(locals);
  }
  const body: TeamAnswerDto = { team: await teamFor(api.db, api.restaurant.id, api.staff.accountId) };
  return jsonResponse(body);
}

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, TEAM_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const accountId = parseId(params.accountId);
  if (accountId === null) {
    return denied(locals);
  }
  const body = await readJsonBody(request, UpdateMemberBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await setMemberRole(api.db, api.restaurant.id, api.staff.accountId, accountId, body.data.role);
  return answer(locals, api, result);
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, TEAM_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const accountId = parseId(params.accountId);
  if (accountId === null) {
    return denied(locals);
  }
  const result = await removeMember(api.db, api.restaurant.id, api.staff.accountId, accountId);
  return answer(locals, api, result);
};
