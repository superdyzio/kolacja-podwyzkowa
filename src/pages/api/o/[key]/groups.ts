import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createGroup, getGuestList, guestsMessages, MAX_GROUP_SIZE, MIN_GROUP_SIZE } from "@/lib/guests";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// POST { guestIds }: create an inseparable group of 2–5 guests who are not in a group yet (FR-002).

const CreateGroupBody = z.strictObject({ guestIds: z.array(z.number().int().positive()).max(20) });

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, CreateGroupBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }

  const messages = guestsMessages(locals.locale);
  const result = await createGroup(api.db, api.access.event.id, body.data.guestIds);
  switch (result.status) {
    case "invalid-size":
      return jsonError(400, messages.groupSize(MIN_GROUP_SIZE, MAX_GROUP_SIZE));
    case "not-found":
      return jsonError(404, messages.guestNotFound);
    case "already-grouped":
      return jsonError(409, messages.alreadyGrouped);
    case "created":
      return jsonResponse(await getGuestList(api.db, api.access.event.id), 201);
  }
};
