import type { APIRoute } from "astro";
import { jsonError } from "@/lib/http";
import { denied, panelMemberEventApi } from "@/lib/panel-api";
import {
  EXPORT_ROLES,
  exportContentType,
  exportFileName,
  exportGuestsCsv,
  exportOrdersCsv,
  getEventExport,
  parseExportFormat,
  privacyMessages,
} from "@/lib/privacy";

export const prerender = false;

// The event export (privacy-retention, S-26; FR-040): GET ?format=json|guests-csv|orders-csv (default json) → a file
// to download for the owners and managers of the event's restaurant. Members only (panelMemberEventApi): the platform
// administrator — in support mode too — gets the identical 404 and no log row (a bulk copy of guests' health data is
// never part of support). The guard deletes an expired event's guests first, so the file never carries them. No ids,
// keys, tokens or hashes. An unknown format → 400; a waiter, another restaurant's event, a template and unknown or
// malformed ids → the identical 404. No-store comes from the middleware.
export const GET: APIRoute = async ({ locals, params, url }) => {
  const api = await panelMemberEventApi(locals, params.id, EXPORT_ROLES);
  if (api instanceof Response) {
    return api;
  }
  const format = parseExportFormat(url.searchParams.get("format"));
  if (!format) {
    return jsonError(400, privacyMessages(locals.locale).exportFormatInvalid);
  }
  const data = await getEventExport(api.db, api.event.restaurantId, api.event.id, new Date());
  if (!data) {
    return denied(locals);
  }
  const body =
    format === "json"
      ? JSON.stringify(data, null, 2)
      : format === "guests-csv"
        ? exportGuestsCsv(data, locals.locale)
        : exportOrdersCsv(data, locals.locale);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": exportContentType(format),
      "Content-Disposition": `attachment; filename="${exportFileName(api.event.id, data.event.date, format)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
