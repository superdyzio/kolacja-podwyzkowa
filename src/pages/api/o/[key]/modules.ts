import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { getEventModules, MODULE_CODES, modulesMessages, SetModuleEnabledBody, setModuleEnabled } from "@/lib/modules";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The client's modules (event-modules, S-17; FR-031, US-07): GET → EventModulesDto (every module with the venue's
// offer, the client's switch, the paid lock and whether it works); PUT { module, enabled } (strict) → 200 the whole
// DTO; switching on a module the venue does not offer → 409 `module-unavailable`, a paid module the administrator has
// not unlocked → 409 `module-locked`; switching off always works and deletes nothing. While the venue leads the
// middleware answers the PUT with 409 (the staff switch it through the panel's dispatcher then).

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const modules = await getEventModules(api.db, api.access.event.id);
  return modules ? jsonResponse(modules) : jsonError(404, noAccessMessages(locals.locale).title);
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SetModuleEnabledBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await setModuleEnabled(api.db, api.access.event.id, body.data.module, body.data.enabled);
  const t = modulesMessages(locals.locale);
  switch (result.status) {
    case "updated":
      return jsonResponse(result.modules);
    case "unavailable":
      return jsonError(409, t.unavailable, { code: MODULE_CODES.unavailable, module: body.data.module });
    case "locked":
      return jsonError(409, t.locked, { code: MODULE_CODES.locked, module: body.data.module });
    case "not-found":
      return jsonError(404, noAccessMessages(locals.locale).title);
  }
};
