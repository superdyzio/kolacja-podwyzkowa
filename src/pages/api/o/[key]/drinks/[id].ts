import type { APIRoute } from "astro";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import {
  deleteDrinkItem,
  drinkMessages,
  getOrderBoard,
  priceForRenamedLine,
  toDrinkPatch,
  UpdateDrinkBody,
  updateDrinkItem,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// One drink line of the bill (bill-drinks), organizer only. PATCH any subset of { name, quantity } → the
// board; DELETE → the board. 404 for an unknown line, 400 with the form's message.

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, drinkMessages(locals.locale).notFound);
  }
  const body = await readJsonBody(request, UpdateDrinkBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const patch = toDrinkPatch(body.data, locals.locale);
  if (!patch.ok) {
    return jsonError(400, patch.message);
  }
  // client-restaurant-split (FR-027): a drink renamed to another name takes that name's price (else 0).
  const repriced =
    patch.value.name === undefined
      ? null
      : await priceForRenamedLine(api.db, api.access.event.id, "drink", id, patch.value.name);
  const result = await updateDrinkItem(api.db, api.access.event.id, id, {
    ...patch.value,
    ...(repriced === null ? {} : { unitPriceGrosze: repriced }),
  });
  if (result.status === "not-found") {
    return jsonError(404, drinkMessages(locals.locale).notFound);
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, drinkMessages(locals.locale).notFound);
  }
  const result = await deleteDrinkItem(api.db, api.access.event.id, id);
  if (result.status === "not-found") {
    return jsonError(404, drinkMessages(locals.locale).notFound);
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
};
