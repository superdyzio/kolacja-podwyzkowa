import type { APIRoute } from "astro";
import { z } from "astro/zod";
import {
  countGuests,
  deleteGuess,
  getGuessBoard,
  guessMessages,
  parseAmount,
  placeLimit,
  placeMessages,
  readPlaceField,
  saveGuessByOrganizer,
} from "@/lib/guesses";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// PUT { amount, place? }: the organizer enters or corrects a guest's guess (S-06, FR-018) — also after intake is
// closed; the amount as typed ("1 499,99 zł") and (guess-place) optionally the guest's place prediction as typed: ""
// or null clears it, a missing `place` keeps the stored one, above the number of guests → 400 naming the range.
// DELETE: removes the guest's guess (undoing a mistake). Both answer with the whole GuessBoardDto; an unknown guest
// is 404.

const SaveGuessBody = z.strictObject({ amount: z.string().max(40), place: z.string().max(10).nullable().optional() });

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, guessMessages(locals.locale).guestNotFound);
  }
  const body = await readJsonBody(request, SaveGuessBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const parsed = parseAmount(body.data.amount, locals.locale);
  if (!parsed.ok) {
    return jsonError(400, parsed.message);
  }

  const place = readPlaceField(body.data.place);
  if (place === "invalid") {
    return jsonError(400, placeMessages(locals.locale).range(placeLimit(await countGuests(api.db))));
  }

  const result = await saveGuessByOrganizer(api.db, id, parsed.grosze, place);
  if (result.status === "not-found") {
    return jsonError(404, guessMessages(locals.locale).guestNotFound);
  }
  if (result.status === "place-out-of-range") {
    return jsonError(400, placeMessages(locals.locale).range(result.maxPlace));
  }
  return jsonResponse(await getGuessBoard(api.db));
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, guessMessages(locals.locale).guestNotFound);
  }

  const result = await deleteGuess(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, guessMessages(locals.locale).guestNotFound);
  }
  return jsonResponse(await getGuessBoard(api.db));
};
