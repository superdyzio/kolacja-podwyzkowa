import type { APIRoute } from "astro";
import { jsonError, jsonResponse, parseId } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import { issueMemberLink, TEAM_ROLES, teamFor, teamMessages } from "@/lib/team";
import type { TeamAnswerDto } from "@/types";

export const prerender = false;

// „Nowy link” for a member of the restaurant's team (restaurant-team, S-12; US-05: a lost password never locks the
// restaurant out), owners for everyone, managers for waiters. POST (no body) → the team and a one-time link: an
// invitation (7 days) while the account has no password, else a password reset (24 hours; once used it ends the
// person's other sessions); their earlier unused link stops working. A member who also belongs to another restaurant
// or is a platform administrator gets no link from here (409: the link sets the ACCOUNT's password, and whoever
// issues it could open it). Outside the scope, unknown, foreign or malformed ids → the identical 404.

export const POST: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, TEAM_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const accountId = parseId(params.accountId);
  if (accountId === null) {
    return denied(locals);
  }
  const result = await issueMemberLink(api.db, api.restaurant.id, api.staff.accountId, accountId);
  if (result.status === "elsewhere") {
    return jsonError(409, teamMessages(locals.locale).elsewhere);
  }
  if (result.status === "not-found") {
    return denied(locals);
  }
  const body: TeamAnswerDto = {
    team: await teamFor(api.db, api.restaurant.id, api.staff.accountId),
    link: result.link,
  };
  return jsonResponse(body);
};
