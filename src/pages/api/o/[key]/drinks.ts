import type { APIRoute } from "astro";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { AddDrinkBody, addDrinkItem, getOrderBoard, toDrinkInput, tooManyDrinksMessage } from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The drinks on the restaurant's bill (bill-drinks), organizer only — for checking the bill; guests, the TV and the
// restaurant never see them. POST { name, price (as typed, „14,50”), quantity } adds a line → 201 with the whole
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
  const result = await addDrinkItem(api.db, api.access.event.id, input.value);
  if (result.status === "too-many") {
    return jsonError(409, tooManyDrinksMessage(locals.locale));
  }
  return jsonResponse(await getOrderBoard(api.db, api.access.event.id), 201);
};
