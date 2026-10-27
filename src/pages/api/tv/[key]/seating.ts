import type { APIRoute } from "astro";
import { accessFor } from "@/lib/access";
import { getDb } from "@/lib/db";
import { jsonError, jsonResponse } from "@/lib/http";
import { getSeatingVersion, getTvSeating } from "@/lib/seating";

export const prerender = false;

// GET ?since=<version>: what the TV shows — the latest PUBLISHED arrangement as names on tables, plus the plan
// version (NFR-003 polling). When `since` equals the current version the answer is 204 with no body (two tiny
// queries); otherwise 200 with the whole TvSeatingDto, whose `version` the TV sends back next time. Unpublished
// changes never show up here. The middleware has already checked the key; this is the second, role-specific check.

const MAX_VERSION_LENGTH = 64;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!accessFor(locals, "tv")) {
    return jsonError(404, "Brak dostępu");
  }
  const db = getDb();
  if (!db) {
    return jsonError(503, "Baza danych nie jest skonfigurowana.");
  }
  const since = url.searchParams.get("since");
  if (since !== null && since.length <= MAX_VERSION_LENGTH && since === (await getSeatingVersion(db))) {
    return new Response(null, { status: 204 });
  }
  return jsonResponse(await getTvSeating(db));
};
