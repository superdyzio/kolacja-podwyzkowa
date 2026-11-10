import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import { ownerInputProblem, parseOwnerInput } from "@/lib/platform";
import { getTeam, InviteMemberBody, inviteMember, TEAM_ROLES, teamFor, teamMessages } from "@/lib/team";
import type { TeamAnswerDto } from "@/types";

export const prerender = false;

// The restaurant's team (restaurant-team, S-12), owners and managers only (a waiter, another restaurant's staff, an
// unknown or malformed id: the guard's identical 404). GET → the whole team. POST { email, name?, role } → the person
// joins the team → 201 with the team and the invitation (a 7-day link, or none when the e-mail already has an
// account). An owner invites managers and waiters, a manager waiters; any other role → the identical 404 (decided by
// the database under a lock on the restaurant row). A member already in the team → 409; an account without a password
// that also belongs to another restaurant (or the platform) → 409 (it joins once it has set its password).

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, TEAM_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const answer: TeamAnswerDto = {
    team: await getTeam(api.db, api.restaurant.id, { accountId: api.staff.accountId, role: api.role }),
  };
  return jsonResponse(answer);
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, TEAM_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, InviteMemberBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const person = parseOwnerInput({ email: body.data.email, name: body.data.name });
  if (!person.ok) {
    return jsonError(400, ownerInputProblem(person.reason, locals.locale));
  }
  const result = await inviteMember(api.db, api.restaurant.id, api.staff.accountId, {
    email: person.email,
    displayName: person.displayName,
    role: body.data.role,
  });
  if (result.status === "already-member") {
    return jsonError(409, teamMessages(locals.locale).alreadyMember);
  }
  if (result.status === "pending-elsewhere") {
    return jsonError(409, teamMessages(locals.locale).pendingElsewhere);
  }
  if (result.status === "not-found") {
    return denied(locals);
  }
  const answer: TeamAnswerDto = {
    team: await teamFor(api.db, api.restaurant.id, api.staff.accountId),
    invited: result.member,
  };
  return jsonResponse(answer, 201);
};
