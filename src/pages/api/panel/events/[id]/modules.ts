import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonResponse, readJsonBody } from "@/lib/http";
import { getEventModules, SetModuleAvailableBody, setModuleAvailable } from "@/lib/modules";
import { denied, panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// The venue's module offer for one event (event-modules, S-17; FR-031: „lokal oznacza, które moduły mogą być
// dostępne”). Owners and managers, whoever leads the event (the offer is the venue's, like prices); support mode reads,
// its PUT is refused by the guard. GET → EventModulesDto; PUT { module, available } (strict) → 200 the whole DTO.
// Withdrawing keeps the client's switch, so offering again brings the module back as the client left it. A waiter,
// another restaurant's event and unknown or malformed ids → the identical 404.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const modules = await getEventModules(api.db, api.event.id);
  return modules ? jsonResponse(modules) : denied(locals);
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SetModuleAvailableBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await setModuleAvailable(
    api.db,
    api.event.restaurantId,
    api.event.id,
    body.data.module,
    body.data.available,
  );
  return result.status === "updated" ? jsonResponse(result.modules) : denied(locals);
};
