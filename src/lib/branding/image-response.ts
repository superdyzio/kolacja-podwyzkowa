import { jsonError, readBodyBytes } from "@/lib/http";
import type { Locale } from "@/lib/i18n/locale";
import type { DbClient } from "@/lib/supabase-client";
import { brandingMessages } from "./messages";
import { isLogoKind, MAX_LOGO_BYTES } from "./rules";
import { getLogoOfEvent, type LogoImage, type SaveLogoResult } from "./service";

// Logos as HTTP responses (event-branding, S-18), shared by the image routes of every area. The type is the one
// sniffed at upload (never the uploader's header) and `nosniff` stops browsers from guessing another one; the
// middleware adds no-store and the views put the logo version into the URL.

export function logoResponse(logo: LogoImage | null, locale: Locale = "pl"): Response {
  if (!logo) {
    return jsonError(404, brandingMessages(locale).logoMissing);
  }
  return new Response(logo.bytes, {
    status: 200,
    headers: {
      "Content-Type": logo.mimeType,
      "Content-Length": String(logo.bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// GET …/branding/logo?kind=event|restaurant for an event the area's guard opened; another kind → the same 404 as a
// missing logo.
export async function logoOfEventResponse(
  db: DbClient,
  eventId: number,
  request: Request,
  locale: Locale = "pl",
): Promise<Response> {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isLogoKind(kind)) {
    return logoResponse(null, locale);
  }
  return logoResponse(await getLogoOfEvent(db, eventId, kind), locale);
}

// Reads an uploaded logo (raw body, any Content-Type, at most 512 KiB) and saves it with `save`; answers the errors,
// or null when it was saved.
export async function uploadLogo(
  request: Request,
  locale: Locale,
  save: (bytes: Uint8Array) => Promise<SaveLogoResult>,
): Promise<Response | null> {
  const t = brandingMessages(locale);
  const body = await readBodyBytes(request, MAX_LOGO_BYTES);
  switch (body.status) {
    case "empty":
      return jsonError(400, t.logoEmpty);
    case "too-large":
      return jsonError(413, t.logoTooLarge);
    case "ok":
      break;
  }
  const result = await save(body.bytes);
  switch (result.status) {
    case "too-large":
      return jsonError(413, t.logoTooLarge);
    case "unsupported-type":
      return jsonError(415, t.logoUnsupported);
    case "saved":
      return null;
  }
}
