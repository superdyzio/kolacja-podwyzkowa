import { noAccessMessages } from "@/lib/access/messages";
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { getGuestState } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { countGuests, parseAmount, placeLimit, readPlaceField, submitGuestGuess } from "@/lib/guesses";
import { guessMessages, placeMessages } from "@/lib/guesses/messages";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { guestModulesOf } from "@/lib/modules/rules";

export const prerender = false;

// PUT { amount, place? }: the guest saves or changes their OWN guess (S-06, FR-017), the amount as typed
// ("1 499,99 zł"), and (guess-place) optionally the prediction of their own final place as typed: "" or null clears
// it, a missing `place` keeps the stored one (phones still on the old page send only the amount); above the number of
// guests → 400 naming the range, with `field: "place"` so the phone shows it under the place input.
// The guest is the key's owner (access.guest.id) — the body names nobody, and any extra field (e.g. a guest id) is
// refused. 200 answers with the guest's whole live state (GuestStateDto, new version), so the phone shows the saved
// guess at once (NFR-001); 409 once the organizer has closed intake (checked atomically in the DB).

const PLACE_FIELD = { field: "place" };

const SaveGuessBody = z.strictObject({ amount: z.string().max(40), place: z.string().max(10).nullable().optional() });

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, SaveGuessBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const parsed = parseAmount(body.data.amount, locals.locale);
  if (!parsed.ok) {
    return jsonError(400, parsed.message);
  }

  // Here only the format; the upper bound (the number of guests) is checked by the service, which counts them.
  const place = readPlaceField(body.data.place);
  if (place === "invalid") {
    return jsonError(
      400,
      placeMessages(locals.locale).range(placeLimit(await countGuests(api.db, api.access.event.id))),
      PLACE_FIELD,
    );
  }

  const { guest } = api.access;
  const result = await submitGuestGuess(api.db, api.access.event.id, guest.id, parsed.grosze, place);
  switch (result.status) {
    case "place-out-of-range":
      return jsonError(400, placeMessages(locals.locale).range(result.maxPlace), PLACE_FIELD);
    case "closed":
      return jsonError(409, guessMessages(locals.locale).intakeClosed);
    case "not-found":
      return jsonError(404, noAccessMessages(locals.locale).title);
    case "saved":
      return jsonResponse(
        await getGuestState(api.db, api.access.event.id, guest, guestModulesOf(api.access.event.modules)),
      );
  }
};
