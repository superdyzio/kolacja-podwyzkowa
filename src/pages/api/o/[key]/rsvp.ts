import type { APIRoute } from "astro";
import { noAccessMessages } from "@/lib/access/messages";
import { localInputToInstant } from "@/lib/events/dates";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";
import { getRsvpBoard, parseOptionNames, RsvpSettingsBody, rsvpMessages, updateRsvpSettings } from "@/lib/rsvp";

export const prerender = false;

// The guests' RSVP (guest-rsvp-menu, S-25; FR-039): GET → RsvpBoardDto (the deadline, the client's dish options and
// what the event's menu offers, the counts, every guest's answer). PATCH { deadline?, close?, options? } (strict, at
// least one field): `deadline` typed in Warsaw time ("YYYY-MM-DDTHH:MM"; null turns RSVP off), `close: true` closes
// the answers now (not together with `deadline`), `options` = dish names on the event's menu (≤ 12, [] = none) → the
// whole board; 400 with the rule's message. A client route: while the venue leads the middleware answers the PATCH
// with 409 and the staff use the panel's dispatcher (…/klient/rsvp).

export const GET: APIRoute = async ({ locals }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const board = await getRsvpBoard(api.db, api.access.event.id, new Date());
  return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locals.locale).title);
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, RsvpSettingsBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const t = rsvpMessages(locals.locale);
  const { deadline, close, options } = body.data;
  if (close && deadline !== undefined) {
    return jsonError(400, t.closeAndDeadline);
  }
  let instant: string | null | undefined = undefined;
  if (typeof deadline === "string") {
    instant = localInputToInstant(deadline);
    if (instant === null) {
      return jsonError(400, t.deadlineInvalid);
    }
  } else if (deadline === null) {
    instant = null;
  }
  let names: string[] | undefined;
  if (options !== undefined) {
    const parsed = parseOptionNames(options, locals.locale);
    if (!parsed.ok) {
      return jsonError(400, parsed.message);
    }
    names = parsed.names;
  }
  const now = new Date();
  const result = await updateRsvpSettings(
    api.db,
    api.access.event.id,
    { deadline: instant, close: close === true, options: names },
    now,
  );
  switch (result.status) {
    case "not-on-menu":
      return jsonError(400, t.notOnMenu(result.name));
    case "not-found":
      return jsonError(404, noAccessMessages(locals.locale).title);
    case "updated": {
      const board = await getRsvpBoard(api.db, api.access.event.id, now);
      return board ? jsonResponse(board) : jsonError(404, noAccessMessages(locals.locale).title);
    }
  }
};
