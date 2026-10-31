import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { getGuessBoard, parseAmount, setCorrectAmount, setGuessIntakeOpen } from "@/lib/guesses";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// GET: the organizer's guesses page (S-06, FR-018, FR-020) — every guest with their guess, who is missing, and the
// ranking once the correct amount is set. PATCH { intakeOpen?, correctAmount? }: close or reopen guess intake
// (FR-019) and/or set the correct amount as typed ("5 000,00 zł"; null clears it). Both answer with the whole
// GuessBoardDto. Organizer only: guesses of others and the ranking never reach the TV or guests.

const UpdateGuessesBody = z
  .strictObject({
    intakeOpen: z.boolean().optional(),
    correctAmount: z.string().max(40).nullable().optional(),
  })
  .refine((body) => body.intakeOpen !== undefined || body.correctAmount !== undefined);

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getGuessBoard(api.db));
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, UpdateGuessesBody);
  if (!body.ok) {
    return body.response;
  }
  const { intakeOpen, correctAmount } = body.data;

  // Validate everything before writing anything.
  let correctGrosze: number | null | undefined;
  if (typeof correctAmount === "string") {
    const parsed = parseAmount(correctAmount);
    if (!parsed.ok) {
      return jsonError(400, parsed.message);
    }
    correctGrosze = parsed.grosze;
  } else {
    correctGrosze = correctAmount;
  }

  if (intakeOpen !== undefined) {
    await setGuessIntakeOpen(api.db, intakeOpen);
  }
  if (correctGrosze !== undefined) {
    await setCorrectAmount(api.db, correctGrosze);
  }
  return jsonResponse(await getGuessBoard(api.db));
};
