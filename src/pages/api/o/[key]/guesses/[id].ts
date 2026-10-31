import type { APIRoute } from "astro";
import { z } from "astro/zod";
import {
  GUESS_GUEST_NOT_FOUND_MESSAGE,
  deleteGuess,
  getGuessBoard,
  parseAmount,
  saveGuessByOrganizer,
} from "@/lib/guesses";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// PUT { amount }: the organizer enters or corrects a guest's guess (S-06, FR-018) — also after intake is closed; the
// amount as typed ("1 499,99 zł"). DELETE: removes the guest's guess (undoing a mistake). Both answer with the whole
// GuessBoardDto; an unknown guest is 404.

const SaveGuessBody = z.strictObject({ amount: z.string().max(40) });

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, GUESS_GUEST_NOT_FOUND_MESSAGE);
  }
  const body = await readJsonBody(request, SaveGuessBody);
  if (!body.ok) {
    return body.response;
  }
  const parsed = parseAmount(body.data.amount);
  if (!parsed.ok) {
    return jsonError(400, parsed.message);
  }

  const result = await saveGuessByOrganizer(api.db, id, parsed.grosze);
  if (result.status === "not-found") {
    return jsonError(404, GUESS_GUEST_NOT_FOUND_MESSAGE);
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
    return jsonError(404, GUESS_GUEST_NOT_FOUND_MESSAGE);
  }

  const result = await deleteGuess(api.db, id);
  if (result.status === "not-found") {
    return jsonError(404, GUESS_GUEST_NOT_FOUND_MESSAGE);
  }
  return jsonResponse(await getGuessBoard(api.db));
};
