import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { jsonError } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// The full „Reset danych” moved to the venue's panel (client-restaurant-split, FR-028:
// /api/panel/events/<id>/reset); the client link keeps „Reset prób” (/api/o/<key>/trial-reset). Every method answers
// the guard's identical denial, so the old address tells nothing.

function deniedForClient({ locals }: Parameters<APIRoute>[0]): Response {
  const api = organizerApi(locals);
  return api instanceof Response ? api : jsonError(404, noAccessMessages(locals.locale).title);
}

export const GET: APIRoute = deniedForClient;
export const POST: APIRoute = deniedForClient;
