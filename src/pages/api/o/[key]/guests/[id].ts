import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { DIET_TAGS, dietMessages, isDietTag, MAX_DIET_NOTE_LENGTH } from "@/lib/diets";
import { deleteGuest, describeDisplayNameProblem, getGuestList, guestsMessages, updateGuest } from "@/lib/guests";
import { jsonError, jsonResponse, parseId, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// PATCH { displayName?, isAbsent?, diets?, dietNote? }: rename, mark absent/present and/or set the diet (S-23: the whole
// set of tags, the note or null). DELETE: remove the guest (a pair they were in is dissolved). Both answer with the
// whole refreshed list. Group membership cannot be changed here.

const UpdateGuestBody = z
  .strictObject({
    displayName: z.string().max(1_000).optional(),
    isAbsent: z.boolean().optional(),
    diets: z.array(z.string().max(40)).max(DIET_TAGS.length).optional(),
    dietNote: z.string().max(1_000).nullable().optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined ||
      body.isAbsent !== undefined ||
      body.diets !== undefined ||
      body.dietNote !== undefined,
  );

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const messages = guestsMessages(locals.locale);
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, messages.guestNotFound);
  }
  const body = await readJsonBody(request, UpdateGuestBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const { diets, ...rest } = body.data;
  if (diets !== undefined && !diets.every(isDietTag)) {
    return jsonError(400, dietMessages(locals.locale).unknownTag);
  }
  const result = await updateGuest(api.db, api.access.event.id, id, {
    ...rest,
    ...(diets === undefined ? {} : { diets: diets.filter(isDietTag) }),
  });
  switch (result.status) {
    case "invalid":
      return jsonError(
        400,
        result.reason === "note-too-long"
          ? dietMessages(locals.locale).noteTooLong(MAX_DIET_NOTE_LENGTH)
          : describeDisplayNameProblem(result.reason, locals.locale),
      );
    case "duplicate":
      return jsonError(409, messages.duplicateName);
    case "not-found":
      return jsonError(404, messages.guestNotFound);
    case "updated":
      return jsonResponse(await getGuestList(api.db, api.access.event.id));
  }
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const notFound = guestsMessages(locals.locale).guestNotFound;
  const id = parseId(params.id);
  if (id === null) {
    return jsonError(404, notFound);
  }

  const result = await deleteGuest(api.db, api.access.event.id, id);
  if (result.status === "not-found") {
    return jsonError(404, notFound);
  }
  return jsonResponse(await getGuestList(api.db, api.access.event.id));
};
