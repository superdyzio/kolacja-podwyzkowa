import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { denied, panelRestaurantApi } from "@/lib/panel-api";
import {
  CreateTemplateBody,
  createVenueTemplate,
  listVenueTemplates,
  parseTemplateName,
  templateNameProblemText,
} from "@/lib/templates";
import type { TemplateListAnswerDto } from "@/types";

export const prerender = false;

// A restaurant's venue templates (venue-templates, S-15; FR-030), owners and managers (a waiter, another restaurant's
// staff, an unknown or malformed id: the guard's identical 404; the platform administrator in support mode reads the
// list only). GET → { templates }. POST { name, sourceEventId? } → a new template, empty or with a copy of the room of
// an event of THIS restaurant (another restaurant's, an unknown or a template's id as an event → the same 404) → 201
// { templates, template }; 400 with the name rule's message.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const answer: TemplateListAnswerDto = { templates: await listVenueTemplates(api.db, api.restaurant.id) };
  return jsonResponse(answer);
};

export const POST: APIRoute = async ({ request, locals, params }) => {
  const api = await panelRestaurantApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, CreateTemplateBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const name = parseTemplateName(body.data.name);
  if (!name.ok) {
    return jsonError(400, templateNameProblemText(name.reason, locals.locale));
  }
  const created = await createVenueTemplate(api.db, api.restaurant.id, name.name, body.data.sourceEventId ?? null);
  if (created.status !== "created") {
    return denied(locals);
  }
  const answer: TemplateListAnswerDto = {
    templates: await listVenueTemplates(api.db, api.restaurant.id),
    template: created.template,
  };
  return jsonResponse(answer, 201);
};
