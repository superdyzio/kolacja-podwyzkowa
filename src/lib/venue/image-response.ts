import { jsonError } from "@/lib/http";
import type { Locale } from "@/lib/i18n/locale";
import type { DbClient } from "@/lib/supabase-client";
import { venueMessages } from "./messages";
import { getPlanImage } from "./service";

// The plan image as an HTTP response, shared by the organizer and TV image routes. The type is the one sniffed at
// upload (never the uploader's header) and `nosniff` stops browsers from guessing another one. The middleware adds
// `Cache-Control: no-store`; views put the plan version into the URL instead of relying on caching.

export async function planImageResponse(db: DbClient, locale: Locale = "pl"): Promise<Response> {
  const image = await getPlanImage(db);
  if (!image) {
    return jsonError(404, venueMessages(locale).planMissing);
  }
  return new Response(image.bytes, {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
