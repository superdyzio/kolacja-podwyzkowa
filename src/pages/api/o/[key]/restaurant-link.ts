import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// „Wymień link” of the restaurant's tablet moved to the venue's panel (client-restaurant-split, FR-025:
// POST /api/panel/events/<id>/links/restaurant); the client link answers the guard's identical denial.
export const POST: APIRoute = ({ locals }) => {
  const api = organizerApi(locals);
  return api instanceof Response ? api : jsonError(404, noAccessMessages(locals.locale).title);
};
