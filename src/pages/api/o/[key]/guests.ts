import type { APIRoute } from "astro";
import { z } from "astro/zod";
import {
  addGuests,
  describeGuestListProblem,
  getGuestList,
  MAX_GUESTS,
  parseGuestList,
  quoteNames,
} from "@/lib/guests";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// GET: the whole guest list. POST { text }: add guests from a pasted list (one per line) or a single name.
// Adding is all-or-nothing: any problem saves nothing and the answer says what to fix.

const AddGuestsBody = z.strictObject({ text: z.string().max(20_000) });

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  return jsonResponse(await getGuestList(api.db));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, AddGuestsBody);
  if (!body.ok) {
    return body.response;
  }

  const parsed = parseGuestList(body.data.text);
  if (parsed.problems.length > 0) {
    return jsonError(400, "Popraw listę — nic nie zostało dodane.", {
      problems: parsed.problems.map(describeGuestListProblem),
    });
  }
  if (parsed.names.length === 0) {
    return jsonError(400, "Wpisz co najmniej jedno imię.");
  }

  const result = await addGuests(api.db, parsed.names);
  switch (result.status) {
    case "duplicates":
      return jsonError(409, `Już są na liście: ${quoteNames(result.names)}. Nic nie zostało dodane.`, {
        names: result.names,
      });
    case "too-many":
      return jsonError(
        400,
        `Lista może mieć najwyżej ${MAX_GUESTS} gości (jest już ${result.existing}). Nic nie zostało dodane.`,
      );
    case "added":
      return jsonResponse({ added: result.added.length, ...(await getGuestList(api.db)) }, 201);
  }
};
