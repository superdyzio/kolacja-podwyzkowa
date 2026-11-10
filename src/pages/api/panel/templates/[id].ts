import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelTemplateApi } from "@/lib/panel-api";
import {
  deleteVenueTemplate,
  getVenueTemplate,
  parseTemplateName,
  renameVenueTemplate,
  templateNameProblemText,
  UpdateTemplateBody,
} from "@/lib/templates";
import type { TemplateAnswerDto } from "@/types";

export const prerender = false;

// One venue template of the person's restaurant (venue-templates, S-15), owners and managers through the template
// guard (an event's id, another restaurant's template, an unknown or malformed id, a waiter: the identical 404; the
// platform administrator in support mode reads only). GET → { template, restaurantId }; PATCH { name } → the same;
// DELETE → the template and its room (events created from it keep their own copies) → { deleted, restaurantId }.

async function answer(api: Exclude<Awaited<ReturnType<typeof panelTemplateApi>>, Response>, locals: App.Locals) {
  const template = await getVenueTemplate(api.db, api.restaurant.id, api.template.id);
  if (!template) {
    return denied(locals);
  }
  const body: TemplateAnswerDto = { template, restaurantId: api.restaurant.id };
  return jsonResponse(body);
}

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelTemplateApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return answer(api, locals);
};

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const api = await panelTemplateApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, UpdateTemplateBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const name = parseTemplateName(body.data.name);
  if (!name.ok) {
    return jsonError(400, templateNameProblemText(name.reason, locals.locale));
  }
  if ((await renameVenueTemplate(api.db, api.restaurant.id, api.template.id, name.name)) !== "updated") {
    return denied(locals);
  }
  return answer(api, locals);
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = await panelTemplateApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  if ((await deleteVenueTemplate(api.db, api.restaurant.id, api.template.id)) !== "deleted") {
    return denied(locals);
  }
  return jsonResponse({ deleted: true, restaurantId: api.restaurant.id });
};
