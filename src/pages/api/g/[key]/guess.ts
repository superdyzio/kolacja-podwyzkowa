import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { getGuestState } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { GUESS_INTAKE_CLOSED_MESSAGE, parseAmount, submitGuestGuess } from "@/lib/guesses";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";

export const prerender = false;

// PUT { amount }: the guest saves or changes their OWN guess (S-06, FR-017), the amount as typed ("1 499,99 zł").
// The guest is the key's owner (access.guest.id) — the body names nobody, and any extra field (e.g. a guest id) is
// refused. 200 answers with the guest's whole live state (GuestStateDto, new version), so the phone shows the saved
// guess at once (NFR-001); 409 once the organizer has closed intake (checked atomically in the DB).

const SaveGuessBody = z.strictObject({ amount: z.string().max(40) });

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SaveGuessBody);
  if (!body.ok) {
    return body.response;
  }
  const parsed = parseAmount(body.data.amount);
  if (!parsed.ok) {
    return jsonError(400, parsed.message);
  }

  const { guest } = api.access;
  const result = await submitGuestGuess(api.db, guest.id, parsed.grosze);
  switch (result.status) {
    case "closed":
      return jsonError(409, GUESS_INTAKE_CLOSED_MESSAGE);
    case "not-found":
      return jsonError(404, "Brak dostępu");
    case "saved":
      return jsonResponse(await getGuestState(api.db, guest));
  }
};
