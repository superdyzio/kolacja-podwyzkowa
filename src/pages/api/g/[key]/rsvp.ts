import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { getGuestState } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { guestModulesOf } from "@/lib/modules/rules";
import { GuestRsvpBody, RSVP_CODES, rsvpMessages, submitGuestRsvp } from "@/lib/rsvp";

export const prerender = false;

// PUT { attending: boolean, dish: string | null } (strict): the guest answers for THEMSELF (guest-rsvp-menu, S-25;
// FR-039) — the guest is the key's owner (access.guest.id); the body names nobody. „No” marks them absent (the draw
// and the publish skip them); a dish only with „yes”, one of the options shown on the phone (else 400
// `dish-not-offered`). Only while RSVP is on and before the deadline (checked atomically in the DB) → else 409
// `rsvp-closed`. 200 answers the guest's whole live state (GuestStateDto, new version).

export const PUT: APIRoute = async ({ locals, request }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, GuestRsvpBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const { guest } = api.access;
  const t = rsvpMessages(locals.locale);
  const result = await submitGuestRsvp(api.db, api.access.event.id, guest.id, body.data.attending, body.data.dish);
  switch (result.status) {
    case "closed":
      return jsonError(409, t.closed, { code: RSVP_CODES.closed });
    case "not-offered":
      return jsonError(400, t.notOffered, { code: RSVP_CODES.notOffered });
    case "not-found":
      return jsonError(404, noAccessMessages(locals.locale).title);
    case "saved":
      return jsonResponse(
        await getGuestState(api.db, api.access.event.id, guest, guestModulesOf(api.access.event.modules)),
      );
  }
};
