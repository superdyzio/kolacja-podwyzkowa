import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { guestsMessages } from "@/lib/guests";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getRsvpBoard, RSVP_CODES, RsvpAnswerBody, rsvpMessages, saveRsvpByOrganizer } from "@/lib/rsvp";

export const prerender = false;

// PUT { attending: true | false | null, dish: string | null } (strict): the client (or the staff through the panel's
// dispatcher) enters or changes a guest's answer — also after the deadline and while RSVP is off. null = „no answer”
// (the answer removed, the guest present again); „no” marks the guest absent (the same flag as the guest list); a dish
// only with „yes”, one of the options the event's menu offers (else 400 `dish-not-offered`). Answers the whole board.
// A malformed, unknown or another event's guest id → the same 404 as the guest routes.

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const notFound = guestsMessages(locals.locale).guestNotFound;
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, notFound);
  }
  const body = await readJsonBody(request, RsvpAnswerBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const result = await saveRsvpByOrganizer(api.db, api.access.event.id, id, body.data.attending, body.data.dish);
  switch (result.status) {
    case "not-found":
      return jsonError(404, notFound);
    case "not-offered":
      return jsonError(400, rsvpMessages(locals.locale).notOffered, { code: RSVP_CODES.notOffered });
    case "saved": {
      const board = await getRsvpBoard(api.db, api.access.event.id, new Date());
      return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locals.locale).title);
    }
  }
};
