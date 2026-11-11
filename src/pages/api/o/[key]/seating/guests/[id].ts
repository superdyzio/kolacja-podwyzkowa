import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import {
  getSeatingBoard,
  guestPinnedMessage,
  seatGuest,
  seatOutOfRangeMessage,
  seatPinnedMessage,
  seatingMessages,
  setPinned,
  unseatGuest,
} from "@/lib/seating";
import { venueMessages } from "@/lib/venue";

export const prerender = false;

// The seat of one guest in the working arrangement (FR-004, FR-007). Every answer carries the whole board.
// PUT { tableId, seat }: seat the guest there — empty seat → move, taken seat → swap (or, for a guest without a
//   seat, the occupant becomes unseated). Pinned guests are never moved or displaced (409).
// PATCH { pinned }: pin the seated guest to their seat, or unpin.
// DELETE: free the guest's seat (a pinned guest must be unpinned first).

const SeatBody = z.strictObject({
  tableId: z.number().int().positive(),
  seat: z.number().int().positive().max(1_000),
});

const PinBody = z.strictObject({ pinned: z.boolean() });

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const guestId = parseId(params.id);
  if (guestId === null) {
    return jsonError(404, seatingMessages(locals.locale).guestNotFound);
  }
  const body = await readJsonBody(request, SeatBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const result = await seatGuest(api.db, api.access.event.id, guestId, body.data.tableId, body.data.seat);
  switch (result.status) {
    case "guest-not-found":
      return jsonError(404, seatingMessages(locals.locale).guestNotFound);
    case "table-not-found":
      return jsonError(404, venueMessages(locals.locale).tableNotFound);
    case "seat-out-of-range":
      return jsonError(400, seatOutOfRangeMessage(body.data.seat, locals.locale));
    case "guest-pinned":
      return jsonError(409, guestPinnedMessage(result.guestName, locals.locale));
    case "seat-pinned":
      return jsonError(409, seatPinnedMessage(result.occupantName, locals.locale));
    case "seated":
      return jsonResponse(await getSeatingBoard(api.db, api.access.event.id));
  }
};

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const guestId = parseId(params.id);
  if (guestId === null) {
    return jsonError(404, seatingMessages(locals.locale).guestNotFound);
  }
  const body = await readJsonBody(request, PinBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const result = await setPinned(api.db, api.access.event.id, guestId, body.data.pinned);
  switch (result.status) {
    case "guest-not-found":
      return jsonError(404, seatingMessages(locals.locale).guestNotFound);
    case "not-seated":
      return jsonError(409, seatingMessages(locals.locale).notSeated);
    case "updated":
      return jsonResponse(await getSeatingBoard(api.db, api.access.event.id));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const guestId = parseId(params.id);
  if (guestId === null) {
    return jsonError(404, seatingMessages(locals.locale).guestNotFound);
  }

  const result = await unseatGuest(api.db, api.access.event.id, guestId);
  switch (result.status) {
    case "guest-not-found":
      return jsonError(404, seatingMessages(locals.locale).guestNotFound);
    case "pinned":
      return jsonError(409, guestPinnedMessage(result.guestName, locals.locale));
    case "unseated":
      return jsonResponse(await getSeatingBoard(api.db, api.access.event.id));
  }
};
