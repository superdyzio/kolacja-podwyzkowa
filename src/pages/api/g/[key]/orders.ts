import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { getGuestState } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { guestOrderMessages, markGuestPiece, MAX_QUANTITY } from "@/lib/orders";

export const prerender = false;

// PUT { lineId, piece, delivered } (guest-delivered): the guest marks ONE piece of an order line as arrived, or undoes
// a guest's mark. Only their own lines and the lines for the middle of the table they sit at in the latest published
// seating — checked in the DB under a lock on the line (set_order_pieces), never trusted from the body; the guest is
// the key's owner (access.guest.id). A piece the organizer marked stays. 200 answers with the guest's whole live
// state (GuestStateDto, new version); 409 when the line is no longer theirs, the piece no longer exists or the
// organizer's mark is in the way (the phone shows the message and re-reads its state).

const MarkPieceBody = z.strictObject({
  lineId: z.number().int().positive(),
  piece: z.number().int().min(1).max(MAX_QUANTITY),
  delivered: z.boolean(),
});

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, MarkPieceBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const t = guestOrderMessages(locals.locale);
  const { guest } = api.access;
  const { lineId, piece, delivered } = body.data;
  const result = await markGuestPiece(api.db, api.access.event.id, guest.id, lineId, piece, delivered);
  switch (result.status) {
    case "not-found":
      return jsonError(409, t.itemGone);
    case "out-of-range":
      return jsonError(409, t.pieceGone);
    case "marked-by-organizer":
      return jsonError(409, t.markedByOrganizer);
    case "marked":
      return jsonResponse(await getGuestState(api.db, api.access.event.id, guest));
  }
};
