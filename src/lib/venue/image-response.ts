import { jsonError } from "@/lib/http";
import type { DbClient } from "@/lib/supabase-client";
import { getPlanImage } from "./service";

// The plan image as an HTTP response, shared by the organizer and TV image routes. The type is the one sniffed at
// upload (never the uploader's header) and `nosniff` stops browsers from guessing another one. The middleware adds
// `Cache-Control: no-store`; views put the plan version into the URL instead of relying on caching.

export const PLAN_MISSING_MESSAGE = "Nie wgrano jeszcze planu.";

export async function planImageResponse(db: DbClient): Promise<Response> {
  const image = await getPlanImage(db);
  if (!image) {
    return jsonError(404, PLAN_MISSING_MESSAGE);
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
