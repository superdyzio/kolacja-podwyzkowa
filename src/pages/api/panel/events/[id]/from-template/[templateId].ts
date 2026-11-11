import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonResponse } from "@/lib/http";
import { denied, panelEventApi, parseIntId } from "@/lib/panel-api";
import { applyVenueTemplate, previewTemplateUpdate } from "@/lib/templates";
import type { TemplateUpdateAnswerDto } from "@/types";

export const prerender = false;

// „Zaktualizuj z szablonu” (venue-templates, S-15; FR-030, US-06): owners and managers of the event's restaurant.
// GET → { preview } (what would change and WHO LOSES A SEAT — the confirm names them); POST → replaces the event's
// room with the template's in one transaction (match by name) → { result, preview } (the fresh preview after it). The
// published seating is untouched: the TV and phones change after the next „Opublikuj”. Allowed whoever leads the event
// („Lokal prowadzi” or not): FR-030 gives it to the manager, the room is the venue's. A template of another
// restaurant, swapped ids (a template as the event, an event as the template), unknown or malformed ids → the
// identical 404; the platform administrator in support mode may read the preview only.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const templateId = parseIntId(params.templateId);
  const preview =
    templateId === null ? null : await previewTemplateUpdate(api.db, api.event.restaurantId, api.event.id, templateId);
  if (!preview) {
    return denied(locals);
  }
  const answer: TemplateUpdateAnswerDto = { preview };
  return jsonResponse(answer);
};

export const POST: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const templateId = parseIntId(params.templateId);
  if (templateId === null) {
    return denied(locals);
  }
  const applied = await applyVenueTemplate(api.db, api.event.restaurantId, api.event.id, templateId);
  const preview =
    applied.status === "applied"
      ? await previewTemplateUpdate(api.db, api.event.restaurantId, api.event.id, templateId)
      : null;
  if (applied.status !== "applied" || !preview) {
    return denied(locals);
  }
  const answer: TemplateUpdateAnswerDto = { preview, result: applied.result };
  return jsonResponse(answer);
};
