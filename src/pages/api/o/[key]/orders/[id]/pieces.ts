import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { getOrderBoard, markOrderPieces, MAX_QUANTITY, orderMessages } from "@/lib/orders";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// One piece of an order line (guest-delivered), organizer only. PUT { piece, delivered } marks that piece as served
// by the organizer (a piece someone already marked keeps its first mark) or removes anyone's mark → the whole board.
// 404 for an unknown line, 409 when the line has fewer pieces now (the board is re-read). The whole line stays
// PATCH /orders/<id> { delivered }.

const PieceBody = z.strictObject({
  piece: z.number().int().min(1).max(MAX_QUANTITY),
  delivered: z.boolean(),
});

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const t = orderMessages(locals.locale);
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, t.itemNotFound);
  }
  const body = await readJsonBody(request, PieceBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await markOrderPieces(api.db, api.access.event.id, id, [body.data.piece], body.data.delivered);
  switch (result.status) {
    case "not-found":
      return jsonError(404, t.itemNotFound);
    case "out-of-range":
    case "marked-by-organizer":
      return jsonError(409, t.pieceOutOfRange);
    case "marked":
      return jsonResponse(await getOrderBoard(api.db, api.access.event.id));
  }
};
