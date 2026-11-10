import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { isModuleKey, isPaidModule, modulesMessages, SetModuleUnlockedBody, unlockEventModule } from "@/lib/modules";
import { denied, panelPlatformApi, parseIntId } from "@/lib/panel-api";

export const prerender = false;

// The platform administrator unlocks a paid module for one event (event-modules, S-17; FR-031, PRD Access Control:
// „odblokowywać płatne moduły wydarzenia”), or locks it again: PUT { unlocked } (strict) → 200 EventModulesDto. The one
// administrator WRITE on a restaurant's event, so it keeps S-13's rules: the DB function accepts it only inside a live
// support visit of THIS login session to the event's restaurant and appends an `unlock` / `lock` row to the owner's
// log in the same transaction; no key ever leaves. Anyone but the administrator, no support visit, a template, an
// unknown or malformed event id and an unknown module → the identical 404; a free module → 400. The middleware
// refuses a foreign Origin (403) before this runs.

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = panelPlatformApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const eventId = parseIntId(params.id);
  const module = params.module;
  if (eventId === null || !isModuleKey(module)) {
    return denied(locals);
  }
  const body = await readJsonBody(request, SetModuleUnlockedBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  if (!isPaidModule(module)) {
    return jsonError(400, modulesMessages(locals.locale).notPaid);
  }
  const result = await unlockEventModule(api.db, api.staff.sessionId, eventId, module, body.data.unlocked);
  return result.status === "not-found" ? denied(locals) : jsonResponse(result.modules);
};
