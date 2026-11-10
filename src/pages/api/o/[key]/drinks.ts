import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import {
  AddDrinkBody,
  addDrinkItem,
  getOrderBoard,
  priceForNewLine,
  toDrinkInput,
  tooManyDrinksMessage,
} from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The drinks on the restaurant's bill (bill-drinks), organizer only — for checking the bill; guests, the TV and the
// restaurant never see them. POST { name, quantity } adds a line (priced by the venue) → 201 with the whole
// OrderBoardDto (the drinks ride on the order board; GET /orders reads them); 400 with the form's message, 409 at the
// line limit.

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddDrinkBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const input = toDrinkInput(body.data, locals.locale);
  if (!input.ok) {
    return jsonError(400, input.message);
  }
  // client-restaurant-split (FR-027): the price is the venue's — the newest of that name in the event, else 0.
  const unitPriceGrosze = await priceForNewLine(api.db, api.access.event.id, "drink", input.value.name);
  const result = await addDrinkItem(api.db, api.access.event.id, { ...input.value, unitPriceGrosze });
  if (result.status === "too-many") {
    return jsonError(409, tooManyDrinksMessage(locals.locale));
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id), 201);
};
