import type { APIRoute } from "astro";
import { EVENT_STAFF_ROLES } from "@/lib/events";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { getPriceList, parseUnitPrice, priceMessages, SetPriceBody, setEventPrice } from "@/lib/orders";
import { panelEventApi } from "@/lib/panel-api";

export const prerender = false;

// „Cennik wydarzenia” (client-restaurant-split, FR-027: the client sees prices but never sets them). GET → the
// PriceListDto (one row per dish or drink name); PUT { kind: "dish" | "drink", name, price (as typed, „36” / „36,50”) }
// sets the price of every line of that name (any letter case) → 200 PriceListDto; 400 with the price's message, 404
// when the event has no line of that name. Owners and managers, whoever leads the event (prices are always the
// venue's); support mode reads, its PUT is refused by the guard; anyone else and an unknown event get the identical 404.

export const GET: APIRoute = async ({ locals, params }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getPriceList(api.db, api.event.id));
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = await panelEventApi(locals, params.id, EVENT_STAFF_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SetPriceBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const price = parseUnitPrice(body.data.price, locals.locale);
  if (!price.ok) {
    return jsonError(400, price.message);
  }
  const result = await setEventPrice(api.db, api.event.id, body.data.kind, body.data.name, price.grosze);
  if (result.status === "not-found") {
    return jsonError(404, priceMessages(locals.locale).notFound);
  }
  return jsonResponse(await getPriceList(api.db, api.event.id));
};
