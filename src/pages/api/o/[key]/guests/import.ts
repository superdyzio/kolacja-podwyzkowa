import type { APIRoute } from "astro";
import { z } from "astro/zod";
import {
  addGuests,
  checkImportAgainstList,
  getGuestList,
  guestsMessages,
  MAX_GUESTS,
  MAX_IMPORT_TEXT_LENGTH,
  parseGuestImport,
  quoteNames,
  toImportPreview,
} from "@/lib/guests";
import { jsonError, jsonResponse, readJsonBody } from "@/lib/http";
import { organizerApi } from "@/lib/organizer-api";

export const prerender = false;

// guest-import-diets (S-23; PRD v2 FR-035): import guests from a CSV file or a spreadsheet paste (name, diet, notes).
// POST { text, preview: true } → 200 GuestImportPreviewDto: the rows to add and every problem per line, nothing saved.
// POST { text } → the save, all-or-nothing: problems → 400 with the same preview; a name added meanwhile → 409 (like
// /guests); saved → 201 { added, ...GuestListDto }. The browser decodes the file (UTF-8, else Windows-1250) and sends
// text. The staff reach this through the panel dispatcher (…/klient/guests/import) under the lead rule.

const ImportBody = z.strictObject({
  text: z.string().max(MAX_IMPORT_TEXT_LENGTH),
  preview: z.boolean().optional(),
});

export const POST: APIRoute = async ({ locals, request }) => {
  const api = organizerApi(locals);
  if (api instanceof Response) {
    return api;
  }
  const body = await readJsonBody(request, ImportBody, locals.locale);
  if (!body.ok) {
    return body.response;
  }
  const messages = guestsMessages(locals.locale);
  const eventId = api.access.event.id;

  const list = await getGuestList(api.db, eventId);
  const checked = checkImportAgainstList(
    parseGuestImport(body.data.text),
    list.guests.map((guest) => guest.displayName),
  );
  const preview = toImportPreview(checked, list.guests.length, locals.locale);
  if (body.data.preview === true) {
    return jsonResponse(preview);
  }
  if (!preview.ready) {
    return jsonError(400, messages.fixList, { ...preview });
  }

  const result = await addGuests(
    api.db,
    eventId,
    checked.rows.map((row) => ({ name: row.name, diets: row.diets, dietNote: row.note })),
  );
  switch (result.status) {
    case "duplicates":
      return jsonError(409, messages.alreadyListed(quoteNames(result.names, locals.locale)), {
        names: result.names,
      });
    case "too-many":
      return jsonError(400, messages.tooMany(MAX_GUESTS, result.existing));
    case "added":
      return jsonResponse({ added: result.added.length, ...(await getGuestList(api.db, eventId)) }, 201);
  }
};
