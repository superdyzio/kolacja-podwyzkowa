import type { APIRoute } from "astro";
import { getGuestState, getGuestStateVersion } from "@/lib/guest-links";
import { guestApi } from "@/lib/guest-api";
import { jsonResponse } from "@/lib/http";

export const prerender = false;

// GET ?since=<version>: what the guest's phone shows (S-05, FR-013, NFR-003 polling) — their current name, their
// seat in the latest PUBLISHED arrangement and (S-06) the guess intake flag with their own guess. When `since` equals
// the current version the answer is 204 with no body (three tiny parallel queries after the middleware's key
// lookup); otherwise 200 with the whole GuestStateDto, whose `version` the phone sends back next time. Nothing about
// other guests, the correct amount or the ranking; access off or a revoked key is the middleware's 404.

const MAX_VERSION_LENGTH = 64;

export const GET: APIRoute = async ({ locals, url }) => {
  const api = guestApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const { guest } = api.access;
  const since = url.searchParams.get("since");
  if (since !== null && since.length <= MAX_VERSION_LENGTH && since === (await getGuestStateVersion(api.db, guest))) {
    return new Response(null, { status: 204 });
  }
  return jsonResponse(await getGuestState(api.db, guest));
};
